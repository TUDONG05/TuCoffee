package com.tuscoffee.service;

import static com.tuscoffee.service.KnowledgeEmbeddingClient.EmbeddingFailure;
import static com.tuscoffee.service.KnowledgeTextExtractor.InvalidDocument;

import java.io.IOException;
import java.nio.charset.CharacterCodingException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Component
@ConditionalOnProperty(name = "RAG_WORKER_ENABLED", havingValue = "true")
public class KnowledgeIngestionWorker {
    private static final String LEASE_END = "TIMESTAMPADD(SECOND,180,CURRENT_TIMESTAMP(6))";
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private final KnowledgeEmbeddingClient embeddings;
    private final KnowledgeTextExtractor extractor = new KnowledgeTextExtractor();
    private final Path storageRoot;

    public KnowledgeIngestionWorker(JdbcTemplate jdbc, PlatformTransactionManager manager,
            KnowledgeEmbeddingClient embeddings,
            @Value("${knowledge.storage-root:./data/knowledge}") String storageRoot) {
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(manager);
        this.embeddings = embeddings;
        this.storageRoot = Path.of(storageRoot).toAbsolutePath().normalize();
    }

    @Scheduled(fixedDelayString = "${RAG_POLL_DELAY_MS:3000}")
    public void poll() {
        Claim claim = transaction.execute(ignored -> claim());
        if (claim == null) {
            return;
        }
        List<IndexedChunk> indexed;
        try {
            var chunks = extractor.extract(resolvePath(claim.storagePath()), claim.type());
            indexed = new ArrayList<>(chunks.size());
            for (var chunk : chunks) {
                if (!renew(claim)) {
                    return;
                }
                indexed.add(new IndexedChunk(chunk, embeddings.embed(chunk.text())));
            }
        } catch (InvalidDocument ex) {
            fail(claim, ex.getMessage(), false);
            return;
        } catch (CharacterCodingException ex) {
            fail(claim, "INVALID_UTF8", false);
            return;
        } catch (EmbeddingFailure ex) {
            fail(claim, ex.getMessage(), ex.retryable);
            return;
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            // Leave the lease for recovery after shutdown.
            return;
        } catch (IOException ex) {
            fail(claim, "DOCUMENT_OR_PROVIDER_IO", true);
            return;
        } catch (Exception ex) {
            fail(claim, "INGESTION_FAILED", true);
            return;
        }
        transaction.executeWithoutResult(ignored -> finish(claim, indexed));
    }

    private Claim claim() {
        List<Job> candidates = jdbc.query("""
                SELECT id, version_id, attempts, max_attempts
                FROM knowledge_ingestion_jobs
                WHERE (status='PENDING' AND next_attempt_at <= CURRENT_TIMESTAMP(6))
                    OR (status='PROCESSING' AND lease_expires_at <= CURRENT_TIMESTAMP(6))
                ORDER BY next_attempt_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
                """, (rs, index) -> new Job(rs.getLong(1), rs.getLong(2), rs.getInt(3), rs.getInt(4)));
        if (candidates.isEmpty()) {
            return null;
        }
        Job job = candidates.getFirst();
        var sources = jdbc.query("""
                SELECT v.document_id, v.storage_path, v.content_type, d.deleted_at IS NOT NULL AS deleted
                FROM knowledge_versions v JOIN knowledge_documents d ON d.id=v.document_id WHERE v.id=?
                """, (rs, index) -> new Source(rs.getLong(1), rs.getString(2), rs.getString(3), rs.getBoolean(4)),
                job.versionId());
        Source source = sources.getFirst();
        if (source.deleted() || job.attempts() >= job.maxAttempts()) {
            markFailure(job, source.deleted() ? "DOCUMENT_DELETED" : "LEASE_EXPIRED", false);
            return null;
        }
        String token = UUID.randomUUID().toString();
        jdbc.update("""
                UPDATE knowledge_ingestion_jobs SET status='PROCESSING', attempts=attempts+1,
                    worker_id=?, lease_expires_at=%s, error_code=NULL, updated_at=CURRENT_TIMESTAMP(6)
                WHERE id=?
                """.formatted(LEASE_END), token, job.id());
        jdbc.update("UPDATE knowledge_versions SET status='PROCESSING', error_code=NULL WHERE id=?", job.versionId());
        return new Claim(new Job(job.id(), job.versionId(), job.attempts() + 1, job.maxAttempts()),
                source.documentId(), source.storagePath(), source.type(), token);
    }

