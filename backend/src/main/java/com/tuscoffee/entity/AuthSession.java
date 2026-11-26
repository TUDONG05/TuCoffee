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
@Table(name = "auth_sessions")
public class AuthSession {
    @Id
    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(length = 36, columnDefinition = "char(36)")
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false, updatable = false)
    private User user;

    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(
            name = "refresh_hash",
            nullable = false,
            unique = true,
            length = 64,
            columnDefinition = "char(64)")
    private String refreshHash;

    @JdbcTypeCode(SqlTypes.TIMESTAMP)
    @Column(
            name = "expires_at",
            nullable = false,
            updatable = false,
            columnDefinition = "timestamp(6)")
    private Instant expiresAt;

    @JdbcTypeCode(SqlTypes.TIMESTAMP)
    @Column(name = "revoked_at", columnDefinition = "timestamp(6)")
    private Instant revokedAt;

    @JdbcTypeCode(SqlTypes.TIMESTAMP)
    @Column(
            name = "created_at",
            nullable = false,
            updatable = false,
            columnDefinition = "timestamp(6)")
    private Instant createdAt;

    protected AuthSession() {}

    public AuthSession(String id, User user, String refreshHash, Instant expiresAt) {
        this.id = id;
        this.user = user;
        this.refreshHash = refreshHash;
        this.expiresAt = expiresAt;
        this.createdAt = Instant.now();
    }

    public String getId() {
        return id;
    }

    public User getUser() {
        return user;
    }

    public String getRefreshHash() {
        return refreshHash;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public Instant getRevokedAt() {
        return revokedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void rotate(String nextHash) {
        this.refreshHash = nextHash;
    }

    public void revoke(Instant now) {
        if (revokedAt == null) revokedAt = now;
    }

    @Override
    public String toString() {
        return "AuthSession[id=" + id + ", tokens redacted]";
    }
}
