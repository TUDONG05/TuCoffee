package com.tuscoffee.entity;

import jakarta.persistence.*;
import java.time.Instant;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
@Entity @Table(name = "review_moderation_events")
public class ReviewModerationEvent {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "review_id") private Review review;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "actor_id") private User actor;
    @Column(name = "is_visible", nullable = false) private boolean visible;
    @Column(nullable = false, length = 500) private String reason;
    @Column(name = "review_version", nullable = false) private long reviewVersion;
    @JdbcTypeCode(SqlTypes.TIMESTAMP) @Column(name = "created_at", nullable = false, updatable = false, columnDefinition = "timestamp(6)") private Instant createdAt;
    protected ReviewModerationEvent() {
    }

    public ReviewModerationEvent(Review review, User actor, String reason) {
        this.review = review;
        this.actor = actor;
        this.reason = reason;
        visible = review.isVisible();
        reviewVersion = review.getVersion();
        createdAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public User getActor() {
        return actor;
    }

    public boolean isVisible() {
        return visible;
    }

    public String getReason() {
        return reason;
    }

    public long getReviewVersion() {
        return reviewVersion;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
