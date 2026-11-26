# Khuyến mại và voucher

- `GET /api/v1/promotions` trả ưu đãi công khai cho phép tự nhận và còn lượt. `GET /api/v1/users/me/promotions` bổ sung ưu đãi công khai đã cấp cho khách hiện tại và lọc theo lượt còn lại của khách. Phản hồi không chứa mã voucher hoặc danh sách người nhận.
- `GET /api/v1/users/me/vouchers` trả voucher của tài khoản đăng nhập và lượt còn lại, tính cả đơn đang giữ lượt.
- `POST /api/v1/users/me/vouchers/{id}/claim` thêm voucher công khai còn hạn vào ví nếu quản trị viên bật quyền tự nhận. Nhận lại cùng mã không tạo thêm lượt.
- `POST /api/v1/users/me/vouchers/quote` nhận `voucherId` và `items` gồm `productId`, `quantity`, `expectedPriceVnd`. Phản hồi trả `subtotalVnd`, `discountVnd` và `totalVnd`. Báo giá không giữ lượt.
- `POST /api/v1/orders` nhận thêm `voucherId` và `expectedTotalVnd` khi áp dụng voucher. Backend kiểm tra lại giỏ, quyền nhận, thời hạn và giới hạn lượt trong giao dịch tạo đơn. Tổng phải trả tối thiểu 1 ₫. POS giữ luồng giá thông thường.
- `/api/v1/admin/vouchers` quản lý mã, cờ công khai và trạng thái. `POST /api/v1/admin/vouchers/{id}/grants` cấp cho `ALL`, `GROUP` hoặc `USER`. Hai kiểu sau cần `targetId`. Cấp lại không nhân đôi quyền nhận.
- `/api/v1/admin/voucher-groups` quản lý tên và danh sách ID khách. `/api/v1/admin/voucher-customers?q=...` tìm khách theo tên hoặc email. `GET /api/v1/admin/vouchers/{id}/stats` trả số người đã nhận và tối đa 100 đơn gần nhất có áp dụng.

Đơn online giữ lượt đến khi hủy hoặc hoàn tất. Đơn đã hủy trả lượt. Trạng thái đã dùng được xác định từ thanh toán hoặc hoàn thành. Đổi nhóm không thu hồi voucher đã cấp. Khi một voucher đã gắn với đơn, mã và điều kiện giảm được giữ để bảo toàn lịch sử. Quản trị viên vẫn có thể sửa nội dung hiển thị hoặc tắt voucher.
