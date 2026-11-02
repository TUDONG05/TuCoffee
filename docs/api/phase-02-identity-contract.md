# Hợp đồng tài khoản — giai đoạn 2

Hợp đồng triển khai theo kế hoạch đã duyệt. API dưới `/api/v1`; health giai đoạn 1 giữ nguyên. Không triển khai quên mật khẩu, Google OAuth hoặc OTP đăng ký trong giai đoạn này.

## Kiểu dữ liệu

- `User`: `{id:number,name:string,email:string,phone:string|null,address:string|null,role:'USER'|'ADMIN',active:boolean}`. Không trả password hash hoặc session hash.
- `AuthResponse`: `{accessToken:string,expiresIn:number,user:User}`, `expiresIn` tính bằng giây, mặc định 900.
- `Page<User>`: `{items:User[],page:number,size:number,totalItems:number,totalPages:number}`.
- Lỗi: RFC 9457 `application/problem+json`, các trường `type,title,status,detail,instance`, thêm `code` và `fieldErrors` khi cần. Không trả stack trace hoặc token.

## API

| Method + đường dẫn | Input | Kết quả |
|---|---|---|
| GET `/auth/csrf` | Không | 200 `{headerName:'X-XSRF-TOKEN',token:string}`, ghi cookie CSRF |
| POST `/auth/register` | `{name,email,password}` | 201 `User` luôn role USER; chưa tự đăng nhập |
| POST `/auth/login` | `{email,password}` | 200 `AuthResponse`, ghi refresh cookie |
| POST `/auth/refresh` | Refresh cookie, body rỗng | 200 `AuthResponse`, xoay refresh cookie |
| POST `/auth/logout` | Refresh cookie và/hoặc access token | 204, thu hồi phiên hiện tại, xóa cookie; gọi lại an toàn |
| GET `/users/me` | Bearer | 200 `User` hiện tại |
| PATCH `/users/me` | Bearer, `{name,phone,address}` | 200 `User`; đây là cập nhật đủ ba trường, không sửa email/role/active |
| PUT `/users/me/password` | Bearer, `{currentPassword,newPassword}` | 200 `AuthResponse`, xoay phiên hiện tại, thu hồi các phiên khác |
| GET `/admin/users` | Bearer ADMIN, `q?`, `active?`, `page=0`, `size=12` | 200 `Page<User>`, theo id tăng; q tối đa 100, page 0..1000000, size 1..100 |
| PATCH `/admin/users/{id}/active` | Bearer ADMIN, `{active:boolean}` bắt buộc | 200 `User`; cấm tự khóa hoặc khóa ADMIN hoạt động cuối cùng; khóa user thu hồi mọi phiên |

Các API ghi bắt buộc `X-XSRF-TOKEN` đúng với cookie CSRF. Angular lấy CSRF trước lần ghi đầu, lấy lại sau login/logout/đổi mật khẩu khi token bị luân chuyển. Cookies cùng origin; không dùng token trong localStorage/sessionStorage/URL. Nhận lại 401 từ login/refresh không được tạo vòng lặp refresh.

## Validation và mã lỗi

- Tên trim, 2..100 ký tự; email trim/lowercase, hợp lệ, tối đa 150 ký tự. Email unique ở MySQL.
- Password/newPassword tối thiểu 10 ký tự, tối đa 72 byte UTF-8. Không trim mật khẩu. Mật khẩu hiện tại chỉ cần bắt buộc có giá trị, không áp chính sách mới cho dữ liệu cũ.
- Phone có thể null/rỗng; khi có phải là số điện thoại Việt Nam `^0[35789]\d{8}$`. Address có thể null, tối đa 300 ký tự.
- Chỉ nhận các trường trong hợp đồng; không cho mass assignment role/active/email.
- 400 dữ liệu sai; 401 sai thông tin đăng nhập, token hết hạn/đã thu hồi; 403 thiếu quyền/CSRF/origin; 404 user admin không tồn tại; 409 email trùng hoặc thao tác khóa bị cấm; 429 vượt giới hạn.
- Sai đăng nhập trả thông báo chung cho email không tồn tại, password sai hoặc tài khoản không hoạt động.
- 5 lần đăng nhập thất bại/15 phút theo email và IP (MySQL); cả limiter counter và thu hồi token reuse phải được commit dù trả 401.

