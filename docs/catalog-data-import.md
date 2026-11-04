# Nhập dữ liệu thực đơn tham khảo

Bộ dữ liệu gồm **18 sản phẩm / 5 danh mục**, lấy từ danh sách công khai của [website tham khảo](https://coffe-web-i8h3.vercel.app) ngày 02/11/2026. Snapshot gốc giữ tại `data/imports/coffe-web-20261102/products.json` và CSV. Không lấy tài khoản, đơn hàng hoặc đánh giá của website nguồn.

## Dữ liệu và ảnh đóng gói

`backend/src/main/resources/catalog/reference-products.json` là manifest dùng để nhập, gồm mã nguồn, tên, mô tả, giá, danh mục, slug, trạng thái, tên file ảnh, SHA-256, URL nguồn và kích thước ảnh.

`catalog/images/` chứa 18 ảnh tải nguyên bản từ Vercel Blob công khai, tổng **4.955.844 byte**. Tên file là UUID suy ra từ URL nguồn; đuôi file theo nội dung thực tế (JPEG/PNG/WebP). Ảnh được phân tích trước khi đóng gói; khi nhập, backend kiểm tra checksum, giải mã thực và giới hạn 5 MB / 20 megapixel. Runtime không cần kết nối website ảnh nguồn.

Danh mục: Cà Phê (`ca-phe`), Trà (`tra`), Đá Xay (`da-xay`), Đồ Ăn (`do-an`), Combo (`combo`). Bảng `products` sử dụng khóa chính local; `source_system=coffe-web-i8h3`, `source_id` là ID trong snapshot. Không gán ID cũ vào khóa chính và không nhập `avg_rating`/`review_count` thành đánh giá giả.

## Bật import local

Chỉ profile `local` cùng `catalog.seed.enabled=true` mới chạy importer. Mặc định flag là false nên startup không seed. Môi trường không có profile local sẽ không tạo bean importer, kể cả khi flag được bật. Migration không tự ghi dữ liệu mẫu.

```powershell
# Tại backend/, sau khi cấu hình MySQL local của bạn:
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.arguments=--spring.profiles.active=local --catalog.seed.enabled=true"
```

Có thể đặt `CATALOG_SEED_ENABLED=true` nếu `application.yml` ánh xạ biến này. Sau khi nhập, đặt lại false. `catalog.upload-dir` / `CATALOG_UPLOAD_DIR` chỉ thư mục lưu ảnh; thư mục cần lưu bền vững và được backup cùng DB. API trả `/api/v1/catalog/images/{filename}`, không dùng URL ngoài hoặc file public của frontend.

Importer chạy trong transaction riêng, được điều phối bằng `identity_lock`. Danh mục chưa có thì tạo theo slug. Sản phẩm có khóa nguồn đã tồn tại thì **bỏ qua toàn bộ**, không ghi đè tên, giá, trạng thái hoặc ảnh admin đã sửa. Chạy lại không nhân đôi dữ liệu. Trạng thái danh mục có sẵn cũng được giữ nguyên.

Ảnh mới được ghi vào file tạm và rename trên cùng filesystem. Nếu transaction thất bại, database rollback và chỉ ảnh mới của lần nhập đó được dọn. Nếu file cùng tên có nội dung khác manifest, import từ chối thay vì ghi đè. Tên file lấy từ manifest đóng gói, được kiểm tra UUID và giới hạn thư mục, không nhận path từ client.

## Kiểm chứng

`CatalogSeedTests` sử dụng MySQL riêng, schema ngẫu nhiên cho mỗi testcase và thư mục upload tạm. Các ca kiểm tra:

- Nhập đủ 18 món, 5 danh mục và 18 ảnh, không sinh review.
- Nhập lại không trùng và giữ nguyên chỉnh sửa admin.
- Database từ chối ghi: rollback cả dữ liệu và ảnh mới.
- File ảnh đã có nhưng khác nội dung: từ chối ghi đè.

Không chạy test trên database phát triển. Quyền phát hành công khai nội dung và hình ảnh cần phù hợp với quyền của chủ dữ liệu; manifest giữ URL nguồn để truy vết.
