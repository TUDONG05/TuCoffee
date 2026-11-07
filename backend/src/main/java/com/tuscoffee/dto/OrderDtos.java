package com.tuscoffee.dto;

import java.time.Instant;
import java.util.List;

public final class OrderDtos {
    private OrderDtos() {}

    public record CreateOrderItemRequest(
            Long productId,
            Integer quantity,
            Long expectedPriceVnd
    ) {}

    public record CreateOrderRequest(
            List<CreateOrderItemRequest> items,
            String customerName,
            String customerPhone,
            String customerAddress,
            String note,
            String paymentMethod
    ) {}

    public record OrderItemResponse(
            long id,
            long productId,
            String productName,
            long unitPriceVnd,
            int quantity,
            long subtotalVnd
    ) {}

    public record PaymentResponse(
            long id,
            String method,
            String status,
            long amountVnd,
            String bankCode,
            String bankAccount,
            String bankAccountName,
            String transferContent,
            String reference,
            Instant confirmedAt
    ) {}

    public record OrderResponse(
            long id,
            String publicCode,
            String source,
            String status,
            long totalVnd,
            String customerName,
            String customerPhone,
            String customerAddress,
            String note,
            long version,
            Instant createdAt,
            Instant updatedAt,
            Instant completedAt,
            Instant cancelledAt,
            List<OrderItemResponse> items,
            PaymentResponse payment
    ) {}

    public record PaymentInstructionsResponse(
            String method,
            String status,
            long amountVnd,
            String bankCode,
            String bankAccount,
            String bankAccountName,
            String transferContent,
            String qrUrl
    ) {}

    public record OrderEventResponse(
            long id,
            long actorId,
            String eventType,
            String fromStatus,
            String toStatus,
            long orderVersion,
            String paymentReference,
            String note,
            Instant createdAt
    ) {}

    public record OrderDetailAdminResponse(
            OrderResponse order,
            List<OrderEventResponse> events
    ) {}

    public record OrderPageResponse(
            List<OrderResponse> items,
            int page,
            int size,
            long totalItems,
            int totalPages
    ) {}

    public record CancelOrderRequest(
            Long version,
            String note
    ) {}

    public record AdminUpdateOrderStatusRequest(
            String targetStatus,
            Long version,
            String note
    ) {}

    public record AdminConfirmPaymentRequest(
            Long amountVnd,
            String reference,
            Long version,
            String confirmationKey
    ) {}
}
