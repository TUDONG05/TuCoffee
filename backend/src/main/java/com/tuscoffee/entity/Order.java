package com.tuscoffee.entity;

import jakarta.persistence.*;
import java.time.Instant;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "orders")
public class Order {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "public_code", nullable = false, length = 40)
    private String publicCode;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "buyer_id")
    private User buyer;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "operator_id")
    private User operator;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "created_by", nullable = false)
    private User createdBy;

    @Column(nullable = false, length = 10)
    private String source;

    @Column(nullable = false, length = 12)
    private String status = "PENDING";

    @Column(name = "total_vnd", nullable = false)
    private long totalVnd;

    @Column(name = "customer_name", nullable = false, length = 100)
    private String customerName;

    @Column(name = "customer_phone", length = 20)
    private String customerPhone;

    @Column(name = "customer_address", length = 300)
    private String customerAddress;

    @Column(length = 1000)
    private String note;

    @Version
    private long version;

    @JdbcTypeCode(SqlTypes.TIMESTAMP)
    @Column(name = "created_at", nullable = false, updatable = false, columnDefinition = "timestamp(6)")
    private Instant createdAt;

    @JdbcTypeCode(SqlTypes.TIMESTAMP)
    @Column(name = "updated_at", nullable = false, columnDefinition = "timestamp(6)")
    private Instant updatedAt;

    @JdbcTypeCode(SqlTypes.TIMESTAMP)
    @Column(name = "completed_at", columnDefinition = "timestamp(6)")
    private Instant completedAt;

    @JdbcTypeCode(SqlTypes.TIMESTAMP)
    @Column(name = "cancelled_at", columnDefinition = "timestamp(6)")
    private Instant cancelledAt;

    protected Order() {}

    public Order(
            String publicCode,
            User buyer,
            User operator,
            User createdBy,
            String source,
            long totalVnd,
            String customerName,
            String customerPhone,
            String customerAddress,
            String note) {
        this.publicCode = publicCode;
        this.buyer = buyer;
        this.operator = operator;
        this.createdBy = createdBy;
        this.source = source;
        this.status = "PENDING";
        this.totalVnd = totalVnd;
        this.customerName = customerName;
        this.customerPhone = customerPhone;
        this.customerAddress = customerAddress;
        this.note = note;
        this.createdAt = Instant.now();
        this.updatedAt = this.createdAt;
    }

    @PrePersist
    void prePersist() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
        updatedAt = createdAt;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = Instant.now();
    }

    public void markConfirmed() {
        this.status = "CONFIRMED";
        this.updatedAt = Instant.now();
    }

    public void markCompleted() {
        this.status = "COMPLETED";
        this.completedAt = Instant.now();
        this.cancelledAt = null;
        this.updatedAt = Instant.now();
    }

    public void markCancelled() {
        this.status = "CANCELLED";
        this.cancelledAt = Instant.now();
        this.completedAt = null;
        this.updatedAt = Instant.now();
    }

    public Long getId() { return id; }
    public String getPublicCode() { return publicCode; }
    public User getBuyer() { return buyer; }
    public User getOperator() { return operator; }
    public User getCreatedBy() { return createdBy; }
    public String getSource() { return source; }
    public String getStatus() { return status; }
    public long getTotalVnd() { return totalVnd; }
    public String getCustomerName() { return customerName; }
    public String getCustomerPhone() { return customerPhone; }
    public String getCustomerAddress() { return customerAddress; }
    public String getNote() { return note; }
    public long getVersion() { return version; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public Instant getCompletedAt() { return completedAt; }
    public Instant getCancelledAt() { return cancelledAt; }
}
