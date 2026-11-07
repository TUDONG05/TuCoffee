---
phase: 3
status: passed
verified: 2026-11-04
branch: develop
---

# Kiểm chứng giai đoạn 3 — Thực đơn và quản lý sản phẩm

## Kết luận

Giai đoạn 3 đạt nghiệm thu local ngày 04/11/2026. Mã nền là `eef7f30`, kèm các thay đổi test/harness trong workspace. Không thay đổi mã nghiệp vụ backend/frontend hoặc cấu hình `.env` trong lượt kiểm chứng này.

## Kết quả chạy thực tế

| Kiểm tra | Kết quả | Bằng chứng local ngoài Git |
|---|---|---|
| Toàn bộ Playwright, Chromium, 2 workers | 15 passed, 0 failed, 0 skipped; 46,9 giây | `.tmp/phase03-e2e-final-pass.log` |
| Angular/Vitest | 62 passed, 13 test files; exit 0 | `.tmp/phase03-unit-pass.log` |
| Frontend production build | Exit 0 | `.tmp/phase03-build-pass.log` |
| Restart JVM và seed lần hai trên cùng DB/thư mục ảnh | 21 sản phẩm công khai giữ nguyên; 19 URL ảnh HTTP 200, có nội dung; seed tạo 0, giữ 18 sản phẩm nguồn | Log E2E và `.tmp/catalog-e2e-restart.log` |
| Kiểm tra định dạng thay đổi | `git diff --check` đạt | Git workspace |

Database kiểm thử là schema ngẫu nhiên `tu_coffee_test_e2e_<id>` trên MySQL native riêng, dùng tài khoản test; backend 8081, Angular 4201. Script dừng các tiến trình do nó tạo và xóa đúng schema của lần chạy. Dữ liệu ứng dụng local không bị sửa. Ảnh test và log được giữ ngoài Git trong `.tmp/` để đối chiếu.

## Đối chiếu nghiệm thu

| Tiêu chí | Bằng chứng |
|---|---|
| Admin thêm/sửa danh mục và sản phẩm, khách thấy sau refetch | Browser thật: tạo danh mục, sửa slug, tạo món, sửa giá 42.000 → 45.000, upload PNG, mở menu/detail và reload ảnh |
| Quyền ghi/upload | HTTP thật với CSRF hợp lệ: anonymous nhận 401, USER nhận 403 khi tạo/sửa/bật tắt/upload; không dùng quyền giả lập cho các ca này |
| Món/category inactive không công khai | Browser ngừng bán món → menu rỗng theo từ khóa, detail API 404; HTTP tắt danh mục → list rỗng/detail 404, bật lại → detail 200 |
| Tìm/lọc/phân trang và dữ liệu sai | Bộ 3 món riêng; keyword chứa `%_!`, lọc danh mục, sort giá giảm, size 2 với 2 trang; size 101 trả 400; tên rỗng/giá âm/giá lẻ trả 400, category không tồn tại trả 404, định dạng lỗi chuẩn |
| Ảnh và đường dẫn | SVG đội MIME PNG trả 415; file >5 MB trả 413; PNG thật có tên `../../safe.png` được lưu bằng UUID server, không dùng path/MIME client; ảnh tải được sau reload và restart |
| Seed và mobile | Startup đầu nhập 18 món; startup hai tạo 0, giữ 18; so sánh toàn bộ DTO catalog trước/sau restart; menu/detail không tràn ngang ở 360px |

Seeder chỉ tồn tại ở profile `local` và cần `catalog.seed.enabled=true`; mặc định tắt. Điều kiện này được đối chiếu trong `CatalogSeed.java`. Kiểm thử rollback/import/ảnh và migration backend có bằng chứng riêng: [56 test backend và nhập database](./2026-11-04-catalog-database-integration.md); không chạy lại Maven trong lượt E2E này.

## Các lỗi đã xử lý

- Backend E2E trước đó bật Turnstile từ cấu hình local, khiến nút login/register chờ CAPTCHA thật. Script nay truyền `--turnstile.enabled=false` và kiểm tra config thực tế trước khi chạy. Ca UI Turnstile dùng phản hồi giả lập riêng vẫn chạy, không được tính là xác minh Cloudflare live.
- Windows từng treo ở teardown cây npm/cmd của dev server. Script sở hữu trực tiếp tiến trình Angular, Playwright dùng lại server do script quản lý; cleanup có PID riêng.
- Test HTTP mới từng tái sử dụng CSRF token cũ sau server đổi cookie. Test nay đọc token hiện hành trước mỗi yêu cầu ghi. Ca browser chờ URL detail trước khi lưu URL kiểm tra 404.
- Unit test guard bị kẹt tại lazy load profile trong lần điều hướng bị hủy. Unit test dùng cùng component profile thật được nạp sẵn; giữ nguyên guard và cấu hình route sản phẩm. E2E vẫn chạy các route lazy của ứng dụng thật.

## Chạy lại

Build JAR hiện hành trước, chuẩn bị `TEST_MYSQL_HOST`, `TEST_MYSQL_PORT`, `TEST_MYSQL_USER`, `TEST_MYSQL_PASSWORD` cho MySQL kiểm thử riêng, rồi từ thư mục gốc:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-identity-e2e.ps1 -PlaywrightArgs '--workers=2'
```

Tại `frontend/`: `npm.cmd test -- --watch=false` và `npm.cmd run build`.

## Giới hạn và bước tiếp theo

- Đây là nghiệm thu local Chromium; chưa kiểm chứng CI từ xa hoặc deployment.
- Build còn cảnh báo bundle ban đầu 966,85 kB so với ngưỡng cảnh báo 500 kB, và `app.scss` 5,25 kB so với 4 kB; không vượt ngưỡng lỗi.
- Typecheck Angular app đã đạt. Thử typecheck E2E riêng bằng `tsc` không có cấu hình Node typings (`@types/node` chưa cài); các file E2E được Playwright biên dịch và thực thi thực tế.
- Giai đoạn 4 vẫn pending; giỏ hàng/đơn/thanh toán không thuộc nghiệm thu này.
