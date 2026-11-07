package com.tuscoffee.service;

import com.tuscoffee.config.PaymentSettings;
import com.tuscoffee.dto.OrderDtos.*;
import com.tuscoffee.entity.*;
import com.tuscoffee.exception.ApiException;
import com.tuscoffee.repository.*;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class OrderServiceUnitTests {
    private OrderService orderService;
    private User buyer;
    private User admin;
    private Product coffee;
    private final Map<Long, Order> orders = new HashMap<>();
    private final Map<Long, Payment> payments = new HashMap<>();
    private final Map<String, OrderRequest> requestsByKey = new HashMap<>();
    private final List<OrderEvent> events = new ArrayList<>();

    @BeforeEach
    void setUp() {
        orders.clear();
        payments.clear();
        requestsByKey.clear();
        events.clear();

        buyer = new User("Nguyen Van A", "buyer@example.com", "hash", "USER");
        buyer.updateProfile("Nguyen Van A", "0901234567", "123 Pho Hue");
        setEntityId(buyer, 1L);

        admin = new User("Admin", "admin@example.com", "hash", "ADMIN");
        setEntityId(admin, 2L);

        Category category = new Category("Coffee", "coffee");
        setEntityId(category, 1L);
        coffee = new Product(category, "Ca phe sua da", "Thom ngon", 35000L);
        setEntityId(coffee, 100L);

        PaymentSettings settings = new PaymentSettings(
                new PaymentSettings.BankSettings("VCB", "0123456789", "TU COFFEE"),
                new PaymentSettings.VnPaySettings("DEMOV210", "DEMOHASHSECRET210", "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html", "http://localhost:4200/orders/vnpay-return")
        );
        VnPayService vnPayService = new VnPayService(settings);

        UserRepository userRepo = (UserRepository) java.lang.reflect.Proxy.newProxyInstance(
                UserRepository.class.getClassLoader(),
                new Class<?>[]{UserRepository.class},
                (proxy, method, args) -> {
                    if ("findById".equals(method.getName())) {
                        Long id = (Long) args[0];
                        if (Long.valueOf(1L).equals(id)) return Optional.of(buyer);
                        if (Long.valueOf(2L).equals(id)) return Optional.of(admin);
                        return Optional.empty();
                    }
                    return null;
                });

        ProductRepository productRepo = (ProductRepository) java.lang.reflect.Proxy.newProxyInstance(
                ProductRepository.class.getClassLoader(),
                new Class<?>[]{ProductRepository.class},
                (proxy, method, args) -> {
                    if ("findAllById".equals(method.getName())) {
                        return List.of(coffee);
                    }
                    return null;
                });

        OrderRequestRepository orderRequestRepo = (OrderRequestRepository) java.lang.reflect.Proxy.newProxyInstance(
                OrderRequestRepository.class.getClassLoader(),
                new Class<?>[]{OrderRequestRepository.class},
                (proxy, method, args) -> {
                    if ("findByCreatorIdAndIdempotencyKey".equals(method.getName())) {
                        return Optional.ofNullable(requestsByKey.get(args[1]));
                    }
                    if ("save".equals(method.getName())) {
                        OrderRequest r = (OrderRequest) args[0];
                        requestsByKey.put(r.getIdempotencyKey(), r);
                        return r;
                    }
                    return null;
                });

        OrderRepository orderRepo = (OrderRepository) java.lang.reflect.Proxy.newProxyInstance(
                OrderRepository.class.getClassLoader(),
                new Class<?>[]{OrderRepository.class},
                (proxy, method, args) -> {
                    if ("save".equals(method.getName()) || "saveAndFlush".equals(method.getName())) {
                        Order o = (Order) args[0];
                        if (o.getId() == null) setEntityId(o, (long) (orders.size() + 1));
                        orders.put(o.getId(), o);
                        return o;
                    }
                    if ("findById".equals(method.getName()) || "findByIdForUpdate".equals(method.getName())) {
                        return Optional.ofNullable(orders.get(args[0]));
                    }
                    if ("findByPublicCode".equals(method.getName())) {
                        String code = (String) args[0];
                        return orders.values().stream()
                                .filter(o -> code.equals(o.getPublicCode()))
                                .findFirst();
                    }
                    return null;
                });

        OrderItemRepository orderItemRepo = (OrderItemRepository) java.lang.reflect.Proxy.newProxyInstance(
                OrderItemRepository.class.getClassLoader(),
                new Class<?>[]{OrderItemRepository.class},
                (proxy, method, args) -> {
                    if ("save".equals(method.getName())) {
                        OrderItem item = (OrderItem) args[0];
                        if (item.getId() == null) setEntityId(item, 1000L);
                        return item;
                    }
                    if ("findByOrderIdOrderByIdAsc".equals(method.getName())) {
                        return List.of(new OrderItem(orders.get(args[0]), coffee, coffee.getName(), coffee.getPriceVnd(), 2));
                    }
                    return null;
                });

        PaymentRepository paymentRepo = (PaymentRepository) java.lang.reflect.Proxy.newProxyInstance(
                PaymentRepository.class.getClassLoader(),
                new Class<?>[]{PaymentRepository.class},
                (proxy, method, args) -> {
                    if ("save".equals(method.getName()) || "saveAndFlush".equals(method.getName())) {
                        Payment p = (Payment) args[0];
                        if (p.getId() == null) setEntityId(p, (long) (payments.size() + 1));
                        payments.put(p.getOrder().getId(), p);
                        return p;
                    }
                    if ("findByOrderId".equals(method.getName())) {
                        return Optional.ofNullable(payments.get(args[0]));
                    }
                    if ("findByConfirmationKey".equals(method.getName())) {
                        String key = (String) args[0];
                        return payments.values().stream()
                                .filter(p -> key.equals(p.getConfirmationKey()))
                                .findFirst();
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

        orderService = new OrderService(
                orderRepo,
                orderItemRepo,
                orderRequestRepo,
                paymentRepo,
                orderEventRepo,
                productRepo,
                userRepo,
                settings,
                vnPayService);
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
    void createOnlineOrder_success() {
        CreateOrderRequest req = new CreateOrderRequest(
                List.of(new CreateOrderItemRequest(100L, 2, 35000L)),
                "Nguyen Van A",
                "0901234567",
                "123 Pho Hue",
                "It duong",
                "QR_TRANSFER");

        OrderResponse resp = orderService.createOnlineOrder(1L, "key-1", req, "payload-1");
        assertNotNull(resp);
        assertEquals(70000L, resp.totalVnd());
        assertEquals("PENDING", resp.status());
        assertEquals("ONLINE", resp.source());
        assertEquals("Nguyen Van A", resp.customerName());

        assertTrue(orders.containsKey(resp.id()));
        assertTrue(requestsByKey.containsKey("key-1"));
        Payment p = payments.get(resp.id());
        assertNotNull(p);
        assertEquals("QR_TRANSFER", p.getMethod());
        assertEquals(70000L, p.getAmountVnd());
    }

    @Test
    void createOnlineOrder_priceChangedRejection() {
        CreateOrderRequest req = new CreateOrderRequest(
                List.of(new CreateOrderItemRequest(100L, 2, 30000L)), // Expecting 30.000 but actual 35.000
                "Nguyen Van A",
                "0901234567",
                "123 Pho Hue",
                "",
                "CASH");

        ApiException ex = assertThrows(ApiException.class,
                () -> orderService.createOnlineOrder(1L, "key-1", req, "payload-1"));
        assertEquals(409, ex.status());
        assertEquals("PRICE_CHANGED", ex.code());
    }

    @Test
    void createOnlineOrder_idempotencyConflict() {
        // Pre-insert an order request with different hash
        Order order = new Order("TC123", buyer, null, buyer, "ONLINE", 70000L, "Nguyen Van A", null, null, null);
        setEntityId(order, 5L);
        orders.put(5L, order);
        requestsByKey.put("key-1", new OrderRequest(buyer, "key-1", "hash-different", order));

        CreateOrderRequest req = new CreateOrderRequest(
                List.of(new CreateOrderItemRequest(100L, 2, 35000L)),
                "Nguyen Van A",
                null,
                null,
                null,
                "CASH");

        ApiException ex = assertThrows(ApiException.class,
                () -> orderService.createOnlineOrder(1L, "key-1", req, "payload-new"));
        assertEquals(409, ex.status());
        assertEquals("IDEMPOTENCY_CONFLICT", ex.code());
    }

    @Test
    void cancelMyOrder_successWhenPendingAndUnpaid() {
        Order order = new Order("TC123", buyer, null, buyer, "ONLINE", 70000L, "A", null, null, null);
        setEntityId(order, 10L);
        orders.put(10L, order);
        Payment payment = new Payment(order, "CASH", 70000L, null, null, null, null);
        payments.put(10L, payment);

        OrderResponse resp = orderService.cancelMyOrder(10L, 1L, new CancelOrderRequest(0L, "Doi y"));
        assertEquals("CANCELLED", resp.status());
        assertEquals(1, events.size());
        assertEquals("STATUS_CHANGED", events.get(0).getEventType());
    }

    @Test
    void cancelMyOrder_paidOrderCannotBeCancelled() {
        Order order = new Order("TC123", buyer, null, buyer, "ONLINE", 70000L, "A", null, null, null);
        setEntityId(order, 10L);
        orders.put(10L, order);
        Payment payment = new Payment(order, "CASH", 70000L, null, null, null, null);
        payment.markPaid(admin, "conf-key", null);
        payments.put(10L, payment);

        ApiException ex = assertThrows(ApiException.class,
                () -> orderService.cancelMyOrder(10L, 1L, new CancelOrderRequest(0L, "Doi y")));
        assertEquals(409, ex.status());
        assertEquals("PAID_ORDER_CANNOT_BE_CANCELLED", ex.code());
    }

    @Test
    void adminUpdateStatus_completedRequiresPaid() {
        Order order = new Order("TC123", buyer, null, buyer, "ONLINE", 70000L, "A", null, null, null);
        setEntityId(order, 10L);
        order.markConfirmed();
        orders.put(10L, order);
        Payment payment = new Payment(order, "QR_TRANSFER", 70000L, "VCB", "0123456789", "TU COFFEE", "TC123");
        payments.put(10L, payment);

        ApiException ex = assertThrows(ApiException.class,
                () -> orderService.adminUpdateStatus(10L, 2L, new AdminUpdateOrderStatusRequest("COMPLETED", 0L, null)));
        assertEquals(409, ex.status());
        assertEquals("PAYMENT_REQUIRED", ex.code());
    }

    @Test
    void adminConfirmPayment_success() {
        Order order = new Order("TC123", buyer, null, buyer, "ONLINE", 70000L, "A", null, null, null);
        setEntityId(order, 10L);
        orders.put(10L, order);
        Payment payment = new Payment(order, "QR_TRANSFER", 70000L, "VCB", "0123456789", "TU COFFEE", "TC123");
        payments.put(10L, payment);

        OrderResponse resp = orderService.adminConfirmPayment(10L, 2L,
                new AdminConfirmPaymentRequest(70000L, "FT123456", 0L, "key-abc"));
        assertNotNull(resp);
        assertEquals("PAID", payment.getStatus());
        assertEquals("FT123456", payment.getReference());
        assertEquals(1, events.size());
        assertEquals("PAYMENT_CONFIRMED", events.get(0).getEventType());
    }

    @Test
    void createOrder_vnpayMethod_successAndUrlGenerated() {
        CreateOrderRequest req = new CreateOrderRequest(
                List.of(new CreateOrderItemRequest(100L, 2, 35000L)),
                "Nguyen Van A",
                "0901234567",
                "123 Pho Hue",
                "It duong",
                "VNPAY");

        OrderResponse res = orderService.createOnlineOrder(1L, "vnpay-key-1", req, "{}");
        assertNotNull(res);
        assertEquals("VNPAY", res.payment().method());
        assertEquals("UNPAID", res.payment().status());

        VnPayPaymentUrlResponse urlResp = orderService.getVnPayPaymentUrl(res.id(), 1L, false, "127.0.0.1");
        assertNotNull(urlResp.paymentUrl());
        assertTrue(urlResp.paymentUrl().startsWith("https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?"));
        assertTrue(urlResp.paymentUrl().contains("vnp_Amount=7000000"));
    }

    @Test
    void processVnPayReturn_invalidChecksum() {
        Map<String, String> params = Map.of(
                "vnp_TxnRef", "TC123",
                "vnp_ResponseCode", "00",
                "vnp_SecureHash", "invalid_hash"
        );
        VnPayReturnResponse returnResp = orderService.processVnPayReturn(params);
        assertFalse(returnResp.success());
        assertEquals("97", returnResp.code());
    }
}
