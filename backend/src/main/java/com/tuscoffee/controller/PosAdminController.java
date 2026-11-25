package com.tuscoffee.controller;

import com.tuscoffee.dto.OrderDtos.*;
import com.tuscoffee.security.IdentityPrincipal;
import com.tuscoffee.service.OrderService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/pos/orders")
public class PosAdminController {
    private final OrderService orders;
    public PosAdminController(OrderService orders) { this.orders = orders; }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public OrderResponse create(@AuthenticationPrincipal IdentityPrincipal principal,
            @RequestHeader("Idempotency-Key") String key,
            @RequestParam(value = "autoComplete", defaultValue = "false") boolean autoComplete,
            @RequestBody CreateOrderRequest request) {
        if (autoComplete && "CASH".equals(request.paymentMethod())) {
            return orders.createAndCompletePosCashOrder(principal.user().id(), key, request);
        }
        return orders.createPosOrder(principal.user().id(), key, request);
    }

    @GetMapping("/{id}/receipt")
    public OrderResponse receipt(@PathVariable long id) { return orders.getPosReceipt(id); }
}
