package com.tuscoffee.bootstrap;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.*;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import javax.imageio.ImageIO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

/** Explicit local-only import. Existing source mappings and admin edits are never overwritten. */
@Component
@Profile("local")
@ConditionalOnProperty(prefix = "catalog.seed", name = "enabled", havingValue = "true")
public class CatalogSeed implements CommandLineRunner {
    private static final String SOURCE = "coffe-web-i8h3";
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private final JsonMapper json;
    private final Path uploadDirectory;

    public CatalogSeed(JdbcTemplate jdbc, PlatformTransactionManager manager, JsonMapper json,
            @Value("${catalog.upload-dir:uploads/catalog}") String uploadDirectory) {
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(manager);
        this.transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.json = json;
        this.uploadDirectory = Path.of(uploadDirectory).toAbsolutePath().normalize();
    }

    public record SeedProduct(String id, String name, String category, String categorySlug,
            long priceVnd, String description, boolean active, String imageFilename,
            String imageSha256, String sourceImageUrl, int imageBytes, int width, int height) {}
    public record Result(int created, int skipped) {}

    @Override
    public void run(String... args) {
        Result result = importReference();
        System.out.printf("Local reference catalog: %d created, %d existing products preserved.%n",
                result.created(), result.skipped());
    }

    public Result importReference() {
        final SeedProduct[] products;
        try (var input = new ClassPathResource("catalog/reference-products.json").getInputStream()) {
            products = json.readValue(input, SeedProduct[].class);
            Files.createDirectories(uploadDirectory);
        } catch (IOException error) {
            throw new IllegalStateException("Cannot read packaged reference catalog.", error);
        }
        List<Path> createdFiles = new ArrayList<>();
        try {
            return transaction.execute(status -> {
                // Serialize local imports and concurrent first-account startup tasks consistently.
                jdbc.queryForObject("SELECT id FROM identity_lock WHERE id=1 FOR UPDATE", Integer.class);
                int created = 0;
                int skipped = 0;
                for (SeedProduct product : products) {
                    Long existing = jdbc.queryForObject(
                            "SELECT COUNT(*) FROM products WHERE source_system=? AND source_id=?",
                            Long.class, SOURCE, product.id());
                    if (existing != null && existing > 0) {
                        skipped++;
                        continue;
                    }
                    List<Long> categories = jdbc.queryForList(
                            "SELECT id FROM categories WHERE slug=?", Long.class, product.categorySlug());
                    if (categories.isEmpty()) {
                        jdbc.update("INSERT INTO categories(name,slug,is_active,version,created_at,updated_at) VALUES(?,?,1,0,?,?)",
                                product.category(), product.categorySlug(), now(), now());
                        categories = jdbc.queryForList("SELECT id FROM categories WHERE slug=?",
                                Long.class, product.categorySlug());
                    }
                    copyImage(product, createdFiles);
                    jdbc.update("INSERT INTO products(category_id,name,description,price_vnd,image_path,is_active,version,source_system,source_id,created_at,updated_at) VALUES(?,?,?,?,?,?,0,?,?,?,?)",
                            categories.getFirst(), product.name(), product.description(), product.priceVnd(),
                            product.imageFilename(), product.active(), SOURCE, product.id(), now(), now());
                    created++;
                }
                return new Result(created, skipped);
            });
        } catch (RuntimeException error) {
            for (Path file : createdFiles) {
                try { Files.deleteIfExists(file); }
                catch (IOException cleanup) { error.addSuppressed(cleanup); }
            }
            throw error;
        }
    }

    private Timestamp now() { return Timestamp.from(Instant.now()); }

    private void copyImage(SeedProduct product, List<Path> createdFiles) {
        String filename = product.imageFilename();
        if (filename == null || !filename.matches("[a-f0-9-]{36}\\.(jpg|png|webp)")) {
            throw new IllegalStateException("Invalid packaged catalog image name.");
        }
        Path target = uploadDirectory.resolve(filename).normalize();
        if (!uploadDirectory.equals(target.getParent())) throw new IllegalStateException("Invalid catalog image path.");
        try {
            byte[] bytes;
            try (var input = new ClassPathResource("catalog/images/" + filename).getInputStream()) {
                bytes = input.readNBytes(5 * 1024 * 1024 + 1);
            }
            if (bytes.length != product.imageBytes() || bytes.length > 5 * 1024 * 1024
                    || !digest(bytes).equals(product.imageSha256())) {
                throw new IOException("Packaged catalog image integrity check failed.");
            }
            try (var stream = ImageIO.createImageInputStream(new java.io.ByteArrayInputStream(bytes))) {
                var readers = ImageIO.getImageReaders(stream);
                if (!readers.hasNext()) throw new IOException("Unsupported packaged image format.");
                var reader = readers.next();
                try {
                    reader.setInput(stream);
                    long width = reader.getWidth(0), height = reader.getHeight(0);
                    if (width <= 0 || height <= 0 || width * height > 20_000_000
                            || width != product.width() || height != product.height()) {
                        throw new IOException("Packaged image dimensions exceed allowed limits.");
                    }
                    BufferedImage decoded = reader.read(0);
                    if (decoded == null) throw new IOException("Cannot decode packaged image.");
                } finally { reader.dispose(); }
            }
            if (Files.exists(target, LinkOption.NOFOLLOW_LINKS)) {
                if (Files.isSymbolicLink(target) || Files.size(target) != bytes.length || !digest(Files.readAllBytes(target)).equals(product.imageSha256())) {
                    throw new IOException("Existing catalog image differs from packaged image.");
                }
                return;
            }
            Path temporary = Files.createTempFile(uploadDirectory, "seed-", ".tmp");
            try {
                Files.write(temporary, bytes);
                Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE);
                createdFiles.add(target);
            } finally { Files.deleteIfExists(temporary); }
        } catch (IOException error) {
            throw new IllegalStateException("Cannot import packaged catalog image.", error);
        }
    }

    private String digest(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (java.security.NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
    }
}
