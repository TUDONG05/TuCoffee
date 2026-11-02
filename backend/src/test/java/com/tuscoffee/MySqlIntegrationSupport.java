package com.tuscoffee;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.UUID;
import java.sql.DriverManager;
import java.sql.SQLException;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/** One generated schema per test JVM on native MySQL; never uses the application schema. */
@ActiveProfiles("local")
abstract class MySqlIntegrationSupport {
    static final byte[] JWT_KEY = new byte[32];
    private static final String DATABASE =
            "tu_coffee_test_" + UUID.randomUUID().toString().replace("-", "");
    private static final String USER = required("TEST_MYSQL_USER");
    private static final String PASSWORD = required("TEST_MYSQL_PASSWORD");
    private static final String SERVER =
            "jdbc:mysql://"
                    + System.getenv().getOrDefault("TEST_MYSQL_HOST", "127.0.0.1")
                    + ":"
                    + System.getenv().getOrDefault("TEST_MYSQL_PORT", "3306")
                    + "/";
    private static final String OPTIONS =
            "?connectionTimeZone=UTC&connectTimeout=3000&socketTimeout=5000";

    static {
        new SecureRandom().nextBytes(JWT_KEY);
        try (var connection = DriverManager.getConnection(SERVER + OPTIONS, USER, PASSWORD);
                var statement = connection.createStatement()) {
            statement.executeUpdate(
                    "CREATE DATABASE "
                            + DATABASE
                            + " CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci");
        } catch (SQLException error) {
            throw new IllegalStateException(
                    "Cannot create the isolated test schema. Check TEST_MYSQL_* and schema privileges.");
        }
        Runtime.getRuntime()
                .addShutdownHook(
                        new Thread(
                                () -> {
                                    try (var connection =
                                                    DriverManager.getConnection(
                                                            SERVER + OPTIONS, USER, PASSWORD);
                                            var statement = connection.createStatement()) {
                                        statement.execute("SET SESSION lock_wait_timeout = 5");
                                        statement.executeUpdate("DROP DATABASE " + DATABASE);
                                    } catch (SQLException error) {
                                        System.err.println(
                                                "Could not remove generated test schema: "
                                                        + DATABASE);
                                    }
                                },
                                "test-schema-cleanup"));
    }

    private static String required(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank())
            throw new IllegalStateException("Set " + name + " for native MySQL integration tests.");
        return value;
    }

    // Canonical names keep runner environment from overriding test-only auth settings.
    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", () -> SERVER + DATABASE + OPTIONS);
        properties.add("spring.datasource.username", () -> USER);
        properties.add("spring.datasource.password", () -> PASSWORD);
        properties.add("auth.jwt-secret", () -> Base64.getEncoder().encodeToString(JWT_KEY));
        properties.add("auth.cookie-secure", () -> "false");
        properties.add("auth.allowed-origins", () -> "http://localhost:4200");
        properties.add("debug", () -> "false");
        properties.add("logging.level.root", () -> "INFO");
        properties.add("logging.level.org.springframework", () -> "INFO");
    }
}
