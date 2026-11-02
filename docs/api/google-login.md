# Đăng nhập Google

TuCoffee dùng Google Identity Services (ID token). Giữ nguyên đăng nhập email/mật khẩu và cơ chế JWT/refresh cookie hiện tại. Không cần Google Client Secret.

## Cấu hình

1. Trong Google Cloud Console / Google Auth Platform, cấu hình Branding, Audience và tạo OAuth Client kiểu **Web application**.
2. Thêm **Authorized JavaScript origins** đúng origin frontend: `http://localhost:4200` (thêm `http://127.0.0.1:4200` nếu dùng địa chỉ đó). Production dùng origin HTTPS thực tế. Nếu ứng dụng ở chế độ Testing, thêm tài khoản vào Test users khi Google yêu cầu.
3. Thêm `GOOGLE_CLIENT_ID=<client-id>.apps.googleusercontent.com` vào `.env` ở gốc và khởi động lại backend. Client ID là cấu hình công khai, có thể trả về frontend; không đưa Client Secret vào frontend hoặc chat. Flow popup ID token này không có redirect URI của backend.
4. Chạy backend để Flyway áp dụng V3; migration thêm `google_subject` duy nhất và cho phép `password_hash` null, giữ nguyên dữ liệu hiện có. Chạy frontend rồi mở `/login`.

Thiếu Client ID: ứng dụng vẫn khởi động, đăng nhập email/mật khẩu vẫn dùng được; nút Google bị vô hiệu hóa và báo chưa khả dụng. SDK Google chỉ tải khi cấu hình đã bật. Nếu trình chặn nội dung/mạng chặn SDK, có nút thử lại.

## Luồng

`GET /api/v1/auth/google/config` cấp nonce đã ký có hạn 5 phút, đồng thời đặt nonce trong cookie HttpOnly/SameSite=Strict. Google nhận nonce này và đưa vào ID token. Frontend gửi credential tới `POST /api/v1/auth/google` kèm CSRF hiện tại. Backend kiểm tra chữ ký RS256 qua JWKS cố định của Google, issuer, audience/azp, expiry, verified email và nonce cookie trước khi truy cập tài khoản.

Tra cứu bằng `sub`, không dùng email làm định danh Google. Người mới tạo USER, không có mật khẩu local. Tài khoản đã liên kết dùng cùng user và giữ nguyên quyền; tài khoản bị khóa bị từ chối. Google-only profile hướng dẫn quản lý bảo mật tại Google.

Nếu email đã tồn tại: trả 409/GOOGLE_LINK_REQUIRED và UI yêu cầu mật khẩu TuCoffee. Gửi lại cùng ID token + currentPassword trong thời hạn nonce; mật khẩu sai được đếm trong rate limit email/IP, không tạo phiên hoặc liên kết. Không ghi đè một Google subject khác đã liên kết. Thao tác tạo/liên kết dùng cùng khóa điều phối và transaction với identity hiện tại.

Thành công cấp phiên và refresh cookie như đăng nhập thường, rotate CSRF và xóa nonce cookie. Nonce JWT có purpose riêng, không dùng được làm access token. Nonce được ràng buộc bằng cookie và hết hạn; không có kho nonce dùng một lần phía server, vì vậy không tuyên bố chống replay nếu cả ID token và nonce cookie cùng bị lấy cắp. Token Google và mật khẩu chỉ ở bộ nhớ trong lúc đăng nhập, không lưu browser storage/database/log.

## Kiểm chứng

- Unit backend: chữ ký thật với khóa RSA kiểm thử, token giả/sai audience/issuer/expiry/email/nonce, nonce riêng, account mới, liên kết bằng mật khẩu, conflict/disabled account, cookie lifecycle.
- Unit frontend: dùng chung session lifecycle, failure không retry, cấu hình disabled, official button/nonce callback và retry lỗi cấu hình.
- HTTP offline qua MVC và security filter thật: POST thiếu CSRF trả 403; request hợp lệ cấp refresh/CSRF cookie và xóa nonce cookie. Google verifier và identity service được giả lập trong ca HTTP này.
- Kiểm thử với tài khoản Google thật cần Client ID và origin đã đăng ký; unit test không thay thế bước này.
- MySQL integration cần TEST_MYSQL_USER/TEST_MYSQL_PASSWORD riêng và schema tạm; không dùng database phát triển để kiểm thử ghi.

Nguồn: [Google server token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [Google JavaScript API](https://developers.google.com/identity/gsi/web/reference/js-reference), [Google setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).
