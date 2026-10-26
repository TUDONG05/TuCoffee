# TuCoffee — Spring Boot và Angular

Ứng dụng TuCoffee được phát triển từng giai đoạn. **Đã triển khai bộ khung và giai đoạn 2: tài khoản, hồ sơ và phân quyền USER/ADMIN.**

Có đăng ký, đăng nhập, khôi phục phiên khi tải lại trang, đăng xuất, đổi mật khẩu; ADMIN tìm kiếm và khóa/mở tài khoản. Thực đơn, giỏ hàng và đơn hàng chưa triển khai. Tích điểm và khuyến mãi để sau.

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
backend/                     Spring Boot monolith, identity/security, MySQL/Flyway
frontend/                    Angular standalone, auth, hồ sơ và quản trị tài khoản
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

Khởi tạo hoặc bổ sung cấu hình còn thiếu; script giữ nguyên mật khẩu và khóa đã có:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/initialize-local-env.ps1
```

Script sinh mật khẩu MySQL ngẫu nhiên khi tạo `.env` mới và khóa JWT Base64 tối thiểu 32 byte. File `.env` được Git bỏ qua. `ExecutionPolicy Bypass` chỉ áp dụng tiến trình chạy script này.

Spring Boot đọc `.env` ở thư mục gốc khi chạy từ `backend/` hoặc từ thư mục gốc; cũng hỗ trợ biến môi trường được truyền trực tiếp. Đây là cấu hình import tường minh trong `application.yml`, không dựa vào Spring tự đọc `.env`.

| Biến | Ý nghĩa |
|---|---|
| MYSQL_HOST | Host DB nhìn từ ứng dụng, mặc định `127.0.0.1` |
| MYSQL_PORT | Cổng DB local, mặc định `3307` |
| MYSQL_DATABASE | Tên database, mặc định `tu_coffee` |
| MYSQL_USER / MYSQL_PASSWORD | Tài khoản ứng dụng MySQL; không dùng root |
| MYSQL_ROOT_PASSWORD | Chỉ dùng khởi tạo/quản trị container MySQL |
| SERVER_ADDRESS / SERVER_PORT | Địa chỉ và cổng API local |
| SPRING_PROFILES_ACTIVE | `local` tường minh cho HTTP local; không dùng profile này khi triển khai HTTPS |
| AUTH_JWT_SECRET | Khóa Base64 ngẫu nhiên, tối thiểu 32 byte sau giải mã; không commit |
| AUTH_ALLOWED_ORIGINS | Danh sách origin tin cậy, phân tách bằng dấu phẩy |

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

Flyway tự chạy V1 và V2 theo thứ tự, lưu lịch sử trong `flyway_schema_history`. V2 bổ sung tài khoản, phiên đăng nhập, lịch sử refresh và giới hạn login; không sửa baseline. Hibernate không tự tạo/xóa bảng. Identity dùng JDBC và transaction/khóa MySQL để kiểm soát rotation và thao tác quản trị đồng thời.

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
- Tài khoản: `/register`, `/login`, `/profile`; quản trị tài khoản: `/admin/users`.
- Angular gọi `/api/v1/health` qua dev proxy; URL backend không nằm trong component.
- Nếu đổi cổng backend, cập nhật target trong `frontend/src/proxy.conf.json` rồi khởi động lại dev server.

### 5. Dừng local

Nhấn `Ctrl+C` trong terminal backend và frontend. Để dừng MySQL mà giữ dữ liệu:

```powershell
docker compose --env-file .env -f infrastructure/compose.local.yml stop
```

Không dùng `down -v` cho volume cần giữ dữ liệu.

## Kiểm tra và build

Docker phải sẵn sàng khi chạy kiểm tra backend. Testcontainers tạo MySQL riêng, không dùng database phát triển. CI dùng database tạm cho E2E.

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

Kiểm tra đầy đủ qua trình duyệt với MySQL tạm, backend 8081, Angular 4201 và ADMIN ngẫu nhiên (build backend trước):

```powershell
npx playwright install chromium
# Quay lại thư mục gốc dự án:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-identity-e2e.ps1
```

Workflow `.github/workflows/ci.yml` chuẩn bị kiểm tra backend với MySQL, frontend và smoke test. Workflow chỉ thực sự chạy trên GitHub sau khi có repository/commit được đẩy lên; hiện chưa cấu hình remote hoặc push tự động.

## Tạo tài khoản quản trị

Không có ADMIN hoặc mật khẩu mặc định. Sau khi đóng gói backend, chạy từ thư mục gốc trong terminal tương tác và nhập mật khẩu kín khi được hỏi:

```powershell
java -jar backend/target/tu-coffee-api-0.0.1-SNAPSHOT.jar --spring.profiles.active=bootstrap --spring.main.web-application-type=none --bootstrap.admin.name="Quản trị viên" --bootstrap.admin.email="admin@example.com" --debug=false
```

Có thể truyền mật khẩu qua biến môi trường `BOOTSTRAP_ADMIN_PASSWORD` dùng một lần rồi xóa biến. Lệnh không mở web server, không nâng quyền tài khoản đã tồn tại. Mật khẩu tối thiểu 10 ký tự, tối đa 72 byte UTF-8.

## Quy tắc phiên đăng nhập

- Access JWT 15 phút chỉ giữ trong bộ nhớ trình duyệt; refresh cookie HttpOnly, SameSite=Strict, thời hạn tuyệt đối 7 ngày.
- Refresh được rotate; dùng lại token cũ thu hồi cả phiên. Nếu mất phản hồi refresh không rõ kết quả, ứng dụng yêu cầu đăng nhập lại.
- Logout thu hồi phiên hiện tại; đổi mật khẩu thu hồi mọi phiên cũ và cấp phiên mới cho trình duyệt hiện tại. Khóa tài khoản thu hồi toàn bộ phiên; mở khóa cần đăng nhập lại.
- Backend kiểm tra trạng thái tài khoản, quyền và phiên trong database; guard Angular chỉ hỗ trợ điều hướng.
- Mọi API ghi cần CSRF; mặc định cookie `Secure=true`, chỉ profile `local` dùng HTTP. Triển khai cần HTTPS, khóa riêng và allowlist origin phù hợp.
- Các thay đổi identity dùng một dòng khóa phối hợp trong MySQL, phù hợp quy mô hiện tại. Lịch dọn bản ghi phiên/rate limit hết hạn chưa tự động hóa.
