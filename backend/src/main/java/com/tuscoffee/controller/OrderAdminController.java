package com.tuscoffee.controller;

import com.tuscoffee.dto.OrderDtos.*;
import com.tuscoffee.security.IdentityPrincipal;
import com.tuscoffee.service.OrderService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/orders")
public class OrderAdminController {
    private final OrderService orderService;

    public OrderAdminController(OrderService orderService) {
        this.orderService = orderService;
    }

    @GetMapping
    public OrderPageResponse searchOrders(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String source,
            @RequestParam(required = false) String paymentStatus,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size) {
        return orderService.adminSearchOrders(status, source, paymentStatus, q, page, size);
    }

    @GetMapping("/{id}")
    public OrderDetailAdminResponse getOrder(@PathVariable long id) {
        return orderService.adminGetOrderDetails(id);
    }

    @PatchMapping("/{id}/status")
    public OrderResponse updateStatus(
            @PathVariable long id,
            @AuthenticationPrincipal IdentityPrincipal principal,
            @RequestBody AdminUpdateOrderStatusRequest req) {
        return orderService.adminUpdateStatus(id, principal.user().id(), req);
    }

    @PostMapping("/{id}/payment-confirmations")
    public OrderResponse confirmPayment(
            @PathVariable long id,
            @AuthenticationPrincipal IdentityPrincipal principal,
            @RequestBody AdminConfirmPaymentRequest req) {
        return orderService.adminConfirmPayment(id, principal.user().id(), req);
    }
}
