# TuCoffee — Spring Boot và Angular

Đăng nhập Google đã có phần tích hợp; cần cấu hình `GOOGLE_CLIENT_ID` trong `.env` và origin trên Google Cloud để sử dụng. Xem [hướng dẫn Google](docs/api/google-login.md). Đăng nhập email/mật khẩu tiếp tục hoạt động khi chưa bật Google.

Ứng dụng TuCoffee được phát triển từng giai đoạn. **Đã triển khai bộ khung và giai đoạn 2: tài khoản, hồ sơ và phân quyền USER/ADMIN.**

Có đăng ký, đăng nhập, khôi phục phiên khi tải lại trang, đăng xuất, đổi mật khẩu; ADMIN tìm kiếm và khóa/mở tài khoản. Thực đơn, giỏ hàng và đơn hàng chưa triển khai. Tích điểm và khuyến mãi để sau.

## Công nghệ đã chọn

| Thành phần | Phiên bản |
|---|---|
| Java | 21 |
| Spring Boot | 4.1.2 |
| Maven Wrapper | 3.10.0 |
| MySQL | 8.0.46 cài trực tiếp trên máy, cổng 3306 |
| Angular | 22.2.3; CLI/build 22.2.4 |
| Giao diện Angular | NG-ZORRO 22.1.2 (Ant Design), locale tiếng Việt `vi_VN` |
| Luồng dữ liệu frontend | RxJS 7.8 |
| Node.js | 24.18.0 trong môi trường kiểm tra/CI |

Dependency frontend được khóa trong `frontend/package-lock.json`; backend dùng dependency management của Spring Boot và Maven Wrapper. Không cần cài Angular CLI hoặc Maven toàn cục.

Frontend dùng NG-ZORRO trong các component standalone cho form, input, nút, thông báo, checkbox và bộ lọc tài khoản. Chỉ nạp stylesheet của các thành phần đang dùng, dùng tông nâu espresso, caramel và kem theo ảnh tham chiếu. Trang quản trị dùng RxJS debounce 300ms cho bộ lọc, `switchMap` để hủy truy vấn danh sách cũ, `exhaustMap` để chặn thao tác khóa/mở trùng và `takeUntilDestroyed` để dọn subscription khi rời trang.

## Cấu trúc hiện tại

```text
backend/                     Spring Boot monolith, Spring Data JPA, MySQL/Flyway
frontend/                    Angular standalone, auth, hồ sơ và quản trị tài khoản
scripts/                     Chuẩn bị môi trường và chạy E2E với MySQL native
docs/api/openapi.yaml         Hợp đồng API đã có
docs/design-guidelines.md     Quy ước giao diện
```

Backend chia theo lớp trực tiếp dưới `com.tuscoffee`:

```text
config/             Cấu hình Spring và bảo mật
controller/         HTTP endpoints
dto/                Request/response và kết quả trao đổi giữa các lớp
entity/             JPA entity ánh xạ các bảng MySQL
repository/         Interface kế thừa JpaRepository
service/            Nghiệp vụ và transaction
security/           JWT, filter và principal
validation/         Kiểm tra dữ liệu
bootstrap/          Lệnh tạo ADMIN
exception/   Xử lý lỗi chung
```

Backend dùng Spring Data JPA. `entity` gồm `User`, `AuthSession`, `AuthTokenHistory`, `AuthRateLimit`, `IdentityLock`. Service gọi repository; controller trả DTO như `UserResponse`, không trả entity hoặc password hash trực tiếp.

## Yêu cầu trước khi chạy

- JDK 21 và Node.js 24.18.0; npm đi kèm Node.
- MySQL Server cài trực tiếp và đang chạy; `mysql` CLI có trong PATH.
- Các cổng mặc định: frontend 4200, backend 8080, MySQL 3306 trên `127.0.0.1`.

## Chạy local trên Windows / PowerShell

Mở terminal tại thư mục gốc dự án.

### 1. Cấu hình môi trường

