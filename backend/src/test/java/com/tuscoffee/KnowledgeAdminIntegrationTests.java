package com.tuscoffee;

import com.tuscoffee.dto.KnowledgeDtos.Enabled;
import com.tuscoffee.entity.User;
import com.tuscoffee.exception.ApiException;
import com.tuscoffee.repository.UserRepository;
import com.tuscoffee.service.KnowledgeAdminService;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties = {"spring.config.import=", "catalog.seed.enabled=false", "RAG_WORKER_ENABLED=false"})
@Transactional
class KnowledgeAdminIntegrationTests extends MySqlIntegrationSupport {
    @TempDir static Path storage;
    @Autowired KnowledgeAdminService service;
    @Autowired UserRepository users;
    @Autowired JdbcTemplate jdbc;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("knowledge.storage-root", () -> storage.toString());
    }

    @Test
    void uploadQueuesDisabledDocumentAndSoftDeleteCancelsItsWork() {
        long admin = admin();
        var queued = service.upload(new MockMultipartFile("file", "Điều khoản 100%.txt",
                "text/plain", new byte[] {'a'}), admin);
        var doc = service.detail(queued.documentId());
        assertEquals("Điều khoản 100%.txt", doc.title());
        assertFalse(doc.enabled());
        assertEquals("UPLOADED", doc.latestVersion().status());
        assertNull(doc.activeVersionId());
        assertEquals(1, service.list("100%", 0, 20, false, "txt").total());
        assertEquals(0, service.list("100%", 0, 20, false, "markdown").total());
        assertEquals(0, service.list("100_", 0, 20, null, "").total());

        service.delete(doc.id(), doc.version(), admin);
        assertEquals("FAILED", jdbc.queryForObject(
                "SELECT status FROM knowledge_ingestion_jobs WHERE id=?", String.class, queued.jobId()));
        assertEquals(404, assertThrows(ApiException.class, () -> service.detail(doc.id())).status());
    }

    @Test
    void rejectsSpoofedPdfBeforePersistingDocument() {
        var spoof = new MockMultipartFile("file", "policy.pdf", "application/pdf", new byte[]{0, 5, 7});
        long admin = admin();
        assertEquals(415, assertThrows(ApiException.class, () -> service.upload(spoof, admin)).status());
        assertEquals(0, service.list("Policy", 0, 20, null, "").total());
    }

    @Test
    void replacingReadyVersionKeepsItActiveAndRejectsStaleAdminWrites() {
        long admin = admin();
        var factory = service.upload(text("Original"), admin);
        jdbc.update("""
                UPDATE knowledge_versions SET status='READY', indexed_at=CURRENT_TIMESTAMP(6),
                    embedding_model='test', embedding_dimensions=1 WHERE id=?
                """, factory.versionId());
        jdbc.update("UPDATE knowledge_ingestion_jobs SET status='SUCCEEDED' WHERE id=?", factory.jobId());
        jdbc.update("UPDATE knowledge_documents SET active_version_id=? WHERE id=?",
                factory.versionId(), factory.documentId());
        var first = service.detail(factory.documentId());
        service.setEnabled(first.id(), new Enabled(true, first.version()), admin);
        var enabled = service.detail(first.id());
        var replacement = service.replace(enabled.id(), enabled.version(), text("Updated"), admin);
        var replacing = service.detail(first.id());
        assertTrue(replacing.enabled());
        assertEquals(factory.versionId(), replacing.activeVersionId().longValue());
        assertEquals(replacement.versionId(), replacing.latestVersion().id());
        assertEquals("UPLOADED", replacing.latestVersion().status());
        assertEquals(409, assertThrows(ApiException.class,
                () -> service.delete(first.id(), enabled.version(), admin)).status());
    }

    private long admin() {
        return users.saveAndFlush(new User("Admin", UUID.randomUUID() + "@example.com", "hash", "ADMIN")).getId();
    }

    private static MockMultipartFile text(String content) {
        return new MockMultipartFile("file", "policy.txt", "text/plain", content.getBytes(StandardCharsets.UTF_8));
    }
}
