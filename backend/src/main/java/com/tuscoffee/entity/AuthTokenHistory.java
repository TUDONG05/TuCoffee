package com.tuscoffee.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "auth_token_history")
public class AuthTokenHistory {
    @Id
    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "token_hash", length = 64, columnDefinition = "char(64)")
    private String tokenHash;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "session_id", nullable = false, updatable = false)
    private AuthSession session;

    @JdbcTypeCode(SqlTypes.TIMESTAMP)
    @Column(
            name = "expires_at",
            nullable = false,
            updatable = false,
            columnDefinition = "timestamp(6)")
    private Instant expiresAt;

    protected AuthTokenHistory() {}

    public AuthTokenHistory(AuthSession session) {
        this.tokenHash = session.getRefreshHash();
        this.session = session;
        this.expiresAt = session.getExpiresAt();
    }

    public String getTokenHash() {
        return tokenHash;
    }

    public AuthSession getSession() {
        return session;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    @Override
    public String toString() {
        return "AuthTokenHistory[tokens redacted]";
    }
}