Khởi tạo hoặc bổ sung cấu hình còn thiếu; script giữ nguyên mật khẩu và khóa đã có:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/initialize-local-env.ps1
```

Script tạo `.env` từ mẫu nếu chưa có và sinh khóa JWT Base64 tối thiểu 32 byte. Điền `MYSQL_USER` và `MYSQL_PASSWORD` đúng với tài khoản MySQL đã có; script không thay đổi mật khẩu database. File `.env` được Git bỏ qua. `ExecutionPolicy Bypass` chỉ áp dụng tiến trình chạy script này.

Spring Boot đọc `.env` ở thư mục gốc khi chạy từ `backend/` hoặc từ thư mục gốc; cũng hỗ trợ biến môi trường được truyền trực tiếp. Đây là cấu hình import tường minh trong `application.yml`, không dựa vào Spring tự đọc `.env`.

| Biến | Ý nghĩa |
|---|---|
| MYSQL_HOST | Host DB nhìn từ ứng dụng, mặc định `127.0.0.1` |
| MYSQL_PORT | Cổng DB local, mặc định `3306` |
| MYSQL_DATABASE | Tên database, mặc định `tu_coffee` |
| MYSQL_USER / MYSQL_PASSWORD | Tài khoản ứng dụng MySQL; không dùng root |
| SERVER_ADDRESS / SERVER_PORT | Địa chỉ và cổng API local |
| SPRING_PROFILES_ACTIVE | `local` tường minh cho HTTP local; không dùng profile này khi triển khai HTTPS |
| AUTH_JWT_SECRET | Khóa Base64 ngẫu nhiên, tối thiểu 32 byte sau giải mã; không commit |
| AUTH_ALLOWED_ORIGINS | Danh sách origin tin cậy, phân tách bằng dấu phẩy |

### 2. Chuẩn bị MySQL cài trên máy

```powershell
Get-Service MySQL80
mysql --host=127.0.0.1 --port=3306 --user=coffee --password
```

Tên service có thể khác tùy bản cài đặt. Nếu chưa có database, tạo bằng tài khoản có quyền quản trị:

```sql
CREATE DATABASE IF NOT EXISTS tu_coffee
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
```

Tài khoản ứng dụng cần quyền tạo/cập nhật bảng và đọc/ghi trong `tu_coffee` để Flyway chạy migration. Backend kết nối `jdbc:mysql://127.0.0.1:3306/tu_coffee`. Không cần Docker.

### 3. Chạy backend — terminal thứ nhất

```powershell
Set-Location backend
.\mvnw.cmd spring-boot:run
```

Flyway tự chạy V1 và V2 theo thứ tự, lưu lịch sử trong `flyway_schema_history`. V2 bổ sung tài khoản, phiên đăng nhập, lịch sử refresh và giới hạn login; không sửa baseline. Hibernate chỉ validate entity với schema, không tự tạo/xóa bảng. Các repository dùng JPA; khóa `PESSIMISTIC_WRITE` trên hàng điều phối và transaction kiểm soát rotation, thu hồi phiên và thao tác quản trị đồng thời.

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

Nhấn `Ctrl+C` trong terminal backend và frontend. MySQL chạy dưới dạng Windows service, có thể tiếp tục dùng cho các ứng dụng khác.

## Kiểm tra và build

Kiểm tra backend và E2E dùng MySQL native. Mỗi lần chạy tạo một schema tên `tu_coffee_test_<mã ngẫu nhiên>`, rồi chỉ dọn schema do lần chạy đó tạo. Không dùng database phát triển. Cần tài khoản kiểm thử riêng qua `TEST_MYSQL_USER`, `TEST_MYSQL_PASSWORD`; host/port tùy chọn qua `TEST_MYSQL_HOST`, `TEST_MYSQL_PORT` (mặc định `127.0.0.1:3306`).

Tạo tài khoản kiểm thử bằng công cụ quản trị MySQL và cấp quyền trong phạm vi schema test. Với cấu hình `partial_revokes=OFF`, mẫu quyền theo [tài liệu MySQL](https://dev.mysql.com/doc/refman/8.0/en/grant.html):

```sql
GRANT ALL PRIVILEGES ON `tu\_coffee\_test\_%`.* TO 'coffee_test'@'localhost';
```

Nếu server bật `partial_revokes`, cần cấu hình quyền/schema kiểm thử phù hợp trước khi chạy; không dùng tài khoản ứng dụng làm tài khoản kiểm thử.

Đặt thông tin tài khoản kiểm thử trong terminal (mật khẩu nhập kín):

```powershell
$env:TEST_MYSQL_USER = 'coffee_test'
$taskTestCredential = Get-Credential -UserName $env:TEST_MYSQL_USER -Message 'Tài khoản MySQL kiểm thử'
$env:TEST_MYSQL_PASSWORD = $taskTestCredential.GetNetworkCredential().Password
```

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

Kiểm tra qua trình duyệt với schema tạm trên MySQL native cổng 3306, backend 8081, Angular 4201 và ADMIN ngẫu nhiên (build backend trước, giữ các biến `TEST_MYSQL_*` trong terminal):

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

## Cloudflare Turnstile

Đã tích hợp xác minh chống bot cho email login/register; mặc định tắt khi chưa cấu hình. Xem [hướng dẫn cấu hình và kiểm chứng](docs/api/turnstile.md). Bật TURNSTILE_ENABLED, điền Site Key/Secret Key và hostnames trong `.env`, rồi restart backend.

## Thiết kế database toàn dự án

Xem [ERD, từ điển dữ liệu và quy tắc migration](docs/database-design.md). V4–V7 tạo schema catalog, orders/payments/POS, reviews/reset và knowledge RAG. Có schema chưa đồng nghĩa chức năng API/UI đã triển khai; dữ liệu 18 sản phẩm tham khảo chưa được nhập tự động.
