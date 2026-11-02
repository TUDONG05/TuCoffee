---
title: "Giai đoạn 2 — tài khoản, phiên đăng nhập và phân quyền"
date: "2026-10-26"
status: completed
scope: phase-02
---

# Giai đoạn 2 — tài khoản, phiên đăng nhập và phân quyền

## Đính chính cấu hình theo yêu cầu người dùng

Ngày 26/10/2026, người dùng xác nhận dùng **MySQL cài trực tiếp, cổng 3306; không dùng Docker**. Phần ghi chép bên dưới phản ánh lần triển khai trước khi sửa yêu cầu này.

Đã sửa `.env`, cấu hình mặc định, hướng dẫn chạy và kế hoạch; bỏ Compose/Testcontainers, chuyển fixture và E2E sang schema test sinh riêng trên MySQL native. CI cũng dùng MySQL cài trực tiếp trên runner. Không tự sinh/đổi mật khẩu tài khoản MySQL khi khởi tạo môi trường.

MySQL80 phiên bản 8.0.46 đang chạy trên máy; backend đã kết nối `127.0.0.1:3306/tu_coffee`, Flyway nâng V1 lên V2 và health trả UP. Container cũ đã dừng, volume giữ nguyên. Chưa chạy lại bộ unit/integration/E2E sau chuyển đổi; kết quả 23/25/7 bên dưới là bằng chứng lịch sử của cấu hình trước.

## Bối cảnh

Cập nhật tiếp theo theo yêu cầu dùng JPA: tạo năm entity User/AuthSession/AuthTokenHistory/AuthRateLimit/IdentityLock và năm JpaRepository tương ứng; bỏ IdentityStore và các record model JDBC. Service dùng JPA/transaction, filter đọc principal qua service; UserResponse giữ nguyên JSON HTTP và không lộ entity/hash. Giữ FlywayV1/V2 và MySQL native3306. Đã clean package skipTests và khởi động Hibernate/schema validation thành công, health UP; rà soát độc lập không phát hiện lỗi Critical/High, chưa chạy hồi quy. POM hiện chọn Java25 do chỉnh sửa trong phiên; máy chỉ có JDK21 nên lần build này override -Djava.version=21, chưa đổi lại POM, đang chờ lựa chọn phiên bản Java.

Cập nhật cấu trúc theo yêu cầu ngày 26/10: chuyển controller/service/repository/dto/model/security/validation/bootstrap trực tiếp dưới `com.tuscoffee`; chuyển xử lý lỗi sang `shared.exception`, bỏ package `identity`. Tách record request/response và Account/AuthSession thành file riêng, giữ nguyên HTTP contract. Các model vẫn dùng JDBC, chưa phải entity JPA. Đã clean build với `-DskipTests`, biên dịch cả source test và khởi động lại backend; health UP trên MySQL native 3306. Chưa chạy lại bộ test sau refactor.

Người dùng yêu cầu triển khai giai đoạn 2 của kế hoạch ba tuần, tiếp nối nền tảng đã nghiệm thu. Phạm vi: đăng ký/login, USER/ADMIN, hồ sơ/đổi mật khẩu, refresh/logout và quản lý khóa tài khoản. Rewards/khuyến mãi để sau; không bắt đầu catalog hay reset mật khẩu.

## Diễn biến

