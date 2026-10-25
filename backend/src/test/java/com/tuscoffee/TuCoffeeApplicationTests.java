package com.tuscoffee;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Arrays;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest
class TuCoffeeApplicationTests {

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private Flyway flyway;

    @Test
    void connectsToConfiguredMySql() {
        assertEquals(1, jdbc.queryForObject("SELECT 1", Integer.class));
    }

    @Test
    void appliesTheFoundationMigration() {
        assertTrue(Arrays.stream(flyway.info().applied())
            .anyMatch(migration -> "1".equals(migration.getVersion().getVersion())));
    }

}
