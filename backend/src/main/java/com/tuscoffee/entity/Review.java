package com.tuscoffee.entity;

import jakarta.persistence.*;
import java.time.Instant;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
@Entity @Table(name = "product_reviews")
public class Review {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "user_id") private User user;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "product_id") private Product product;
    @Column(nullable = false) private int stars;
    @Column(length = 2000) private String comment;
    @Column(name = "is_visible", nullable = false) private boolean visible = true;
    @Version private long version;
    @JdbcTypeCode(SqlTypes.TIMESTAMP) @Column(name = "created_at", nullable = false, updatable = false, columnDefinition = "timestamp(6)") private Instant createdAt;
    @JdbcTypeCode(SqlTypes.TIMESTAMP) @Column(name = "updated_at", nullable = false, columnDefinition = "timestamp(6)") private Instant updatedAt;
    protected Review() {
    }

    public Review(User user, Product product, int stars, String comment) {
        this.user = user;
        this.product = product;
        edit(stars, comment);
    }

    @PrePersist void create() {
        createdAt = Instant.now();
        updatedAt = createdAt;
    }

    @PreUpdate void touch() {
        updatedAt = Instant.now();
    }

    public void edit(int stars, String comment) {
        this.stars = stars;
        this.comment = comment;
        updatedAt = Instant.now();
    }

    public void moderate(boolean visible) {
        this.visible = visible;
        updatedAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public User getUser() {
        return user;
    }

    public Product getProduct() {
        return product;
    }

    public int getStars() {
        return stars;
    }

    public String getComment() {
        return comment;
    }

    public boolean isVisible() {
        return visible;
    }

    public long getVersion() {
        return version;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
