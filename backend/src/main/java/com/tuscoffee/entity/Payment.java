package com.tuscoffee.entity;

import jakarta.persistence.*;
import java.time.Instant;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "payments")
public class Payment {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_id", nullable = false)
    private Order order;

    @Column(nullable = false, length = 16)
    private String method;

    @Column(nullable = false, length = 8)
    private String status = "UNPAID";

    @Column(name = "amount_vnd", nullable = false)
    private long amountVnd;

    @Column(name = "bank_code", length = 30)
    private String bankCode;

    @Column(name = "bank_account", length = 50)
    private String bankAccount;

    @Column(name = "bank_account_name", length = 150)
    private String bankAccountName;

    @Column(name = "transfer_content", length = 100)
    private String transferContent;

    @Column(length = 100)
    private String reference;

    @Column(name = "confirmation_key", length = 160)
    private String confirmationKey;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "confirmed_by")
    private User confirmedBy;

    @JdbcTypeCode(SqlTypes.TIMESTAMP)
    @Column(name = "confirmed_at", columnDefinition = "timestamp(6)")
    private Instant confirmedAt;

    @JdbcTypeCode(SqlTypes.TIMESTAMP)
    @Column(name = "created_at", nullable = false, updatable = false, columnDefinition = "timestamp(6)")
    private Instant createdAt;

    protected Payment() {}

    public Payment(
            Order order,
            String method,
            long amountVnd,
            String bankCode,
            String bankAccount,
            String bankAccountName,
            String transferContent) {
        this.order = order;
        this.method = method;
        this.status = "UNPAID";
        this.amountVnd = amountVnd;
        if ("QR_TRANSFER".equals(method)) {
            this.bankCode = bankCode;
            this.bankAccount = bankAccount;
            this.bankAccountName = bankAccountName;
            this.transferContent = transferContent;
        } else if ("VNPAY".equals(method)) {
            this.bankCode = "VNPAY";
            this.bankAccount = null;
            this.bankAccountName = null;
            this.transferContent = transferContent;
        } else {
            this.bankCode = null;
            this.bankAccount = null;
            this.bankAccountName = null;
            this.transferContent = null;
        }
        this.createdAt = Instant.now();
    }

    @PrePersist
    void prePersist() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    public void markPaid(User confirmedBy, String confirmationKey, String reference) {
        this.status = "PAID";
        this.confirmedBy = confirmedBy;
        this.confirmedAt = Instant.now();
        this.confirmationKey = confirmationKey;
        if ("QR_TRANSFER".equals(this.method) || "VNPAY".equals(this.method)) {
            this.reference = reference;
        } else {
            this.reference = null;
        }
    }

    public Long getId() { return id; }
    public Order getOrder() { return order; }
    public String getMethod() { return method; }
    public String getStatus() { return status; }
    public long getAmountVnd() { return amountVnd; }
    public String getBankCode() { return bankCode; }
    public String getBankAccount() { return bankAccount; }
    public String getBankAccountName() { return bankAccountName; }
    public String getTransferContent() { return transferContent; }
    public String getReference() { return reference; }
    public String getConfirmationKey() { return confirmationKey; }
    public User getConfirmedBy() { return confirmedBy; }
    public Instant getConfirmedAt() { return confirmedAt; }
    public Instant getCreatedAt() { return createdAt; }
}
