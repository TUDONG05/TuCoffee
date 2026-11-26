package com.tuscoffee.entity;

import jakarta.persistence.*;
import java.time.Instant;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "order_events")
public class OrderEvent {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_id", nullable = false)
    private Order order;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "actor_id", nullable = false)
    private User actor;

    @Column(name = "event_type", nullable = false, length = 24)
    private String eventType;

    @Column(name = "from_status", length = 12)
    private String fromStatus;

    @Column(name = "to_status", nullable = false, length = 12)
    private String toStatus;

    @Column(name = "order_version", nullable = false)
    private long orderVersion;

    @Column(name = "payment_reference", length = 160)
    private String paymentReference;

    @Column(length = 1000)
    private String note;

    @JdbcTypeCode(SqlTypes.TIMESTAMP)
    @Column(name = "created_at", nullable = false, updatable = false, columnDefinition = "timestamp(6)")
    private Instant createdAt;

    protected OrderEvent() {}

    public OrderEvent(
            Order order,
            User actor,
            String eventType,
            String fromStatus,
            String toStatus,
            long orderVersion,
            String paymentReference,
            String note) {
        this.order = order;
        this.actor = actor;
        this.eventType = eventType;
        this.fromStatus = fromStatus;
        this.toStatus = toStatus;
        this.orderVersion = orderVersion;
        this.paymentReference = paymentReference;
        this.note = note;
        this.createdAt = Instant.now();
    }

    @PrePersist
    void prePersist() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    public Long getId() { return id; }
    public Order getOrder() { return order; }
    public User getActor() { return actor; }
    public String getEventType() { return eventType; }
    public String getFromStatus() { return fromStatus; }
    public String getToStatus() { return toStatus; }
    public long getOrderVersion() { return orderVersion; }
    public String getPaymentReference() { return paymentReference; }
    public String getNote() { return note; }
    public Instant getCreatedAt() { return createdAt; }
}
