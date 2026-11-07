package com.tuscoffee.service;

import com.tuscoffee.config.PaymentSettings;
import com.tuscoffee.dto.SePayDtos.*;
import com.tuscoffee.entity.Order;
import com.tuscoffee.entity.OrderEvent;
import com.tuscoffee.entity.Payment;
import com.tuscoffee.entity.User;
import com.tuscoffee.repository.OrderEventRepository;
import com.tuscoffee.repository.OrderRepository;
import com.tuscoffee.repository.PaymentRepository;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SePayService {
    private static final Logger log = LoggerFactory.getLogger(SePayService.class);
    private static final Pattern CODE_PATTERN = Pattern.compile("(?i)(TC\\d+)");

    private final OrderRepository orderRepo;
    private final PaymentRepository paymentRepo;
    private final OrderEventRepository orderEventRepo;
    private final PaymentSettings paymentSettings;

    public SePayService(
            OrderRepository orderRepo,
            PaymentRepository paymentRepo,
            OrderEventRepository orderEventRepo,
            PaymentSettings paymentSettings) {
        this.orderRepo = orderRepo;
        this.paymentRepo = paymentRepo;
        this.orderEventRepo = orderEventRepo;
        this.paymentSettings = paymentSettings;
    }

    @Transactional
    public SePayWebhookResponse processWebhook(SePayWebhookRequest req, String authHeader) {
        log.info("Received SePay webhook: id={}, gateway={}, amount={}, content={}",
                req.id(), req.gateway(), req.transferAmount(), req.content());

        String configuredApiKey = paymentSettings.sepay().apiKey();
        if (configuredApiKey != null && !configuredApiKey.isBlank()) {
            String expectedHeader = "Apikey " + configuredApiKey.trim();
            if (authHeader == null || (!authHeader.trim().equals(expectedHeader) && !authHeader.trim().equals(configuredApiKey.trim()))) {
                log.warn("SePay webhook unauthorized: received '{}', expected '{}'", authHeader, expectedHeader);
                return new SePayWebhookResponse(false, "Invalid SePay API key");
            }
        }

        if (req.transferType() != null && !"in".equalsIgnoreCase(req.transferType())) {
            return new SePayWebhookResponse(true, "Ignored outgoing transfer");
        }

        String orderCode = extractOrderCode(req.code(), req.content(), req.description());
        if (orderCode == null) {
            log.warn("SePay webhook could not find order code in content: '{}', description: '{}'",
                    req.content(), req.description());
            return new SePayWebhookResponse(false, "No order code found in transaction content");
        }

        Order order = orderRepo.findByPublicCode(orderCode).orElse(null);
        if (order == null) {
            log.warn("SePay webhook order not found: {}", orderCode);
            return new SePayWebhookResponse(false, "Order not found: " + orderCode);
        }

        Payment payment = paymentRepo.findByOrderId(order.getId()).orElse(null);
        if (payment == null) {
            log.warn("SePay webhook payment record not found for order: {}", orderCode);
            return new SePayWebhookResponse(false, "Payment record not found for order: " + orderCode);
        }

        if ("PAID".equals(payment.getStatus())) {
            log.info("SePay webhook order {} is already marked PAID", orderCode);
            return new SePayWebhookResponse(true, "Order already paid");
        }

        long amount = req.transferAmount() != null ? req.transferAmount() : 0L;
        if (amount < order.getTotalVnd()) {
            log.warn("SePay webhook received amount {} < order total {}", amount, order.getTotalVnd());
            return new SePayWebhookResponse(false, "Transfer amount is less than order total: " + amount + " < " + order.getTotalVnd());
        }

        String reference = req.referenceCode() != null && !req.referenceCode().isBlank()
                ? req.referenceCode()
                : (req.id() != null ? String.valueOf(req.id()) : "SEPAY");

        payment.markPaid(null, "SEPAY:" + (req.id() != null ? req.id() : reference), reference);
        paymentRepo.save(payment);

        User actor = order.getBuyer() != null ? order.getBuyer() : order.getCreatedBy();
        OrderEvent event = new OrderEvent(
                order,
                actor,
                "PAYMENT_CONFIRMED",
                order.getStatus(),
                order.getStatus(),
                order.getVersion(),
                reference,
                "Xác nhận thanh toán tự động qua SePay (" + (req.gateway() != null ? req.gateway() : "Ngân hàng") + ", Mã GD: " + reference + ", Số tiền: " + amount + " đ).");
        orderEventRepo.save(event);

        log.info("Order {} successfully marked PAID via SePay", orderCode);
        return new SePayWebhookResponse(true, "Payment confirmed successfully");
    }

    private String extractOrderCode(String code, String content, String description) {
        if (code != null && !code.isBlank() && code.toUpperCase().startsWith("TC")) {
            return code.toUpperCase().trim();
        }
        if (content != null) {
            Matcher m = CODE_PATTERN.matcher(content);
            if (m.find()) {
                return m.group(1).toUpperCase();
            }
        }
        if (description != null) {
            Matcher m = CODE_PATTERN.matcher(description);
            if (m.find()) {
                return m.group(1).toUpperCase();
            }
        }
        return null;
    }
}
