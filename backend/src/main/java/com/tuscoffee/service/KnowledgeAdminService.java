package com.tuscoffee.service;

import com.tuscoffee.dto.KnowledgeDtos.Document;
import com.tuscoffee.dto.KnowledgeDtos.Enabled;
import com.tuscoffee.dto.KnowledgeDtos.Page;
import com.tuscoffee.dto.KnowledgeDtos.Queued;
import com.tuscoffee.dto.KnowledgeDtos.Revision;
import com.tuscoffee.exception.ApiException;
import com.tuscoffee.service.KnowledgeFileStorage.Stored;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Service
public class KnowledgeAdminService {
    private static final String FROM_DOCUMENTS = " FROM knowledge_documents d WHERE d.deleted_at IS NULL";
    private static final String SELECT_DOCUMENTS = """
            SELECT d.id,d.title,d.enabled,d.version,d.active_version_id,d.created_at,d.updated_at,
                   (SELECT COUNT(*) FROM knowledge_chunks c
                    WHERE c.version_id=d.active_version_id AND c.document_id=d.id) AS chunk_count,
                   v.id AS revision_id,v.revision,v.status,v.error_code,v.original_filename
            FROM knowledge_documents d LEFT JOIN knowledge_versions v ON v.id = (
                SELECT k.id FROM knowledge_versions k WHERE k.document_id=d.id ORDER BY k.revision DESC LIMIT 1
            ) WHERE d.deleted_at IS NULL
            """;
    private static final String SELECT_REVISIONS = """
            SELECT id AS revision_id,revision,status,error_code,original_filename
            FROM knowledge_versions WHERE document_id=?
            """;

    private final JdbcTemplate jdbc;
    private final KnowledgeFileStorage storage;

    public KnowledgeAdminService(JdbcTemplate jdbc, KnowledgeFileStorage storage) {
        this.jdbc = jdbc;
        this.storage = storage;
    }