    private Path resolvePath(String filename) throws IOException {
        Path path = storageRoot.resolve(filename).normalize();
        if (!path.startsWith(storageRoot) || !path.toRealPath().startsWith(storageRoot.toRealPath())) {
            throw new InvalidDocument("INVALID_STORAGE_PATH");
        }
        return path;
    }

    private boolean renew(Claim claim) {
        return Boolean.TRUE.equals(transaction.execute(ignored -> canSettle(claim)
                && jdbc.update("""
                        UPDATE knowledge_ingestion_jobs
                        SET lease_expires_at=%s, updated_at=CURRENT_TIMESTAMP(6) WHERE id=?
                        """.formatted(LEASE_END), claim.job().id()) == 1));
    }

    private boolean canSettle(Claim claim) {
        // Lock the document before the job, as admin mutations do.
        Boolean deleted = jdbc.queryForObject(
                "SELECT deleted_at IS NOT NULL FROM knowledge_documents WHERE id=? FOR UPDATE",
                Boolean.class, claim.documentId());
        if (Boolean.TRUE.equals(deleted)) {
            return false;
        }
        return !jdbc.queryForList("""
                SELECT id FROM knowledge_ingestion_jobs
                WHERE id=? AND status='PROCESSING' AND worker_id=? AND lease_expires_at > CURRENT_TIMESTAMP(6)
                FOR UPDATE
                """, claim.job().id(), claim.token()).isEmpty();
    }

    private void finish(Claim claim, List<IndexedChunk> rows) {
        if (!canSettle(claim)) {
            return;
        }
        long versionId = claim.job().versionId();
        jdbc.update("""
                UPDATE knowledge_versions SET embedding_model=?, embedding_dimensions=?, error_code=NULL
                WHERE id=?
                """, embeddings.model(), embeddings.dimensions(), versionId);
        List<Object[]> args = new ArrayList<>(rows.size());
        for (int ordinal = 0; ordinal < rows.size(); ordinal++) {
            var row = rows.get(ordinal);
            args.add(new Object[] {claim.documentId(), versionId, ordinal, row.chunk().text(),
                    row.chunk().page(), row.chunk().section(), row.chunk().estimatedTokens(), row.vector(),
                    embeddings.dimensions()});
        }
        jdbc.batchUpdate("""
                INSERT INTO knowledge_chunks
                    (document_id,version_id,ordinal,content,page_number,section_title,token_count,embedding,embedding_dimensions)
                VALUES (?,?,?,?,?,?,?,?,?)
                """, args);
        jdbc.update("""
                UPDATE knowledge_versions SET status='READY', indexed_at=CURRENT_TIMESTAMP(6) WHERE id=?
                """, versionId);
        jdbc.update("""
                UPDATE knowledge_documents SET active_version_id=?, version=version+1,
                    updated_at=CURRENT_TIMESTAMP(6) WHERE id=?
                """, versionId, claim.documentId());
        jdbc.update("""
                UPDATE knowledge_ingestion_jobs SET status='SUCCEEDED', worker_id=NULL, lease_expires_at=NULL,
                    updated_at=CURRENT_TIMESTAMP(6) WHERE id=?
                """, claim.job().id());
    }

    private void fail(Claim claim, String code, boolean retryable) {
        transaction.executeWithoutResult(ignored -> {
            if (canSettle(claim)) {
                markFailure(claim.job(), code, retryable && claim.job().attempts() < claim.job().maxAttempts());
            }
        });
    }

    private void markFailure(Job job, String code, boolean retry) {
        jdbc.update("""
                UPDATE knowledge_ingestion_jobs SET status=?, error_code=?, worker_id=NULL, lease_expires_at=NULL,
                    next_attempt_at=TIMESTAMPADD(SECOND,?,CURRENT_TIMESTAMP(6)),
                    updated_at=CURRENT_TIMESTAMP(6) WHERE id=?
                """, retry ? "PENDING" : "FAILED", code, retry ? 10 * job.attempts() : 0, job.id());
        jdbc.update("UPDATE knowledge_versions SET status=?, error_code=? WHERE id=?",
                retry ? "UPLOADED" : "FAILED", code, job.versionId());
    }

    private record Job(long id, long versionId, int attempts, int maxAttempts) {}
    private record Source(long documentId, String storagePath, String type, boolean deleted) {}
    private record Claim(Job job, long documentId, String storagePath, String type, String token) {}
    private record IndexedChunk(KnowledgeTextExtractor.Chunk chunk, String vector) {}
}
