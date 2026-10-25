# TuCoffee — Spring Boot và Angular

Ứng dụng TuCoffee đang được phát triển từng giai đoạn. **Hiện chỉ triển khai giai đoạn 1: bộ khung và kết nối Angular → Spring Boot → MySQL.**

Chưa có chức năng đăng nhập, thực đơn, giỏ hàng hoặc quản trị. Tích điểm và khuyến mãi thuộc giai đoạn sau.

## Công nghệ đã chọn

| Thành phần | Phiên bản |
|---|---|
| Java | 21 |
| Spring Boot | 4.1.2 |
| Maven Wrapper | 3.10.0 |
| MySQL | 8.4.13 qua Docker |
| Angular | 22.2.3; CLI/build 22.2.4 |
| Node.js | 24.18.0 trong môi trường kiểm tra/CI |

Dependency frontend được khóa trong `frontend/package-lock.json`; backend dùng dependency management của Spring Boot và Maven Wrapper. Không cần cài Angular CLI hoặc Maven toàn cục.

## Cấu trúc hiện tại

```text
backend/                     Spring Boot, cấu hình MySQL/Flyway, health check
frontend/                    Angular standalone, bộ khung và trang kết nối
infrastructure/compose.local.yml
docs/api/openapi.yaml         Hợp đồng API đã có
docs/design-guidelines.md     Quy ước giao diện
```

## Yêu cầu trước khi chạy

- JDK 21 và Node.js 24.18.0; npm đi kèm Node.
- Docker Desktop đang chạy Linux containers; lần đầu cần mạng tải image/dependency.
- Các cổng mặc định: frontend 4200, backend 8080, MySQL 3307 trên `127.0.0.1`.

## Chạy local trên Windows / PowerShell

Mở terminal tại thư mục gốc dự án.

### 1. Cấu hình môi trường

Nếu chưa có `.env`:

```powershell
Copy-Item .env.example .env
```

Đổi `MYSQL_PASSWORD` và `MYSQL_ROOT_PASSWORD` trước khi khởi tạo MySQL. Trong phiên triển khai, `.env` local đã được tạo với mật khẩu phát triển ngẫu nhiên; giữ nguyên nếu đã có. File này được Git bỏ qua.

Spring Boot đọc `.env` ở thư mục gốc khi chạy từ `backend/` hoặc từ thư mục gốc; cũng hỗ trợ biến môi trường được truyền trực tiếp. Đây là cấu hình import tường minh trong `application.yml`, không dựa vào Spring tự đọc `.env`.

| Biến | Ý nghĩa |
|---|---|
| MYSQL_HOST | Host DB nhìn từ ứng dụng, mặc định `127.0.0.1` |
| MYSQL_PORT | Cổng DB local, mặc định `3307` |
| MYSQL_DATABASE | Tên database, mặc định `tu_coffee` |
| MYSQL_USER / MYSQL_PASSWORD | Tài khoản ứng dụng MySQL; không dùng root |
| MYSQL_ROOT_PASSWORD | Chỉ dùng khởi tạo/quản trị container MySQL |
| SERVER_ADDRESS / SERVER_PORT | Địa chỉ và cổng API local |

### 2. Chạy MySQL

```powershell
docker compose --env-file .env -f infrastructure/compose.local.yml up -d --wait
docker compose --env-file .env -f infrastructure/compose.local.yml ps
```

DB dùng volume `mysql-data` của dự án Compose. Đổi mật khẩu trong `.env` sau khi volume đã được khởi tạo không tự đổi mật khẩu trong MySQL; cần đổi bằng SQL phù hợp rồi cập nhật cấu hình, không xóa volume để xử lý dữ liệu cần giữ.

### 3. Chạy backend — terminal thứ nhất

```powershell
Set-Location backend
.\mvnw.cmd spring-boot:run
```

Flyway tự chạy `V1__baseline.sql` lần đầu và lưu lịch sử trong `flyway_schema_history`. Baseline hiện chưa tạo bảng nghiệp vụ. Hibernate chỉ validate schema, không tự tạo/xóa bảng.

Kiểm tra từ terminal khác:

```powershell
curl.exe -i http://127.0.0.1:8080/api/v1/health
```

Kết quả bình thường: HTTP 200, `{"status":"UP"}`. Khi DB không còn truy cập được sau khi backend đã khởi động: HTTP 503, `{"status":"DOWN"}`. Nếu DB chưa sẵn sàng khi khởi động thì Flyway có thể làm app khởi động thất bại; chạy DB trước rồi khởi động lại backend.