    @Transactional(readOnly = true)
    public Page list(String query, int page, int size, Boolean enabled, String format) {
        String keyword = query.strip();
        if (keyword.length() > 200 || page < 0 || size < 1 || size > 100) {
            throw invalid("INVALID_DOCUMENT_FILTER", "Bộ lọc hoặc phân trang không hợp lệ.");
        }
        String filter = "";
        List<Object> parameters = new ArrayList<>();
        if (!keyword.isEmpty()) {
            filter += " AND d.title LIKE ? ESCAPE '!'";
            parameters.add("%" + keyword.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%");
        }
        if (enabled != null) {
            filter += " AND d.enabled=?";
            parameters.add(enabled);
        }
        String contentType = switch (format) {
            case "" -> null;
            case "txt" -> "text/plain";
            case "markdown" -> "text/markdown";
            case "pdf" -> "application/pdf";
            case "docx" -> KnowledgeTextExtractor.DOCX_TYPE;
            default -> throw invalid("INVALID_DOCUMENT_FORMAT", "Định dạng tài liệu không hợp lệ.");
        };
        if (contentType != null) {
            filter += """
                     AND ? = (SELECT k.content_type FROM knowledge_versions k
                     WHERE k.document_id=d.id ORDER BY k.revision DESC LIMIT 1)
                    """;
            parameters.add(contentType);
        }
        long total = jdbc.queryForObject("SELECT COUNT(*)" + FROM_DOCUMENTS + filter, Long.class, parameters.toArray());
        parameters.add(size);
        parameters.add((long) page * size);
        List<Document> items = jdbc.query(SELECT_DOCUMENTS + filter + " ORDER BY d.updated_at DESC,d.id DESC LIMIT ? OFFSET ?",
                (rs, row) -> document(rs), parameters.toArray());
        return new Page(items, total, page, size);
    }

    @Transactional(readOnly = true)
    public Document detail(long id) {
        Document document = jdbc.query(SELECT_DOCUMENTS + " AND d.id=?", (rs, row) -> document(rs), id)
                .stream().findFirst().orElseThrow(KnowledgeAdminService::notFound);
        List<Revision> revisions = jdbc.query(SELECT_REVISIONS + " ORDER BY revision DESC",
                (rs, row) -> revision(rs), id);
        return new Document(document.id(), document.title(), document.enabled(), document.version(),
                document.activeVersionId(), document.chunkCount(), document.createdAt(), document.updatedAt(),
                document.latestVersion(), revisions);
    }

    @Transactional(readOnly = true)
    public com.tuscoffee.dto.KnowledgeDtos.Preview preview(long id) {
        var doc = detail(id);
        List<String> excerpts = doc.activeVersionId() == null ? List.of() : jdbc.queryForList("""
                SELECT content FROM knowledge_chunks WHERE document_id=? AND version_id=?
                ORDER BY ordinal LIMIT 9
                """, String.class, id, doc.activeVersionId());
        int shown = Math.min(8, excerpts.size());
        return new com.tuscoffee.dto.KnowledgeDtos.Preview(excerpts.subList(0, shown), excerpts.size() > shown);
    }

    @Transactional
    public Queued upload(MultipartFile file, long actor) {
        Stored stored = storage.save(file);
        String filename = stored.filename();
        int length = filename.codePointCount(0, filename.length());
        String title = length <= 200 ? filename : filename.substring(0, filename.offsetByCodePoints(0, 199)) + "…";
        long id = insert("INSERT INTO knowledge_documents(title,created_by) VALUES (?,?)", title, actor);
        return queue(id, 1, stored, actor, "UPLOAD");
    }

    @Transactional
    public Queued replace(long id, long expected, MultipartFile file, long actor) {
        lock(id, expected);
        Revision latest = eligibleLatest(id);
        Stored stored = storage.save(file);
        bump(id);
        return queue(id, latest.revision() + 1, stored, actor, "REPLACE");
    }

    @Transactional
    public Queued reindex(long id, long expected, long actor) {
        Locked document = lock(id, expected);
        Revision latest = eligibleLatest(id);
        if (document.activeVersionId() == null) {
            throw conflict("DOCUMENT_NOT_READY", "Cần có một phiên bản sẵn sàng để lập chỉ mục lại.");
        }
        Stored source = jdbc.queryForObject("""
                SELECT original_filename,storage_path,content_type,file_size_bytes,content_hash
                FROM knowledge_versions WHERE id=? AND document_id=?
                """, (rs, row) -> new Stored(rs.getString(1), rs.getString(2), rs.getString(3),
                rs.getLong(4), rs.getString(5)), document.activeVersionId(), id);
        bump(id);
        return queue(id, latest.revision() + 1, source, actor, "REINDEX");
    }

    @Transactional
    public Queued retry(long id, long revisionId, long expected, long actor) {
        Locked document = lock(id, expected);
        Revision latest = eligibleLatest(id);
        if (latest.id() != revisionId || !"FAILED".equals(latest.status())
                || Long.valueOf(revisionId).equals(document.activeVersionId())) {
            throw conflict("DOCUMENT_RETRY_UNAVAILABLE", "Chỉ có thể thử lại phiên bản lỗi mới nhất.");
        }
        long jobId = jdbc.queryForObject("SELECT id FROM knowledge_ingestion_jobs WHERE version_id=? FOR UPDATE",
                Long.class, revisionId);
        jdbc.update("""
                UPDATE knowledge_ingestion_jobs SET status='PENDING', attempts=0, next_attempt_at=CURRENT_TIMESTAMP(6),
                    worker_id=NULL, lease_expires_at=NULL, error_code=NULL, updated_at=CURRENT_TIMESTAMP(6) WHERE id=?
                """, jobId);
        jdbc.update("UPDATE knowledge_versions SET status='UPLOADED',error_code=NULL WHERE id=?", revisionId);
        bump(id);
        audit(id, revisionId, actor, "REINDEX", "Retry failed ingestion");
        return new Queued(id, revisionId, jobId);
    }

    @Transactional
    public void setEnabled(long id, Enabled input, long actor) {
        if (input.enabled() == null || input.version() == null) {
            throw invalid("INVALID_DOCUMENT_STATE", "Cần trạng thái và phiên bản tài liệu.");
        }
        Locked document = lock(id, input.version());
        if (document.enabled() == input.enabled()) return;
        if (input.enabled() && (document.activeVersionId() == null || !Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM knowledge_versions WHERE document_id=? AND id=? AND status='READY')
                """, Boolean.class, id, document.activeVersionId())))) {
            throw conflict("DOCUMENT_NOT_READY", "Chỉ có thể bật tài liệu đã lập chỉ mục.");
        }
        jdbc.update("""
                UPDATE knowledge_documents SET enabled=?, version=version+1, updated_at=CURRENT_TIMESTAMP(6) WHERE id=?
                """, input.enabled(), id);
        audit(id, document.activeVersionId(), actor, input.enabled() ? "ENABLE" : "DISABLE", null);
    }

    @Transactional
    public void delete(long id, long expected, long actor) {
        Locked document = lock(id, expected);
        jdbc.update("""
                UPDATE knowledge_documents SET enabled=FALSE, deleted_at=CURRENT_TIMESTAMP(6),
                    version=version+1, updated_at=CURRENT_TIMESTAMP(6) WHERE id=?
                """, id);
        jdbc.update("""
                UPDATE knowledge_ingestion_jobs j JOIN knowledge_versions v ON v.id=j.version_id
                SET j.status='FAILED', j.worker_id=NULL, j.lease_expires_at=NULL,
                    j.error_code='DOCUMENT_DELETED',j.updated_at=CURRENT_TIMESTAMP(6)
                WHERE v.document_id=? AND j.status IN ('PENDING','PROCESSING')
                """, id);
        jdbc.update("""
                UPDATE knowledge_versions SET status='FAILED',error_code='DOCUMENT_DELETED'
                WHERE document_id=? AND status IN ('UPLOADED','PROCESSING')
                """, id);
        audit(id, document.activeVersionId(), actor, "DELETE", null);
    }

    private Queued queue(long id, int revision, Stored source, long actor, String action) {
        long versionId = insert("""
                INSERT INTO knowledge_versions(document_id,revision,original_filename,storage_path,
                    content_type,file_size_bytes,content_hash,created_by) VALUES (?,?,?,?,?,?,?,?)
                """, id, revision, source.filename(), source.path(), source.type(), source.size(), source.hash(), actor);
        long jobId = insert("INSERT INTO knowledge_ingestion_jobs(version_id) VALUES (?)", versionId);
        audit(id, versionId, actor, action, null);
        return new Queued(id, versionId, jobId);
    }

    private Revision eligibleLatest(long id) {
        Revision latest = jdbc.queryForObject(SELECT_REVISIONS + " ORDER BY revision DESC LIMIT 1",
                (rs, row) -> revision(rs), id);
        if ("UPLOADED".equals(latest.status()) || "PROCESSING".equals(latest.status())) {
            throw conflict("DOCUMENT_BUSY", "Tài liệu đang được xử lý.");
        }
        return latest;
    }

    private Locked lock(long id, long expected) {
        Locked document = jdbc.query("""
                SELECT version,enabled,active_version_id FROM knowledge_documents
                WHERE id=? AND deleted_at IS NULL FOR UPDATE
                """, (rs, row) -> new Locked(rs.getLong(1), rs.getBoolean(2), rs.getObject(3, Long.class)), id)
                .stream().findFirst().orElseThrow(KnowledgeAdminService::notFound);
        if (expected != document.version()) {
            throw conflict("DOCUMENT_VERSION_CONFLICT", "Tài liệu đã thay đổi. Hãy tải lại dữ liệu.");
        }
        return document;
    }

    private void bump(long id) {
        jdbc.update("UPDATE knowledge_documents SET version=version+1, updated_at=CURRENT_TIMESTAMP(6) WHERE id=?", id);
    }

    private void audit(long id, Long revisionId, long actor, String action, String note) {
        jdbc.update("INSERT INTO knowledge_audit(document_id,version_id,actor_id,action,note) VALUES (?,?,?,?,?)",
                id, revisionId, actor, action, note);
    }

    private long insert(String sql, Object... values) {
        GeneratedKeyHolder key = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            var statement = connection.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
            for (int i = 0; i < values.length; i++) statement.setObject(i + 1, values[i]);
            return statement;
        }, key);
        return java.util.Objects.requireNonNull(key.getKey()).longValue();
    }

    private static Document document(ResultSet rs) throws SQLException {
        return new Document(rs.getLong("id"), rs.getString("title"), rs.getBoolean("enabled"),
                rs.getLong("version"), rs.getObject("active_version_id", Long.class), rs.getLong("chunk_count"),
                rs.getObject("created_at", java.sql.Timestamp.class).toInstant(),
                rs.getObject("updated_at", java.sql.Timestamp.class).toInstant(), revision(rs), null);
    }

    private static Revision revision(ResultSet rs) throws SQLException {
        Long id = rs.getObject("revision_id", Long.class);
        return id == null ? null : new Revision(id, rs.getInt("revision"), rs.getString("status"),
                rs.getString("error_code"), rs.getString("original_filename"));
    }

    private static ApiException invalid(String code, String message) {
        return new ApiException(400, code, message);
    }

    private static ApiException conflict(String code, String message) {
        return new ApiException(409, code, message);
    }

    private static ApiException notFound() {
        return new ApiException(404, "DOCUMENT_NOT_FOUND", "Không tìm thấy tài liệu.");
    }

    private record Locked(long version, boolean enabled, Long activeVersionId) {}
}