- Bổ sung Flyway V2 cho users, session, lịch sử hash refresh, bộ đếm login và hàng khóa điều phối. Baseline V1 được giữ nguyên.
- Backend cấp JWT 900 giây và refresh opaque có hạn tuyệt đối 7 ngày; DB lưu hash refresh. Rotation/reuse/logout/khóa tài khoản thu hồi phiên thật; mỗi request bảo vệ đọc lại session, role và active từ DB.
- Angular giữ access trong bộ nhớ, gửi CSRF cho request ghi, khôi phục phiên khi reload, điều phối refresh chung trong tab và Web Locks giữa tab. Có giao diện đăng ký/login, hồ sơ/password và danh sách/khóa user cho ADMIN.
- Rà soát tìm thấy cấu hình Secure mặc định chưa chặt, JSON numeric bị chuyển thành chuỗi, phản hồi 401 cũ có thể xóa phiên mới và BCrypt đăng ký chiếm thời gian giữ khóa. Các điểm này đã được sửa; bổ sung regression tương ứng.
- Backend verify cuối 23/23 test đạt, JAR đóng gói thành công; JaCoCo dòng 90,58%, nhánh 67,24%. Angular 25/25 unit test đạt; production build 278,55 kB. Chromium E2E 7/7 đạt trong 11,8 giây, không bỏ qua; ADMIN tạo qua CLI không web và sử dụng UI tìm/khóa/mở thật. Reload hai tab, storage rỗng và đồng bộ logout đều đạt.
- Bộ E2E dùng MySQL/API/Angular riêng, lần lượt cổng 3308/8081/4201; script dọn đúng container/volume/process/envfile do nó tạo. Không dùng fixture để xóa DB phát triển.
- Đã nghiệm thu 9/9 tiêu chí phase 2, đối chiếu toàn bộ 6 phase: 15/51 tiêu chí, 2/6 giai đoạn. Plan tổng vẫn `in-progress`; phase 3–6 `pending`.
- Khôi phục MySQL local bằng sửa cổng `.env` về 3307 và đồng bộ credential app bị lệch với volume hiện có, giữ dữ liệu. Khoảng 07:39 xác nhận MySQL healthy, backend cổng 8080 trả health HTTP 200/UP và frontend cổng 4200 trả `/register` HTTP 200; giữ tiến trình frontend đã chạy.

## Nhìn lại

Phần khó nằm ở vòng đời phiên: lỗi HTTP không được rollback mất revocation/counter, token cũ phải bị từ chối ngay, phản hồi trễ không được ghi đè phiên mới. Test HTTP với MySQL thật và rà soát frontend đã phát hiện lỗi không thấy qua màn hình đăng nhập thành công đơn lẻ. Cần giữ bằng chứng theo từng lớp thay vì suy ra cả chức năng đạt từ build xanh.

## Quyết định

1. Module identity dùng JDBC/transaction tường minh với hàng khóa MySQL; JPA giữ trong nền tảng. Chấp nhận tuần tự hóa thao tác identity ở phạm vi một cửa hàng; cần đo tải trước mở rộng.
2. Đổi mật khẩu thu hồi mọi SID cũ và cấp SID mới cho trình duyệt hiện tại, giữ hạn tuyệt đối cũ. Không để access cũ tiếp tục sống đến hết 15 phút.
3. Refresh reuse thu hồi family và commit dù trả lỗi; không có grace period. Lỗi mạng refresh không xác định yêu cầu login lại, không tự retry token cũ.
4. Cookie Secure mặc định bật; HTTP chỉ dùng profile local tường minh. Kiểm tra HTTPS production thuộc giai đoạn 6.
5. API deny by default; URL chưa cấp quyền trả 401 kể cả gửi bearer (filter chỉ xác thực nhóm users/admin); USER vào API ADMIN đã khai báo vẫn trả 403. ADMIN chỉ tạo qua CLI không web, từ chối email đã tồn tại, không tài khoản mặc định.

## Tiếp theo

Agent điều phối chuẩn bị checkpoint cục bộ; chưa ghi commit phase 2 khi chưa có hash. Bổ sung nhánh test còn thiếu trước phát hành; theo dõi housekeeping dữ liệu hết hạn và năng lực hàng khóa. Nhánh CLI email tồn tại mới được review, chưa chạy riêng trong bằng chứng hiện có. Chưa có CI GitHub, TLS production hoặc triển khai công khai; giai đoạn 3 chỉ bắt đầu khi người dùng yêu cầu.

Tham chiếu: [giai đoạn 2](../../plans/261025-2103-tu-coffee-three-weeks/phase-02-identity.md), [báo cáo tiến độ](../../plans/261025-2103-tu-coffee-three-weeks/reports/pm-261026-0731-identity-progress.md), [kiểm chứng backend](../../plans/261025-2103-tu-coffee-three-weeks/reports/phase-02-verification.md).