### 4. Chạy frontend — terminal thứ hai

```powershell
Set-Location frontend
npm ci
npm start
```

- Trang khởi đầu: [http://localhost:4200](http://localhost:4200).
- Trang phát triển kiểm tra kết nối: [http://localhost:4200/dev/status](http://localhost:4200/dev/status).
- Angular gọi `/api/v1/health` qua dev proxy; URL backend không nằm trong component.
- Nếu đổi cổng backend, cập nhật target trong `frontend/src/proxy.conf.json` rồi khởi động lại dev server.

### 5. Dừng local

Nhấn `Ctrl+C` trong terminal backend và frontend. Để dừng MySQL mà giữ dữ liệu:

```powershell
docker compose --env-file .env -f infrastructure/compose.local.yml stop
```

Không dùng `down -v` cho volume cần giữ dữ liệu.

## Kiểm tra và build

MySQL phải sẵn sàng và cấu hình kết nối đúng trước khi chạy kiểm tra backend. Các kiểm tra giai đoạn 1 chỉ đọc kết nối/lịch sử Flyway, không xóa dữ liệu. CI dùng database tạm riêng.

Trên Windows, nếu đang chạy backend bằng `java -jar target/...jar`, dừng tiến trình đó trước khi chạy `verify` hoặc `package`: JVM đang giữ file sẽ khiến Maven không thể thay JAR lúc đóng gói. Sau khi build xong có thể khởi động lại. Nếu PowerShell chặn `npm.ps1`, dùng `npm.cmd` thay cho `npm` trong các lệnh bên dưới.

Tại `backend/`:

```powershell
.\mvnw.cmd verify
```

Tại `frontend/`:

```powershell
npm ci
npm test -- --watch=false
npm run build
```

Smoke test trên trình duyệt cần backend/MySQL đang chạy; Playwright tự chạy frontend nếu chưa có:

```powershell
npx playwright install chromium
npm run e2e
```

Workflow `.github/workflows/ci.yml` chuẩn bị kiểm tra backend với MySQL, frontend và smoke test. Workflow chỉ thực sự chạy trên GitHub sau khi có repository/commit được đẩy lên; hiện chưa cấu hình remote hoặc push tự động.

## Quy ước cho các giai đoạn tiếp theo

- API nghiệp vụ: `/api/v1`, DTO rõ ràng; lỗi theo RFC 9457. Health dùng định dạng trạng thái Actuator được ghi riêng trong OpenAPI.
- Danh sách phân trang: `{items,page,size,totalItems,totalPages}`; page bắt đầu 0, size mặc định 12 và tối đa 100.
- Tiền VND là số nguyên; backend tính giá/tổng tiền.
- Chỉ thêm module/migration khi bắt đầu chức năng tương ứng; không sửa migration đã chạy trên môi trường chia sẻ.
- Spring Security, tài khoản và quyền sẽ được triển khai ở giai đoạn 2; giai đoạn 1 chỉ dùng local.

## Thông tin cần chuẩn bị sau

- Trước giai đoạn 4: ngân hàng/tài khoản nhận tiền và thông tin cửa hàng qua cấu hình.
- Trước ngày 13: tài khoản SMTP và hộp thư thử để kiểm tra reset mật khẩu thật.
- Trước giai đoạn 6: host, domain và quyền triển khai nếu cần demo công khai.

Không gửi mật khẩu/token vào tài liệu hoặc chat; cấu hình bằng biến môi trường.

## Tiến độ

Ứng dụng phát triển theo 6 giai đoạn: nền tảng → tài khoản/phân quyền → thực đơn → đơn hàng/thanh toán → POS/hoàn thiện → kiểm thử/phát hành.

- [x] Giai đoạn 1 — bộ khung Angular → Spring Boot → MySQL (đã kiểm chứng)
- [ ] Giai đoạn 2 — tài khoản, JWT, phân quyền
- [ ] Giai đoạn 3 — thực đơn, quản lý sản phẩm
- [ ] Giai đoạn 4 — giỏ hàng, đơn hàng, thanh toán
- [ ] Giai đoạn 5 — POS, dashboard, đánh giá, khôi phục mật khẩu
- [ ] Giai đoạn 6 — kiểm thử, đóng gói, phát hành