## Phiên và bảo mật

- Access JWT HS256: secret ít nhất 32 byte lấy từ `AUTH_JWT_SECRET` dạng Base64, issuer `tu-coffee`, có subject user id, `sid`, `iat`, `exp`; TTL 15 phút.
- Refresh opaque token ngẫu nhiên ít nhất 32 byte, chỉ hash lưu ở DB; TTL tuyệt đối 7 ngày cho một family. Xoay không gia hạn family vượt mốc tuyệt đối này.
- Cookie refresh tên `tucoffee_refresh`, HttpOnly, SameSite Strict, path `/api/v1/auth`; Secure mặc định true, profile local cho false. CSRF cookie `XSRF-TOKEN` path `/`, đọc được bằng JS theo cơ chế Angular.
- Mỗi request được bảo vệ xác minh chữ ký JWT rồi kiểm tra session còn hiệu lực, user active và role hiện tại trong DB. Không tin role trong token để quyết định quyền.
- Refresh cũ dùng lại thu hồi family của phiên đó, không có thời gian ân hạn; lưu hash token đã dùng đến hết hạn family. Transaction phải giữ hiệu lực thu hồi khi API trả lỗi.
- Angular dùng một yêu cầu refresh chung trong tab và Web Locks cùng origin giữa các tab. Sau khi giành khóa gửi cookie mới nhất. Không tự retry refresh khi lỗi mạng khiến kết quả không xác định; yêu cầu đăng nhập lại.
- Logout xóa cookie và thu hồi phiên hiện tại kể cả khi access đã hết hạn. Logout idempotent vẫn cần CSRF. Đổi mật khẩu thu hồi mọi SID cũ, cấp SID/access/refresh mới cho client hiện tại để giữ trạng thái đăng nhập; token cũ của chính client cũng mất hiệu lực ngay. Reset mật khẩu thuộc giai đoạn 5.
- CSRF áp dụng cả đăng ký/login. Origin khi được gửi phải thuộc allowlist cấu hình; không tin X-Forwarded-For từ client khi chưa cấu hình trusted proxy.
- Khóa tài khoản kiểm tra trong transaction, tránh thao tác đồng thời làm mất ADMIN hoạt động cuối cùng.
- CLI khởi tạo ADMIN: chế độ không chạy web; nhận name/email qua tham số, password từ nhập kín hoặc biến môi trường dùng một lần; từ chối email đã tồn tại, không nâng role tài khoản có sẵn.

## Cấu hình cần bổ sung

- `AUTH_JWT_SECRET`: Base64 của ít nhất 32 byte ngẫu nhiên; không có secret production mặc định trong Git.
- `AUTH_ALLOWED_ORIGINS`: danh sách origin được phép; local mặc định localhost/127.0.0.1 cổng 4200 và 8080.
- `AUTH_COOKIE_SECURE`: production true; local false qua profile local tường minh.
- Profile bootstrap và tên biến password sẽ được ghi chính xác trong README khi CLI hoàn thành.

Kiểm chứng dùng schema test riêng trên MySQL native cổng 3306, không xóa dữ liệu tài khoản local của người dùng. API OpenAPI được cập nhật cùng source; tài liệu này chốt các quyết định chung cho backend/frontend.

## Cách truy cập dữ liệu

Backend dùng entity JPA và `JpaRepository`, service giữ transaction và khóa hàng điều phối. `UserResponse` DTO có cùng JSON với schema `User` trong hợp đồng này; không trả entity/password hash. Việc chuyển JDBC sang JPA không đổi endpoint, cookie hoặc payload HTTP, không sửa migration V1/V2.
