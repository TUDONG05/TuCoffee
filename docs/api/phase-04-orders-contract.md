# Contract giai đoạn 4: Đơn hàng và thanh toán

Base `/api/v1`; errors `application/problem+json` (RFC 9457), CSRF và JWT cookie/bearer cho yêu cầu ghi.
Các endpoint đơn hàng trực tuyến yêu cầu đăng nhập (USER hoặc ADMIN). Quyền ADMIN riêng cho quản trị đơn hàng.

## 1. Mô hình dữ liệu (DTO)

- **OrderItemRequest**: `{ productId: Long, quantity: Int (1..99), expectedPriceVnd: Long }`
- **CreateOrderRequest**: `{ items: List<OrderItemRequest> (1..50 món), customerName: String (1..100), customerPhone?: String, customerAddress?: String, note?: String, paymentMethod: "CASH" | "QR_TRANSFER" }`
- **OrderItemResponse**: `{ id: Long, productId: Long, productName: String, unitPriceVnd: Long, quantity: Int, subtotalVnd: Long }`
- **PaymentResponse**: `{ id: Long, method: "CASH" | "QR_TRANSFER", status: "UNPAID" | "PAID", amountVnd: Long, bankCode?: String, bankAccount?: String, bankAccountName?: String, transferContent?: String, reference?: String, confirmedAt?: Instant }`
- **OrderResponse**: `{ id: Long, publicCode: String, source: "ONLINE" | "POS", status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED", totalVnd: Long, customerName: String, customerPhone?: String, customerAddress?: String, note?: String, version: Long, createdAt: Instant, updatedAt: Instant, completedAt?: Instant, cancelledAt?: Instant, items: List<OrderItemResponse>, payment: PaymentResponse }`
- **PaymentInstructionsResponse**: `{ method: "CASH" | "QR_TRANSFER", status: "UNPAID" | "PAID", amountVnd: Long, bankCode?: String, bankAccount?: String, bankAccountName?: String, transferContent?: String, qrUrl?: String }`
- **OrderPageResponse**: `{ items: List<OrderResponse>, page: Int, size: Int, totalItems: Long, totalPages: Int }`
- **OrderEventResponse**: `{ id: Long, actorId: Long, eventType: "CREATED" | "STATUS_CHANGED" | "PAYMENT_CONFIRMED", fromStatus?: String, toStatus: String, orderVersion: Long, paymentReference?: String, note?: String, createdAt: Instant }`
- **CancelOrderRequest**: `{ version: Long, note?: String }`
- **AdminUpdateOrderStatusRequest**: `{ targetStatus: "CONFIRMED" | "COMPLETED" | "CANCELLED", version: Long, note?: String }`
- **AdminConfirmPaymentRequest**: `{ amountVnd: Long, reference?: String, version: Long, confirmationKey: String }`

## 2. Danh sách Endpoints Khách hàng (USER / ADMIN)

- `POST /orders`: Tạo đơn hàng trực tuyến.
  - Header: `Idempotency-Key` (UUID bắt buộc).
  - Validation:
    - 1..50 items, số lượng 1..99/món, tổng tiền <= 100.000.000 VND.
    - Món và danh mục phải đang `is_active = true`.
    - `expectedPriceVnd` phải khớp chính xác `price_vnd` trong DB; nếu sai lệch trả 409 `PRICE_CHANGED`.
    - Trùng `(creator_id, idempotency_key)`: nếu cùng request hash trả về đơn đã tạo (200/201), nếu khác hash trả về 409 `IDEMPOTENCY_CONFLICT`.
- `GET /orders/mine`: Lấy danh sách đơn hàng của tài khoản đang đăng nhập (phân trang: `page` default 0, `size` default 12, max 100).
- `GET /orders/{id}`: Xem chi tiết đơn hàng (chỉ người tạo đơn hoặc ADMIN được xem, người khác nhận 404).
- `PATCH /orders/{id}/cancel`: Người mua hủy đơn của mình (chỉ khi `status = PENDING` và `payment.status = UNPAID`). Nếu đơn đã PAID trả 409 `PAID_ORDER_CANNOT_BE_CANCELLED`. Cần truyền `version` để kiểm soát tranh chấp.
- `GET /orders/{id}/payment-instructions`: Lấy thông tin thanh toán và mã QR (VietQR URL).

## 3. Danh sách Endpoints Quản trị (ADMIN)

- `GET /admin/orders`: Lọc danh sách đơn (query params: `status`, `source`, `paymentStatus`, `q`, `page`, `size`).
- `GET /admin/orders/{id}`: Chi tiết đơn hàng cho admin (bao gồm danh sách `events` lịch sử thay đổi).
- `PATCH /admin/orders/{id}/status`: Đổi trạng thái đơn hàng.
  - Chuyển `PENDING` -> `CONFIRMED`.
  - Chuyển `CONFIRMED` -> `COMPLETED` (BẮT BUỘC payment phải là `PAID`).
  - Chuyển `PENDING` hoặc `CONFIRMED` -> `CANCELLED` (chỉ khi payment là `UNPAID`).
  - Kiểm tra `version` (optimistic lock); nếu stale trả 409 `STALE_ORDER_VERSION`.
- `POST /admin/orders/{id}/payment-confirmations`: Xác nhận đã thanh toán.
  - `amountVnd` phải khớp `order.totalVnd`.
  - Không cho xác nhận thanh toán đơn đã `CANCELLED`.
  - Idempotent theo `confirmationKey`: gọi lại cùng key trả về kết quả thành công mà không cộng tiền hay tạo payment mới.
  - Sau khi xác nhận: `payment.status = PAID`, ghi `order_events` với `event_type = PAYMENT_CONFIRMED`.
