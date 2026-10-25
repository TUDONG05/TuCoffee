# Quy ước phát triển TuCoffee

## Hiện trạng

Giai đoạn 1 đã có Spring Boot, Angular, MySQL/Flyway, health và kiểm tra kết nối. Chưa có bảng hoặc API tài khoản, thực đơn, đơn hàng. Làm từng giai đoạn theo kế hoạch, nghiệm thu trước khi chuyển tiếp.

## Source và cấu hình

- Backend: Java 21, Spring Boot 4.1.2; package gốc `com.tuscoffee`; dùng Maven Wrapper 3.10.0 đã có trong source.
- Frontend: Angular 22 standalone, SCSS, TypeScript strict; giữ `package-lock.json`, cài bằng `npm ci`.
- API tương đối dưới `/api/v1`; local Angular proxy sang `127.0.0.1:8080`; không nhúng hostname backend vào component.
- Dùng `.env.example` làm mẫu; `.env` và mọi secret thật nằm ngoài Git. Không in cấu hình đã nội suy mật khẩu vào báo cáo.
- Mỗi nghiệp vụ thêm package, DTO, service, repository ở giai đoạn tương ứng; không tạo trước module rỗng.

## Database và HTTP

- MySQL 8.4 dùng app user riêng, không dùng root cho datasource. Cấu hình local và lệnh PowerShell ở README.
- Flyway quản lý schema; V1 là baseline tối thiểu. Không sửa migration đã chia sẻ; thêm migration mới. Hibernate `ddl-auto=validate`.
- Giữ volume khi restart; không dùng `down -v` với dữ liệu cần giữ.
- Health hiện tại: `GET /api/v1/health`, chỉ `{status}`; UP/200 hoặc DOWN/503. DB phải sẵn sàng trước startup ứng dụng.
- Lỗi API dùng `application/problem+json`, không lộ stack trace/config. Hợp đồng hiện có: [OpenAPI](./api/openapi.yaml).
- Quy ước cho nghiệp vụ sắp làm: tiền VND nguyên; phân trang `{items,page,size,totalItems,totalPages}`, `page` 0..1.000.000, `size` 1..100, mặc định 12. Các quy ước này chưa có endpoint nghiệp vụ để nghiệm thu.

## Kiểm tra và bàn giao

- Backend: từ `backend/`, chạy `./mvnw.cmd -B verify` với DB local sẵn sàng. Trên Windows cần dừng JVM đang dùng JAR trong `target` trước khi repackage.
- Frontend: từ `frontend/`, `npm run build`, `npm test -- --watch=false`; Playwright `npm run e2e` có ca cần backend/MySQL thật.
- Không tính kiểm tra giả lập lỗi dịch vụ là bằng chứng database thật; lưu nguồn bằng chứng trong báo cáo.
- Workflow GitHub mới được chuẩn bị, chưa có kết quả chạy từ xa. Build local không thay cho CI hoặc kiểm chứng trên máy độc lập.

## Tham chiếu

- [Kế hoạch tổng thể](../plans/261025-2103-tu-coffee-three-weeks/plan.md)
- [Kiểm chứng nền tảng](../plans/261025-2103-tu-coffee-three-weeks/reports/phase-01-verification.md)
- [Quy ước giao diện](./design-guidelines.md)
