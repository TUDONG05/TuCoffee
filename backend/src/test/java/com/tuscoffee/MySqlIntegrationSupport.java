package com.tuscoffee;

import java.security.SecureRandom;
import java.util.Base64;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.mysql.MySQLContainer;

/** One disposable database per test JVM. Never connects to, or cleans, the developer database. */
@ActiveProfiles("local")
abstract class MySqlIntegrationSupport {
    static final byte[] JWT_KEY = new byte[32];
    static final MySQLContainer MYSQL;
    static {
        new SecureRandom().nextBytes(JWT_KEY);
        MYSQL = new MySQLContainer("mysql:8.4.13")
                .withDatabaseName("tu_coffee_test")
                .withUsername("test")
                .withPassword("test");
        MYSQL.start();
        // Testcontainers/Ryuk owns teardown; no per-class stop with cached Spring contexts.
    }

    // Override canonical Spring property names so runner environment variables cannot
    // replace the isolated test JWT/cookie/origin settings. E2E uses a different origin.
    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", MYSQL::getJdbcUrl);
        properties.add("spring.datasource.username", MYSQL::getUsername);
        properties.add("spring.datasource.password", MYSQL::getPassword);
        properties.add("auth.jwt-secret", () -> Base64.getEncoder().encodeToString(JWT_KEY));
        properties.add("auth.cookie-secure", () -> "false");
        properties.add("auth.allowed-origins", () -> "http://localhost:4200");
        properties.add("debug", () -> "false");
        properties.add("logging.level.root", () -> "INFO");
        properties.add("logging.level.org.springframework", () -> "INFO");
    }
}
