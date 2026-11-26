package com.tuscoffee.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "auth_rate_limits")
public class AuthRateLimit {
    @Id
    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "rate_key", length = 64, columnDefinition = "char(64)")
    private String rateKey;

    @Column(nullable = false)
    private int failures;

    @JdbcTypeCode(SqlTypes.TIMESTAMP)
    @Column(name = "window_start", nullable = false, columnDefinition = "timestamp(6)")
    private Instant windowStart;

    protected AuthRateLimit() {}

    public AuthRateLimit(String rateKey, Instant now) {
        this.rateKey = rateKey;
        this.windowStart = now;
    }

    public String getRateKey() {
        return rateKey;
    }

    public int getFailures() {
        return failures;
    }

    public Instant getWindowStart() {
        return windowStart;
    }

    public boolean isBlocked(Instant now) {
        return failures >= 5 && windowStart.isAfter(now.minusSeconds(900));
    }

    public void recordFailure(Instant now) {
        if (!windowStart.isAfter(now.minusSeconds(900))) {
            windowStart = now;
            failures = 0;
        }
        failures++;
    }
}
