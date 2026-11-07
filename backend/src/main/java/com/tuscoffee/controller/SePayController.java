package com.tuscoffee.controller;

import com.tuscoffee.dto.SePayDtos.*;
import com.tuscoffee.service.SePayService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/sepay")
public class SePayController {
    private final SePayService sePayService;

    public SePayController(SePayService sePayService) {
        this.sePayService = sePayService;
    }

    @PostMapping("/webhook")
    public ResponseEntity<SePayWebhookResponse> handleWebhook(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @RequestBody SePayWebhookRequest req) {
        SePayWebhookResponse response = sePayService.processWebhook(req, authHeader);
        if (response.success()) {
            return ResponseEntity.ok(response);
        } else {
            return ResponseEntity.badRequest().body(response);
        }
    }
}
