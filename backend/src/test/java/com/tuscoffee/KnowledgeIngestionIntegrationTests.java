package com.tuscoffee;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.tuscoffee.entity.User;
import com.tuscoffee.repository.UserRepository;
import com.tuscoffee.service.KnowledgeEmbeddingClient;
import com.tuscoffee.service.KnowledgeIngestionWorker;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;

@SpringBootTest(properties = {"spring.config.import=", "catalog.seed.enabled=false", "RAG_WORKER_ENABLED=false"})
class KnowledgeIngestionIntegrationTests extends MySqlIntegrationSupport {
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactions;
    @Autowired UserRepository users;
    @TempDir Path storage;

    @Test
    void expiredLeaseIsRecoveredAndInvalidReplacementKeepsActiveVersion() throws Exception {
        var embedding = mock(KnowledgeEmbeddingClient.class);
        when(embedding.model()).thenReturn("fake-v1");
        when(embedding.dimensions()).thenReturn(2);
        when(embedding.embed("Cà phê")).thenReturn("[0.25,0.5]");
        var worker = new KnowledgeIngestionWorker(jdbc, transactions, embedding, storage.toString());
        var admin = users.saveAndFlush(new User("RAG admin", UUID.randomUUID() + "@example.com", "hash", "ADMIN"));
        jdbc.update("INSERT INTO knowledge_documents(title,created_by) VALUES ('Menu',?)", admin.getId());
        long document = jdbc.queryForObject(
                "SELECT id FROM knowledge_documents WHERE created_by=?", Long.class, admin.getId());

        long first = queue(document, admin.getId(), 1, "Cà phê");
        jdbc.update("""
                UPDATE knowledge_ingestion_jobs
                SET status='PROCESSING', worker_id='old-worker', attempts=1,
                    lease_expires_at=TIMESTAMPADD(SECOND,-10,CURRENT_TIMESTAMP(6))
                WHERE version_id=?
                """, first);
        jdbc.update("UPDATE knowledge_versions SET status='PROCESSING' WHERE id=?", first);
        worker.poll();
        assertEquals("SUCCEEDED", jobStatus(first));
        assertEquals(2, jdbc.queryForObject("SELECT attempts FROM knowledge_ingestion_jobs WHERE version_id=?",
                Integer.class, first));
        assertEquals(first, activeVersion(document));
        assertEquals("Cà phê", jdbc.queryForObject(
                "SELECT content FROM knowledge_chunks WHERE version_id=?", String.class, first));

        long replacement = queue(document, admin.getId(), 2, " ");
        worker.poll();
        assertEquals("FAILED", jobStatus(replacement));
        assertEquals("NO_EXTRACTABLE_TEXT", jdbc.queryForObject(
                "SELECT error_code FROM knowledge_versions WHERE id=?", String.class, replacement));
        assertEquals(first, activeVersion(document));

        long stale = queue(document, admin.getId(), 3, "Đồ uống");
        when(embedding.embed("Đồ uống")).thenAnswer(ignored -> {
            jdbc.update("""
                    UPDATE knowledge_ingestion_jobs SET worker_id='new-worker',
                        lease_expires_at=TIMESTAMPADD(SECOND,180,CURRENT_TIMESTAMP(6)) WHERE version_id=?
                    """, stale);
            return "[0.25,0.5]";
        });
        worker.poll();
        assertEquals("PROCESSING", jobStatus(stale));
        assertEquals(0L, jdbc.queryForObject(
                "SELECT COUNT(*) FROM knowledge_chunks WHERE version_id=?", Long.class, stale));
        assertEquals(first, activeVersion(document));
    }

    private long queue(long document, long admin, int revision, String content) throws Exception {
        String filename = UUID.randomUUID().toString();
        Path file = Files.writeString(storage.resolve(filename), content);
        jdbc.update("""
                INSERT INTO knowledge_versions
                    (document_id, revision, original_filename, storage_path, content_type, file_size_bytes,
                     content_hash, created_by)
                VALUES (?, ?, 'menu.txt', ?, 'text/plain', ?, ?, ?)
                """, document, revision, filename, Files.size(file), "0".repeat(64), admin);
        long version = jdbc.queryForObject(
                "SELECT id FROM knowledge_versions WHERE document_id=? AND revision=?", Long.class,
                document, revision);
        jdbc.update("INSERT INTO knowledge_ingestion_jobs(version_id) VALUES (?)", version);
        return version;
    }

    private String jobStatus(long version) {
        return jdbc.queryForObject("SELECT status FROM knowledge_ingestion_jobs WHERE version_id=?",
                String.class, version);
    }

    private Long activeVersion(long document) {
        return jdbc.queryForObject("SELECT active_version_id FROM knowledge_documents WHERE id=?",
                Long.class, document);
    }
}
