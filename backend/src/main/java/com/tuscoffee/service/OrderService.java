package com.tuscoffee.service;

import com.tuscoffee.config.PaymentSettings;
import com.tuscoffee.dto.OrderDtos.*;
import com.tuscoffee.entity.*;
import com.tuscoffee.exception.ApiException;
import com.tuscoffee.repository.*;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OrderService {
    private final OrderRepository orderRepo;
    private final OrderItemRepository orderItemRepo;
    private final OrderRequestRepository orderRequestRepo;
    private final PaymentRepository paymentRepo;
    private final OrderEventRepository orderEventRepo;
    private final ProductRepository productRepo;
    private final UserRepository userRepo;
    private final PaymentSettings paymentSettings;
    private final VnPayService vnPayService;

    public OrderService(
            OrderRepository orderRepo,
            OrderItemRepository orderItemRepo,
            OrderRequestRepository orderRequestRepo,
            PaymentRepository paymentRepo,
            OrderEventRepository orderEventRepo,
            ProductRepository productRepo,
            UserRepository userRepo,
            PaymentSettings paymentSettings,
            VnPayService vnPayService) {
        this.orderRepo = orderRepo;
        this.orderItemRepo = orderItemRepo;
        this.orderRequestRepo = orderRequestRepo;
        this.paymentRepo = paymentRepo;
        this.orderEventRepo = orderEventRepo;
        this.productRepo = productRepo;
        this.userRepo = userRepo;
        this.paymentSettings = paymentSettings;
        this.vnPayService = vnPayService;
    }

    @Transactional
    public OrderResponse createOnlineOrder(long buyerId, String idempotencyKey, CreateOrderRequest req,
            String rawPayload) {
        User buyer = userRepo.findById(buyerId)
                .orElseThrow(() -> new ApiException(401, "UNAUTHORIZED", "Tài khoản không hợp lệ."));
        if (!buyer.isActive()) {
            throw new ApiException(403, "ACCOUNT_LOCKED", "Tài khoản đã bị khóa.");
        }
        if (idempotencyKey == null || idempotencyKey.isBlank() || idempotencyKey.length() > 36) {
            throw new ApiException(400, "INVALID_IDEMPOTENCY_KEY", "Idempotency-Key không hợp lệ.");
        }
        String requestHash = hashSha256(rawPayload != null ? rawPayload : req.toString());

        Optional<OrderRequest> existingRequest = orderRequestRepo.findByCreatorIdAndIdempotencyKey(buyer.getId(),
                idempotencyKey);
        if (existingRequest.isPresent()) {
            OrderRequest ordReq = existingRequest.get();
            if (ordReq.getRequestHash().equals(requestHash)) {
                return mapToOrderResponse(ordReq.getOrder());
            } else {
                throw new ApiException(409, "IDEMPOTENCY_CONFLICT",
                        "Idempotency-Key đã được sử dụng với nội dung khác.");
            }
        }

        if (req.items() == null || req.items().isEmpty()) {
            throw new ApiException(400, "EMPTY_CART", "Đơn hàng phải có ít nhất một món.");
        }
        if (req.items().size() > 50) {
            throw new ApiException(400, "TOO_MANY_ITEMS", "Đơn hàng không được vượt quá 50 loại món.");
        }

        String customerName = req.customerName() != null ? req.customerName().trim() : "";
        if (customerName.isEmpty() || customerName.length() > 100) {
            throw new ApiException(400, "INVALID_CUSTOMER_NAME",
                    "Họ tên người nhận không được để trống (tối đa 100 ký tự).");
        }
        String customerPhone = req.customerPhone() != null ? req.customerPhone().trim() : null;
        if (customerPhone != null && (customerPhone.isEmpty() || customerPhone.length() > 20)) {
            customerPhone = null;
        }
        String customerAddress = req.customerAddress() != null ? req.customerAddress().trim() : null;
        if (customerAddress != null && customerAddress.length() > 300) {
            customerAddress = customerAddress.substring(0, 300);
        }
        String note = req.note() != null ? req.note().trim() : null;
        if (note != null && note.length() > 1000) {
            note = note.substring(0, 1000);
        }
        String paymentMethod = req.paymentMethod();
        if (!"CASH".equals(paymentMethod) && !"QR_TRANSFER".equals(paymentMethod) && !"VNPAY".equals(paymentMethod)) {
            throw new ApiException(400, "INVALID_PAYMENT_METHOD",
                    "Phương thức thanh toán phải là CASH, QR_TRANSFER hoặc VNPAY.");
        }

        Map<Long, Integer> quantityByProduct = new LinkedHashMap<>();
        Map<Long, Long> expectedPriceByProduct = new LinkedHashMap<>();
        for (CreateOrderItemRequest item : req.items()) {
            if (item.productId() == null) {
                throw new ApiException(400, "INVALID_ITEM", "Mã sản phẩm không được để trống.");
            }
            if (item.quantity() == null || item.quantity() < 1 || item.quantity() > 99) {
                throw new ApiException(400, "INVALID_QUANTITY", "Số lượng món phải từ 1 đến 99.");
            }
            if (item.expectedPriceVnd() == null || item.expectedPriceVnd() < 0) {
                throw new ApiException(400, "MISSING_EXPECTED_PRICE", "expectedPriceVnd là bắt buộc để đối chiếu giá.");
            }
            quantityByProduct.merge(item.productId(), item.quantity(), Integer::sum);
            expectedPriceByProduct.putIfAbsent(item.productId(), item.expectedPriceVnd());
        }

        List<Product> products = productRepo.findAllById(quantityByProduct.keySet());
        if (products.size() != quantityByProduct.size()) {
            throw new ApiException(400, "PRODUCT_UNAVAILABLE", "Có món không tồn tại trong hệ thống.");
        }

        long totalVnd = 0;
        List<OrderItem> orderItemsToPersist = new ArrayList<>();
        String publicCode = generatePublicCode();

        Order order = new Order(
                publicCode,
                buyer,
                null,
                buyer,
                "ONLINE",
                0L,
                customerName,
                customerPhone,
                customerAddress,
                note);

        for (Product product : products) {
            if (!product.isActive() || product.getCategory() == null || !product.getCategory().isActive()) {
                throw new ApiException(400, "PRODUCT_UNAVAILABLE",
                        "Sản phẩm '" + product.getName() + "' hiện đã ngừng bán.");
            }
            int qty = quantityByProduct.get(product.getId());
            if (qty < 1 || qty > 99) {
                throw new ApiException(400, "INVALID_QUANTITY",
                        "Tổng số lượng cho món '" + product.getName() + "' phải từ 1 đến 99.");
            }
            long expectedPrice = expectedPriceByProduct.get(product.getId());
            if (expectedPrice != product.getPriceVnd()) {
                throw new ApiException(409, "PRICE_CHANGED",
                        "Giá sản phẩm '" + product.getName() + "' đã thay đổi. Vui lòng tải lại giỏ hàng.");
            }
            long itemSubtotal = product.getPriceVnd() * qty;
            totalVnd += itemSubtotal;
            orderItemsToPersist.add(new OrderItem(order, product, product.getName(), product.getPriceVnd(), qty));
        }

        if (totalVnd < 0 || totalVnd > 100_000_000L) {
            throw new ApiException(400, "INVALID_TOTAL_AMOUNT",
                    "Tổng tiền đơn hàng không hợp lệ (tối đa 100.000.000 đ).");
        }

        order = new Order(
                publicCode,
                buyer,
                null,
                buyer,
                "ONLINE",
                totalVnd,
                customerName,
                customerPhone,
                customerAddress,
                note);
        order = orderRepo.save(order);

        for (OrderItem oi : orderItemsToPersist) {
            orderItemRepo.save(
                    new OrderItem(order, oi.getProduct(), oi.getProductName(), oi.getUnitPriceVnd(), oi.getQuantity()));
        }

        Payment payment = new Payment(
                order,
                paymentMethod,
                totalVnd,
                paymentSettings.bank().code(),
                paymentSettings.bank().account(),
                paymentSettings.bank().accountName(),
                publicCode);
        payment = paymentRepo.save(payment);

        OrderEvent event = new OrderEvent(
                order,
                buyer,
                "CREATED",
                null,
                "PENDING",
                0L,
                null,
                "Đơn hàng trực tuyến được tạo.");
        orderEventRepo.save(event);

        OrderRequest orderReq = new OrderRequest(buyer, idempotencyKey, requestHash, order);
        orderRequestRepo.save(orderReq);

        return mapToOrderResponse(order);
    }

    @Transactional(readOnly = true)
    public OrderPageResponse getMyOrders(long buyerId, int page, int size) {
        int boundedPage = Math.max(0, Math.min(page, 1_000_000));
        int boundedSize = Math.max(1, Math.min(size, 100));
        Pageable pageable = PageRequest.of(boundedPage, boundedSize, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<Order> orderPage = orderRepo.findByBuyerIdOrderByCreatedAtDesc(buyerId, pageable);
        List<OrderResponse> items = batchMapOrderResponses(orderPage.getContent());
        return new OrderPageResponse(items, orderPage.getNumber(), orderPage.getSize(), orderPage.getTotalElements(),
                orderPage.getTotalPages());
    }

    @Transactional(readOnly = true)
    public OrderResponse getOrderDetails(long orderId, long currentUserId, boolean isAdmin) {
        Order order = orderRepo.findById(orderId)
                .orElseThrow(() -> new ApiException(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn hàng."));
        if (!isAdmin && (order.getBuyer() == null || order.getBuyer().getId() != currentUserId)) {
            throw new ApiException(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn hàng.");
        }
        return mapToOrderResponse(order);
    }

    @Transactional(readOnly = true)
    public PaymentInstructionsResponse getPaymentInstructions(long orderId, long currentUserId, boolean isAdmin) {
        Order order = orderRepo.findById(orderId)
                .orElseThrow(() -> new ApiException(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn hàng."));
        if (!isAdmin && (order.getBuyer() == null || order.getBuyer().getId() != currentUserId)) {
            throw new ApiException(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn hàng.");
        }
        Payment payment = paymentRepo.findByOrderId(orderId)
                .orElseThrow(() -> new ApiException(404, "PAYMENT_NOT_FOUND", "Không tìm thấy thông tin thanh toán."));

        String qrUrl = null;
        if ("QR_TRANSFER".equals(payment.getMethod()) && payment.getBankCode() != null
                && payment.getBankAccount() != null) {
            String accNameEncoded = payment.getBankAccountName() != null
                    ? URLEncoder.encode(payment.getBankAccountName(), StandardCharsets.UTF_8)
                    : "";
            String transferContentEncoded = payment.getTransferContent() != null
                    ? URLEncoder.encode(payment.getTransferContent(), StandardCharsets.UTF_8)
                    : "";
            qrUrl = "https://img.vietqr.io/image/" + payment.getBankCode() + "-" + payment.getBankAccount()
                    + "-compact2.png?amount=" + payment.getAmountVnd()
                    + "&addInfo=" + transferContentEncoded
                    + "&accountName=" + accNameEncoded;
        }

        return new PaymentInstructionsResponse(
                payment.getMethod(),
                payment.getStatus(),
                payment.getAmountVnd(),
                payment.getBankCode(),
                payment.getBankAccount(),
                payment.getBankAccountName(),
                payment.getTransferContent(),
                qrUrl);
    }

    @Transactional
    public OrderResponse cancelMyOrder(long orderId, long buyerId, CancelOrderRequest req) {
        User buyer = userRepo.findById(buyerId)
                .orElseThrow(() -> new ApiException(401, "UNAUTHORIZED", "Tài khoản không hợp lệ."));
        Order order = orderRepo.findByIdForUpdate(orderId)
                .orElseThrow(() -> new ApiException(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn hàng."));
        if (order.getBuyer() == null || !order.getBuyer().getId().equals(buyer.getId())) {
            throw new ApiException(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn hàng.");
        }
        if (req.version() != null && req.version() != order.getVersion()) {
            throw new ApiException(409, "STALE_ORDER_VERSION",
                    "Trạng thái đơn hàng đã thay đổi. Vui lòng tải lại trang.");
        }
        Payment payment = paymentRepo.findByOrderId(orderId)
                .orElseThrow(() -> new ApiException(404, "PAYMENT_NOT_FOUND", "Không tìm thấy thanh toán."));

        if ("PAID".equals(payment.getStatus())) {
            throw new ApiException(409, "PAID_ORDER_CANNOT_BE_CANCELLED",
                    "Đơn hàng đã thanh toán không thể hủy qua ứng dụng. Vui lòng liên hệ quán.");
        }
        if (!"PENDING".equals(order.getStatus())) {
            throw new ApiException(409, "INVALID_ORDER_STATE",
                    "Không thể hủy đơn hàng ở trạng thái '" + order.getStatus() + "'.");
        }

        order.markCancelled();
        order = orderRepo.saveAndFlush(order);

        OrderEvent event = new OrderEvent(
                order,
                buyer,
                "STATUS_CHANGED",
                "PENDING",
                "CANCELLED",
                order.getVersion(),
                null,
                req.note() != null ? req.note() : "Khách hàng hủy đơn.");
        orderEventRepo.save(event);

        return mapToOrderResponse(order);
    }

    @Transactional(readOnly = true)
    public OrderPageResponse adminSearchOrders(String status, String source, String paymentStatus, String q, int page,
            int size) {
        int boundedPage = Math.max(0, Math.min(page, 1_000_000));
        int boundedSize = Math.max(1, Math.min(size, 100));
        Pageable pageable = PageRequest.of(boundedPage, boundedSize);

        String cleanStatus = status != null && !status.isBlank() ? status.trim() : null;
        String cleanSource = source != null && !source.isBlank() ? source.trim() : null;
        String cleanPayment = paymentStatus != null && !paymentStatus.isBlank() ? paymentStatus.trim() : null;
        String pattern = null;
        if (q != null && !q.isBlank()) {
            String escaped = q.trim()
                    .replace("!", "!!")
                    .replace("%", "!%")
                    .replace("_", "!_");
            pattern = "%" + escaped.toLowerCase() + "%";
        }

        Page<Order> orderPage = orderRepo.searchAdmin(cleanStatus, cleanSource, cleanPayment, pattern, pageable);
        List<OrderResponse> items = batchMapOrderResponses(orderPage.getContent());
        return new OrderPageResponse(items, orderPage.getNumber(), orderPage.getSize(), orderPage.getTotalElements(),
                orderPage.getTotalPages());
    }

    @Transactional(readOnly = true)
    public OrderDetailAdminResponse adminGetOrderDetails(long orderId) {
        Order order = orderRepo.findById(orderId)
                .orElseThrow(() -> new ApiException(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn hàng."));
        OrderResponse orderResponse = mapToOrderResponse(order);
        List<OrderEvent> events = orderEventRepo.findByOrderIdOrderByCreatedAtAscIdAsc(orderId);
        List<OrderEventResponse> eventResponses = events.stream()
                .map(e -> new OrderEventResponse(
                        e.getId(),
                        e.getActor().getId(),
                        e.getEventType(),
                        e.getFromStatus(),
                        e.getToStatus(),
                        e.getOrderVersion(),
                        e.getPaymentReference(),
                        e.getNote(),
                        e.getCreatedAt()))
                .toList();
        return new OrderDetailAdminResponse(orderResponse, eventResponses);
    }

    @Transactional
    public OrderResponse adminUpdateStatus(long orderId, long adminId, AdminUpdateOrderStatusRequest req) {
        User admin = userRepo.findById(adminId)
                .orElseThrow(() -> new ApiException(401, "UNAUTHORIZED", "Tài khoản không hợp lệ."));
        Order order = orderRepo.findByIdForUpdate(orderId)
                .orElseThrow(() -> new ApiException(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn hàng."));
        if (req.version() != null && req.version() != order.getVersion()) {
            throw new ApiException(409, "STALE_ORDER_VERSION", "Trạng thái đơn hàng đã thay đổi. Vui lòng tải lại.");
        }
        String fromStatus = order.getStatus();
        String toStatus = req.targetStatus() != null ? req.targetStatus().trim() : "";

        Payment payment = paymentRepo.findByOrderId(orderId)
                .orElseThrow(() -> new ApiException(404, "PAYMENT_NOT_FOUND", "Không tìm thấy thanh toán."));

        if ("CONFIRMED".equals(toStatus)) {
            if (!"PENDING".equals(fromStatus)) {
                throw new ApiException(409, "INVALID_STATE_TRANSITION",
                        "Chỉ có thể xác nhận đơn từ trạng thái PENDING.");
            }
            order.markConfirmed();
        } else if ("COMPLETED".equals(toStatus)) {
            if (!"CONFIRMED".equals(fromStatus)) {
                throw new ApiException(409, "INVALID_STATE_TRANSITION",
                        "Chỉ có thể hoàn tất đơn khi đã xác nhận (CONFIRMED).");
            }
            if (!"PAID".equals(payment.getStatus())) {
                throw new ApiException(409, "PAYMENT_REQUIRED",
                        "Đơn hàng phải được thanh toán (PAID) trước khi hoàn tất.");
            }
            order.markCompleted();
        } else if ("CANCELLED".equals(toStatus)) {
            if (!"PENDING".equals(fromStatus) && !"CONFIRMED".equals(fromStatus)) {
                throw new ApiException(409, "INVALID_STATE_TRANSITION",
                        "Không thể hủy đơn hàng ở trạng thái " + fromStatus);
            }
            if ("PAID".equals(payment.getStatus())) {
                throw new ApiException(409, "PAID_ORDER_CANNOT_BE_CANCELLED",
                        "Đơn hàng đã thanh toán không thể hủy qua hệ thống.");
            }
            order.markCancelled();
        } else {
            throw new ApiException(400, "INVALID_TARGET_STATUS", "Trạng thái đích không hợp lệ: " + toStatus);
        }

        order = orderRepo.saveAndFlush(order);

        OrderEvent event = new OrderEvent(
                order,
                admin,
                "STATUS_CHANGED",
                fromStatus,
                toStatus,
                order.getVersion(),
                null,
                req.note() != null ? req.note() : "Quản trị viên cập nhật trạng thái.");
        orderEventRepo.save(event);

        return mapToOrderResponse(order);
    }

    @Transactional
    public OrderResponse adminConfirmPayment(long orderId, long adminId, AdminConfirmPaymentRequest req) {
        if (req.confirmationKey() == null || req.confirmationKey().isBlank()) {
            throw new ApiException(400, "INVALID_CONFIRMATION_KEY", "confirmationKey là bắt buộc.");
        }
        User admin = userRepo.findById(adminId)
                .orElseThrow(() -> new ApiException(401, "UNAUTHORIZED", "Tài khoản không hợp lệ."));
        Optional<Payment> existingWithKey = paymentRepo.findByConfirmationKey(req.confirmationKey());
        if (existingWithKey.isPresent()) {
            Payment p = existingWithKey.get();
            if (p.getOrder().getId().equals(orderId)) {
                return mapToOrderResponse(p.getOrder());
            } else {
                throw new ApiException(409, "DATA_CONFLICT", "Confirmation key đã được sử dụng cho giao dịch khác.");
            }
        }

        Order order = orderRepo.findByIdForUpdate(orderId)
                .orElseThrow(() -> new ApiException(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn hàng."));
        if ("CANCELLED".equals(order.getStatus())) {
            throw new ApiException(409, "INVALID_ORDER_STATE", "Không thể xác nhận thanh toán cho đơn hàng đã hủy.");
        }
        if (req.version() != null && req.version() != order.getVersion()) {
            throw new ApiException(409, "STALE_ORDER_VERSION", "Trạng thái đơn hàng đã bị thay đổi.");
        }

        Payment payment = paymentRepo.findByOrderId(orderId)
                .orElseThrow(() -> new ApiException(404, "PAYMENT_NOT_FOUND", "Không tìm thấy thanh toán."));

        if ("PAID".equals(payment.getStatus())) {
            if (req.confirmationKey().equals(payment.getConfirmationKey())) {
                return mapToOrderResponse(order);
            }
            throw new ApiException(409, "PAYMENT_ALREADY_PAID", "Đơn hàng này đã được xác nhận thanh toán trước đó.");
        }

        if (req.amountVnd() == null || req.amountVnd() != order.getTotalVnd()) {
            throw new ApiException(400, "INVALID_AMOUNT", "Số tiền xác nhận (" + req.amountVnd()
                    + " đ) không khớp với số tiền đơn hàng (" + order.getTotalVnd() + " đ).");
        }

        String ref = req.reference() != null ? req.reference().trim() : null;
        if ("QR_TRANSFER".equals(payment.getMethod())) {
            if (ref == null || ref.isEmpty()) {
                throw new ApiException(400, "MISSING_REFERENCE",
                        "Mã giao dịch ngân hàng (reference) là bắt buộc khi chuyển khoản.");
            }
        } else {
            ref = null;
        }

        payment.markPaid(admin, req.confirmationKey(), ref);
        payment = paymentRepo.saveAndFlush(payment);

        OrderEvent event = new OrderEvent(
                order,
                admin,
                "PAYMENT_CONFIRMED",
                order.getStatus(),
                order.getStatus(),
                order.getVersion(),
                ref,
                "Quản trị viên xác nhận thanh toán thành công.");
        orderEventRepo.save(event);

        return mapToOrderResponse(order);
    }

    private OrderResponse mapToOrderResponse(Order order) {
        List<OrderItem> items = orderItemRepo.findByOrderIdOrderByIdAsc(order.getId());
        Payment payment = paymentRepo.findByOrderId(order.getId()).orElse(null);
        return toOrderResponse(order, items, payment);
    }

    private List<OrderResponse> batchMapOrderResponses(List<Order> orders) {
        if (orders.isEmpty())
            return List.of();
        List<Long> orderIds = orders.stream().map(Order::getId).toList();
        Map<Long, List<OrderItem>> itemsByOrderId = orderItemRepo.findByOrderIdIn(orderIds)
                .stream().collect(Collectors.groupingBy(oi -> oi.getOrder().getId()));
        Map<Long, Payment> paymentByOrderId = paymentRepo.findByOrderIdIn(orderIds)
                .stream().collect(Collectors.toMap(p -> p.getOrder().getId(), p -> p, (a, b) -> a));

        return orders.stream()
                .map(o -> toOrderResponse(o, itemsByOrderId.getOrDefault(o.getId(), List.of()),
                        paymentByOrderId.get(o.getId())))
                .toList();
    }

    private OrderResponse toOrderResponse(Order order, List<OrderItem> items, Payment payment) {
        List<OrderItemResponse> itemDtos = items.stream()
                .map(i -> new OrderItemResponse(
                        i.getId() != null ? i.getId() : 0L,
                        i.getProduct() != null && i.getProduct().getId() != null ? i.getProduct().getId() : 0L,
                        i.getProductName(),
                        i.getUnitPriceVnd(),
                        i.getQuantity(),
                        i.getSubtotalVnd()))
                .toList();

        PaymentResponse paymentDto = payment != null
                ? new PaymentResponse(
                        payment.getId() != null ? payment.getId() : 0L,
                        payment.getMethod(),
                        payment.getStatus(),
                        payment.getAmountVnd(),
                        payment.getBankCode(),
                        payment.getBankAccount(),
                        payment.getBankAccountName(),
                        payment.getTransferContent(),
                        payment.getReference(),
                        payment.getConfirmedAt())
                : null;

        return new OrderResponse(
                order.getId() != null ? order.getId() : 0L,
                order.getPublicCode(),
                order.getSource(),
                order.getStatus(),
                order.getTotalVnd(),
                order.getCustomerName(),
                order.getCustomerPhone(),
                order.getCustomerAddress(),
                order.getNote(),
                order.getVersion(),
                order.getCreatedAt(),
                order.getUpdatedAt(),
                order.getCompletedAt(),
                order.getCancelledAt(),
                itemDtos,
                paymentDto);
    }

    @Transactional(readOnly = true)
    public VnPayPaymentUrlResponse getVnPayPaymentUrl(long orderId, long currentUserId, boolean isAdmin,
            String ipAddress) {
        Order order = orderRepo.findById(orderId)
                .orElseThrow(() -> new ApiException(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn hàng."));

        if (!isAdmin && order.getBuyer() != null && !Objects.equals(order.getBuyer().getId(), currentUserId)) {
            throw new ApiException(403, "FORBIDDEN", "Bạn không có quyền truy cập đơn hàng này.");
        }

        Payment payment = paymentRepo.findByOrderId(orderId)
                .orElseThrow(() -> new ApiException(404, "PAYMENT_NOT_FOUND", "Không tìm thấy thông tin thanh toán."));

        if ("PAID".equals(payment.getStatus())) {
            throw new ApiException(400, "ALREADY_PAID", "Đơn hàng đã được thanh toán thành công.");
        }
        if ("CANCELLED".equals(order.getStatus()) || "COMPLETED".equals(order.getStatus())) {
            throw new ApiException(400, "INVALID_ORDER_STATUS",
                    "Không thể thanh toán đơn hàng có trạng thái " + order.getStatus() + ".");
        }

        String url = vnPayService.createPaymentUrl(order, ipAddress);
        return new VnPayPaymentUrlResponse(url);
    }

    @Transactional
    public VnPayIpnResponse processVnPayIpn(Map<String, String> params) {
        if (!vnPayService.verifySignature(params)) {
            return new VnPayIpnResponse("97", "Invalid Checksum");
        }

        String txnRef = params.get("vnp_TxnRef");
        if (txnRef == null || txnRef.isBlank()) {
            return new VnPayIpnResponse("01", "Order not Found");
        }

        Order order = orderRepo.findByPublicCode(txnRef).orElse(null);
        if (order == null) {
            return new VnPayIpnResponse("01", "Order not Found");
        }

        Payment payment = paymentRepo.findByOrderId(order.getId()).orElse(null);
        if (payment == null) {
            return new VnPayIpnResponse("01", "Order not Found");
        }

        long vnpAmount;
        try {
            vnpAmount = Long.parseLong(params.getOrDefault("vnp_Amount", "0"));
        } catch (NumberFormatException e) {
            return new VnPayIpnResponse("04", "Invalid Amount");
        }

        if (vnpAmount != order.getTotalVnd() * 100) {
            return new VnPayIpnResponse("04", "Invalid Amount");
        }

        if ("PAID".equals(payment.getStatus())) {
            return new VnPayIpnResponse("02", "Order already confirmed");
        }

        String responseCode = params.get("vnp_ResponseCode");
        String transactionNo = params.getOrDefault("vnp_TransactionNo", "");
        String bankCode = params.getOrDefault("vnp_BankCode", "");
        User actor = order.getBuyer() != null ? order.getBuyer() : order.getCreatedBy();

        if ("00".equals(responseCode)) {
            payment.markPaid(null, "VNPAY:" + transactionNo, transactionNo);
            paymentRepo.save(payment);

            OrderEvent event = new OrderEvent(
                    order,
                    actor,
                    "PAYMENT_CONFIRMED",
                    order.getStatus(),
                    order.getStatus(),
                    order.getVersion(),
                    transactionNo,
                    "Xác nhận thanh toán VNPAY IPN thành công (Mã GD: " + transactionNo + ", Ngân hàng: " + bankCode
                            + ").");
            orderEventRepo.save(event);
        } else {
            OrderEvent event = new OrderEvent(
                    order,
                    actor,
                    "PAYMENT_FAILED",
                    order.getStatus(),
                    order.getStatus(),
                    order.getVersion(),
                    transactionNo,
                    "Thanh toán VNPAY không thành công (ResponseCode: " + responseCode + ").");
            orderEventRepo.save(event);
        }

        return new VnPayIpnResponse("00", "Confirm Success");
    }

    @Transactional
    public VnPayReturnResponse processVnPayReturn(Map<String, String> params) {
        boolean valid = vnPayService.verifySignature(params);
        String txnRef = params.get("vnp_TxnRef");
        String responseCode = params.getOrDefault("vnp_ResponseCode", "");
        String transactionNo = params.getOrDefault("vnp_TransactionNo", "");

        Order order = txnRef != null ? orderRepo.findByPublicCode(txnRef).orElse(null) : null;
        Long orderId = order != null ? order.getId() : null;

        if (!valid) {
            return new VnPayReturnResponse(false, "97", "Chữ ký không hợp lệ.", orderId, txnRef);
        }

        if ("00".equals(responseCode)) {
            if (order != null) {
                User actor = order.getBuyer() != null ? order.getBuyer() : order.getCreatedBy();
                paymentRepo.findByOrderId(order.getId()).ifPresent(payment -> {
                    if (!"PAID".equals(payment.getStatus())) {
                        payment.markPaid(null, "VNPAY:" + transactionNo, transactionNo);
                        paymentRepo.save(payment);

                        OrderEvent event = new OrderEvent(
                                order,
                                actor,
                                "PAYMENT_CONFIRMED",
                                order.getStatus(),
                                order.getStatus(),
                                order.getVersion(),
                                transactionNo,
                                "Thanh toán VNPAY thành công qua Return URL (Mã GD: " + transactionNo + ").");
                        orderEventRepo.save(event);
                    }
                });
            }
            return new VnPayReturnResponse(true, "00", "Giao dịch thanh toán thành công qua VNPAY.", orderId, txnRef);
        }

        return new VnPayReturnResponse(false, responseCode,
                "Giao dịch không thành công hoặc người dùng đã hủy (Mã lỗi: " + responseCode + ").", orderId, txnRef);
    }

    private String generatePublicCode() {
        return "TC" + (System.currentTimeMillis() % 100_000_000L) + String.format("%04d", new Random().nextInt(10000));
    }

    private String hashSha256(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 not available", e);
        }
    }
}
