package com.tuscoffee.controller;

import com.tuscoffee.dto.OrderDtos.*;
import com.tuscoffee.security.IdentityPrincipal;
import com.tuscoffee.service.OrderService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/orders")
public class OrderController {
    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public OrderResponse createOrder(
            @AuthenticationPrincipal IdentityPrincipal principal,
            @RequestHeader(value = "Idempotency-Key", required = true) String idempotencyKey,
            @RequestBody CreateOrderRequest req) {
        return orderService.createOnlineOrder(principal.user().id(), idempotencyKey, req, req.toString());
    }

    @GetMapping("/mine")
    public OrderPageResponse getMyOrders(
            @AuthenticationPrincipal IdentityPrincipal principal,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size) {
        return orderService.getMyOrders(principal.user().id(), page, size);
    }

    @GetMapping("/{id}")
    public OrderResponse getOrder(
            @AuthenticationPrincipal IdentityPrincipal principal,
            @PathVariable long id) {
        boolean isAdmin = "ADMIN".equals(principal.user().role());
        return orderService.getOrderDetails(id, principal.user().id(), isAdmin);
    }

    @GetMapping("/{id}/payment-instructions")
    public PaymentInstructionsResponse getPaymentInstructions(
            @AuthenticationPrincipal IdentityPrincipal principal,
            @PathVariable long id) {
        boolean isAdmin = "ADMIN".equals(principal.user().role());
        return orderService.getPaymentInstructions(id, principal.user().id(), isAdmin);
    }

    @PatchMapping("/{id}/cancel")
    public OrderResponse cancelOrder(
            @AuthenticationPrincipal IdentityPrincipal principal,
            @PathVariable long id,
            @RequestBody(required = false) CancelOrderRequest req) {
        CancelOrderRequest safeReq = req != null ? req : new CancelOrderRequest(null, null);
        return orderService.cancelMyOrder(id, principal.user().id(), safeReq);
    }
}
