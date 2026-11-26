package com.tuscoffee.service;

import com.tuscoffee.exception.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.Locale;
import java.util.UUID;

@Component
public class KnowledgeFileStorage {
    private static final int MAX_BYTES = 10 * 1024 * 1024;
    private static final org.slf4j.Logger LOGGER = org.slf4j.LoggerFactory.getLogger(KnowledgeFileStorage.class);
    private final Path root;
    private final JdbcTemplate jdbc;

    public KnowledgeFileStorage(@Value("${knowledge.storage-root:./data/knowledge}") String root,
                                JdbcTemplate jdbc) {
        this.root = Path.of(root).toAbsolutePath().normalize();
        this.jdbc = jdbc;
    }

    record Stored(String filename, String path, String type, long size, String hash) {}

    Stored save(MultipartFile file) {
        if (file.isEmpty()) {
            throw new ApiException(400, "EMPTY_DOCUMENT", "Tài liệu trống.");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new ApiException(413, "DOCUMENT_TOO_LARGE", "Tài liệu không được vượt quá 10 MiB.");
        }
        String original = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().replace('\\', '/');
        String name = original.substring(original.lastIndexOf('/') + 1);
        if (name.isBlank() || name.length() > 255 || name.chars().anyMatch(Character::isISOControl)) {
            throw new ApiException(400, "INVALID_FILENAME", "Tên tệp không hợp lệ.");
        }
        String key = UUID.randomUUID().toString();
        Path destination = root.resolve(key);
        try {
            byte[] bytes = file.getBytes();
            if (bytes.length > MAX_BYTES) {
                throw new ApiException(413, "DOCUMENT_TOO_LARGE", "Tài liệu không được vượt quá 10 MiB.");
            }
            String type = detectType(name, bytes);
            String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
            Files.createDirectories(root);
            try (var output = Files.newOutputStream(destination, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
                TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                    @Override
                    public void afterCompletion(int status) {
                        if (status == STATUS_ROLLED_BACK) remove(destination);
                    }
                });
                output.write(bytes);
            }
            if (KnowledgeTextExtractor.DOCX_TYPE.equals(type)) {
                try {
                    KnowledgeTextExtractor.readDocx(destination);
                } catch (KnowledgeTextExtractor.InvalidDocument ex) {
                    throw new ApiException(415, ex.getMessage(), "Tệp Word không hợp lệ hoặc vượt giới hạn xử lý.");
                }
            }
            return new Stored(name, key, type, bytes.length, hash);
        } catch (IOException | NoSuchAlgorithmException ex) {
            throw new ApiException(503, "DOCUMENT_STORAGE_UNAVAILABLE", "Không thể lưu tài liệu.");
        }
    }

    private static String detectType(String filename, byte[] bytes) {
        String name = filename.toLowerCase(Locale.ROOT);
        boolean pdf = bytes.length >= 5 && new String(bytes, 0, 5, StandardCharsets.US_ASCII).equals("%PDF-");
        if (pdf && name.endsWith(".pdf")) return "application/pdf";
        if (name.endsWith(".docx") && bytes.length >= 4 && bytes[0] == 'P' && bytes[1] == 'K'
                && bytes[2] == 3 && bytes[3] == 4) return KnowledgeTextExtractor.DOCX_TYPE;
        boolean markdown = name.endsWith(".md") || name.endsWith(".markdown");
        if (!pdf && (markdown || name.endsWith(".txt"))) {
            try {
                String decoded = StandardCharsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(bytes)).toString();
                if (!decoded.isBlank() && decoded.chars().noneMatch(c ->
                        Character.isISOControl(c) && c != '\n' && c != '\r' && c != '\t')) {
                    return markdown ? "text/markdown" : "text/plain";
                }
            } catch (CharacterCodingException ignored) {
                // Reject malformed UTF-8 with the same public error as other invalid formats.
            }
        }
        throw new ApiException(415, "UNSUPPORTED_DOCUMENT", "Chỉ hỗ trợ TXT UTF-8, Markdown, PDF có văn bản và Word (.docx).");
    }

    @Scheduled(fixedDelayString = "PT24H", initialDelayString = "PT1H")
    void cleanupOrphans() {
        if (!Files.isDirectory(root)) return;
        Instant cutoff = Instant.now().minus(1, ChronoUnit.DAYS);
        try (var files = Files.list(root)) {
            files.filter(path -> Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS))
                    .filter(path -> path.getFileName().toString().matches("[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}"))
                    .filter(path -> olderThan(path, cutoff))
                    .filter(path -> Boolean.FALSE.equals(jdbc.queryForObject(
                            "SELECT EXISTS(SELECT 1 FROM knowledge_versions WHERE storage_path = ?)",
                            Boolean.class, path.getFileName().toString())))
                    .forEach(KnowledgeFileStorage::remove);
        } catch (IOException ex) {
            LOGGER.warn("Could not list knowledge storage for cleanup");
        }
    }

    private static boolean olderThan(Path path, Instant cutoff) {
        try {
            return Files.getLastModifiedTime(path, LinkOption.NOFOLLOW_LINKS).toInstant().isBefore(cutoff);
        } catch (IOException ex) {
            return false;
        }
    }

    private static void remove(Path path) {
        try {
            Files.deleteIfExists(path);
        } catch (IOException ex) {
            LOGGER.warn("Could not remove an orphaned knowledge file");
        }
    }
}
