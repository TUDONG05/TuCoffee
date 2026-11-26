package com.tuscoffee.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "order_items")
public class OrderItem {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_id", nullable = false)
    private Order order;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @Column(name = "product_name", nullable = false, length = 200)
    private String productName;

    @Column(name = "unit_price_vnd", nullable = false)
    private long unitPriceVnd;

    @Column(nullable = false)
    private int quantity;

    @Column(name = "subtotal_vnd", insertable = false, updatable = false)
    private Long subtotalVnd;

    protected OrderItem() {}

    public OrderItem(Order order, Product product, String productName, long unitPriceVnd, int quantity) {
        this.order = order;
        this.product = product;
        this.productName = productName;
        this.unitPriceVnd = unitPriceVnd;
        this.quantity = quantity;
    }

    public Long getId() { return id; }
    public Order getOrder() { return order; }
    public Product getProduct() { return product; }
    public String getProductName() { return productName; }
    public long getUnitPriceVnd() { return unitPriceVnd; }
    public int getQuantity() { return quantity; }
    public long getSubtotalVnd() {
        return subtotalVnd != null ? subtotalVnd : (unitPriceVnd * quantity);
    }
}
