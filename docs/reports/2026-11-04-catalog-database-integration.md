# Kiểm chứng database và nhập sản phẩm — 04/11/2026

## Kiểm thử trên MySQL riêng

- Chạy `mvnw.cmd -o -B verify` từ `backend/` của nhánh `feat/catalog` với MySQL native riêng, tài khoản test riêng và schema ngẫu nhiên cho từng nhóm test.
- Kết quả: **BUILD SUCCESS; 56 test, 0 failure, 0 error, 0 skipped**, đóng gói JAR thành công.
- Bao gồm 4 test migration, 3 test nhập dữ liệu mẫu, 4 test tích hợp catalog và các test tài khoản/Google/Turnstile hiện có.
- Test importer xác nhận nhập 18 sản phẩm/5 danh mục/18 ảnh, nhập lại không trùng và giữ chỉnh sửa admin; rollback dữ liệu/ảnh mới khi database từ chối; không ghi đè file ảnh khác nội dung.

## Áp dụng local

- Sao lưu database local trước khi chạy; bản sao nằm tại `.tmp/database-backups/before-catalog-20261104-115355.sql` ở workspace gốc, ngoài Git.
- Database ứng dụng ban đầu ở V3. Khởi động backend catalog với profile `local` và bật seed trong môi trường của tiến trình, không sửa `.env` hay bật seed mặc định.
- Flyway áp dụng V4–V7; importer báo `18 created, 0 existing products preserved`.
- `GET /api/v1/health`: HTTP 200, `UP`.
- `GET /api/v1/products?size=100`: 18 sản phẩm; `GET /api/v1/categories`: 5 danh mục.
- Tải ảnh của đủ 18 sản phẩm qua endpoint catalog: 18/18 trả HTTP 200 và có nội dung; ảnh đầu tiên 84.170 byte.
- Ảnh local lưu tại `backend/uploads/catalog` của workspace gốc (đường dẫn tuyệt đối truyền qua môi trường tiến trình), ngoài Git. Cần dùng cùng thư mục khi chạy backend từ worktree khác.

## Phạm vi

Đây là bằng chứng cho backend/database/import của catalog. Không thay cho kiểm thử giao diện, E2E toàn bộ giai đoạn 3 hoặc CI từ xa. Các API/UI đơn hàng, thanh toán, khôi phục mật khẩu và RAG chưa được nghiệm thu qua báo cáo này.
