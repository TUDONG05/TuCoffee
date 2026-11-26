package com.tuscoffee;

import static org.junit.jupiter.api.Assertions.*;

import com.tuscoffee.bootstrap.CatalogSeed;
import java.nio.file.*;
import java.sql.DriverManager;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import tools.jackson.databind.json.JsonMapper;

/** Explicit seed checks use their own schema and directory, never auth or developer fixtures. */
class CatalogSeedTests {
    @TempDir Path uploads;
    private String server;
    private String schema;
    private String user;
    private String password;
    private JdbcTemplate jdbc;
    private CatalogSeed seed;

    @BeforeEach
    void isolatedDatabase() throws Exception {
        user = required("TEST_MYSQL_USER");
        password = required("TEST_MYSQL_PASSWORD");
        server = "jdbc:mysql://" + System.getenv().getOrDefault("TEST_MYSQL_HOST", "127.0.0.1")
                + ":" + System.getenv().getOrDefault("TEST_MYSQL_PORT", "3306") + "/";
        schema = "tu_coffee_test_seed_" + UUID.randomUUID().toString().replace("-", "");
        try (var connection = DriverManager.getConnection(server, user, password);
                var statement = connection.createStatement()) {
            statement.execute("CREATE DATABASE " + schema + " CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci");
        }
        var source = new DriverManagerDataSource(server + schema + "?connectionTimeZone=UTC", user, password);
        Flyway.configure().dataSource(source).locations("classpath:db/migration").cleanDisabled(true).load().migrate();
        jdbc = new JdbcTemplate(source);
        seed = new CatalogSeed(jdbc, new DataSourceTransactionManager(source),
                JsonMapper.builder().build(), uploads.toString());
    }

    @AfterEach
    void removeOnlyOwnedSchema() throws Exception {
        if (schema == null) return;
        try (var connection = DriverManager.getConnection(server, user, password);
                var statement = connection.createStatement()) {
            statement.execute("DROP DATABASE " + schema);
        }
    }

    private String required(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) throw new IllegalStateException("Set " + name + " for isolated MySQL tests.");
        return value;
    }

    @Test
    void importsLocalAssetsAndPreservesAdminEditsWhenRunAgain() throws Exception {
        var first = seed.importReference();
        assertEquals(18, first.created());
        assertEquals(0, first.skipped());
        assertEquals(5L, jdbc.queryForObject("SELECT COUNT(*) FROM categories", Long.class));
        assertEquals(18L, jdbc.queryForObject("SELECT COUNT(*) FROM products", Long.class));
        try (var files = Files.list(uploads)) { assertEquals(18, files.count()); }
        assertEquals(0L, jdbc.queryForObject("SELECT COUNT(*) FROM product_reviews", Long.class));
        jdbc.update("UPDATE products SET name=?,price_vnd=?,is_active=0,version=version+1 WHERE source_system=? AND source_id=?",
                "Admin edited", 12345, "coffe-web-i8h3", "37");
        jdbc.update("UPDATE categories SET is_active=0 WHERE slug='do-an'");
        var second = seed.importReference();
        assertEquals(0, second.created());
        assertEquals(18, second.skipped());
        assertEquals("Admin edited", jdbc.queryForObject("SELECT name FROM products WHERE source_id='37'", String.class));
        assertEquals(12345L, jdbc.queryForObject("SELECT price_vnd FROM products WHERE source_id='37'", Long.class));
        assertEquals(0, jdbc.queryForObject("SELECT is_active FROM categories WHERE slug='do-an'", Integer.class));
        try (var files = Files.list(uploads)) { assertEquals(18, files.count()); }
    }

    @Test
    void rollsBackRowsAndNewFilesWhenDatabaseRejectsImport() throws Exception {
        jdbc.execute("ALTER TABLE products MODIFY COLUMN name VARCHAR(8) NOT NULL");
        assertThrows(DataIntegrityViolationException.class, () -> seed.importReference());
        assertEquals(0L, jdbc.queryForObject("SELECT COUNT(*) FROM products", Long.class));
        assertEquals(0L, jdbc.queryForObject("SELECT COUNT(*) FROM categories", Long.class));
        try (var files = Files.list(uploads)) { assertEquals(0, files.count()); }
    }

    @Test
    void refusesToOverwriteExistingAssetWithDifferentContent() throws Exception {
        var manifest = JsonMapper.builder().build().readTree(
                new org.springframework.core.io.ClassPathResource("catalog/reference-products.json").getInputStream());
        String filename = manifest.get(0).path("imageFilename").asText();
        Path asset = uploads.resolve(filename);
        Files.writeString(asset, "existing different asset");
        assertThrows(IllegalStateException.class, () -> seed.importReference());
        assertEquals("existing different asset", Files.readString(asset));
        assertEquals(0L, jdbc.queryForObject("SELECT COUNT(*) FROM products", Long.class));
        assertEquals(0L, jdbc.queryForObject("SELECT COUNT(*) FROM categories", Long.class));
    }
}
