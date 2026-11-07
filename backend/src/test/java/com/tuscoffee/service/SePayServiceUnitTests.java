package com.tuscoffee.service;

import static org.junit.jupiter.api.Assertions.*;

import com.tuscoffee.config.PaymentSettings;
import com.tuscoffee.dto.SePayDtos.*;
import com.tuscoffee.entity.*;
import com.tuscoffee.repository.*;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class SePayServiceUnitTests {
    private SePayService sePayService;
    private final Map<Long, Order> orders = new HashMap<>();
    private final Map<Long, Payment> payments = new HashMap<>();
    private final List<OrderEvent> events = new ArrayList<>();
    private User buyer;

    @BeforeEach
    void setUp() {
        orders.clear();
        payments.clear();
        events.clear();

        buyer = new User("Nguyen Van A", "buyer@example.com", "hash", "USER");
        setEntityId(buyer, 1L);

        PaymentSettings settings = new PaymentSettings(
                new PaymentSettings.BankSettings("VCB", "0123456789", "TU COFFEE"),
                new PaymentSettings.VnPaySettings("DEMOV210", "DEMOHASHSECRET210", "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html", "http://localhost:4200/orders/vnpay-return"),
                new PaymentSettings.SePaySettings("my-secret-sepay-key")
        );

        OrderRepository orderRepo = (OrderRepository) java.lang.reflect.Proxy.newProxyInstance(
                OrderRepository.class.getClassLoader(),
                new Class<?>[]{OrderRepository.class},
                (proxy, method, args) -> {
                    if ("findByPublicCode".equals(method.getName())) {
                        String code = (String) args[0];
                        return orders.values().stream()
                                .filter(o -> code.equalsIgnoreCase(o.getPublicCode()))
                                .findFirst();
                    }
                    return null;
                });

        PaymentRepository paymentRepo = (PaymentRepository) java.lang.reflect.Proxy.newProxyInstance(
                PaymentRepository.class.getClassLoader(),
                new Class<?>[]{PaymentRepository.class},
                (proxy, method, args) -> {
                    if ("save".equals(method.getName())) {
                        Payment p = (Payment) args[0];
                        payments.put(p.getOrder().getId(), p);
                        return p;
                    }
                    if ("findByOrderId".equals(method.getName())) {
                        return Optional.ofNullable(payments.get(args[0]));
                    }
                    return null;
                });

        OrderEventRepository orderEventRepo = (OrderEventRepository) java.lang.reflect.Proxy.newProxyInstance(
                OrderEventRepository.class.getClassLoader(),
                new Class<?>[]{OrderEventRepository.class},
                (proxy, method, args) -> {
                    if ("save".equals(method.getName())) {
                        events.add((OrderEvent) args[0]);
                        return args[0];
                    }
                    return null;
                });

        sePayService = new SePayService(orderRepo, paymentRepo, orderEventRepo, settings);
    }

    private static void setEntityId(Object entity, Long id) {
        try {
            var field = entity.getClass().getDeclaredField("id");
            field.setAccessible(true);
            field.set(entity, id);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    @Test
    void processWebhook_success() {
        Order order = new Order("TC1001", buyer, null, buyer, "ONLINE", 109000L, "A", null, null, null);
        setEntityId(order, 10L);
        orders.put(10L, order);

        Payment payment = new Payment(order, "QR_TRANSFER", 109000L, "MB", "0123456789", "TU COFFEE", "TC1001");
        payments.put(10L, payment);

        SePayWebhookRequest req = new SePayWebhookRequest(
                12345L,
                "MBBank",
                "2026-11-07 13:00:00",
                "0123456789",
                "",
                "TC1001",
                "TC1001 chuyen tien",
                "in",
                "NGUYEN VAN A chuyen khoan TC1001",
                109000L,
                1000000L,
                "FT99999"
        );

        SePayWebhookResponse resp = sePayService.processWebhook(req, "Apikey my-secret-sepay-key");
        assertTrue(resp.success());
        assertEquals("PAID", payment.getStatus());
        assertEquals("FT99999", payment.getReference());
        assertEquals(1, events.size());
        assertEquals("PAYMENT_CONFIRMED", events.get(0).getEventType());
    }

    @Test
    void processWebhook_invalidApiKey() {
        SePayWebhookRequest req = new SePayWebhookRequest(
                12345L, "MB", "", "", "", "TC1001", "TC1001", "in", "", 109000L, 0L, ""
        );
        SePayWebhookResponse resp = sePayService.processWebhook(req, "Apikey wrong-key");
        assertFalse(resp.success());
        assertEquals("Invalid SePay API key", resp.message());
    }

    @Test
    void processWebhook_underpaid() {
        Order order = new Order("TC1002", buyer, null, buyer, "ONLINE", 109000L, "A", null, null, null);
        setEntityId(order, 20L);
        orders.put(20L, order);
        Payment payment = new Payment(order, "QR_TRANSFER", 109000L, "MB", "0123456789", "TU COFFEE", "TC1002");
        payments.put(20L, payment);

        SePayWebhookRequest req = new SePayWebhookRequest(
                12346L, "MB", "", "", "", "TC1002", "TC1002", "in", "", 50000L, 0L, ""
        );
        SePayWebhookResponse resp = sePayService.processWebhook(req, "Apikey my-secret-sepay-key");
        assertFalse(resp.success());
        assertTrue(resp.message().contains("less than order total"));
        assertEquals("UNPAID", payment.getStatus());
    }
}
