# Kiểm chứng database toàn dự án — 03/11/2026

- Nhánh: feat/database-schema, tạo từ origin/develop dc18383, checkout riêng trong .tmp/database-schema.
- Môi trường: Java21, MySQL8.0 native instance riêng trên127.0.0.1 với cổng ngẫu nhiên, datadir mới và tài khoản test riêng; không Docker, không H2, không dùng credential/schema ứng dụng. Key tạm không nằm trong source.
- Migration V1–V3 giữ nguyên Git blob; không chỉnh sửa baseline/identity/Google.
- Thêm V4 catalog, V5 orders/payments/POS, V6 reviews/moderation/reset, V7 knowledgeRAG: tổng21bảng nghiệp vụ và Flywayhistory.

## Kết quả thực tế

1. `mvnw.cmd -o -q -Dtest=DatabaseSchemaMigrationTests test`: thành công,4test.
2. `mvnw.cmd -o -B verify`: BUILD SUCCESS, **47 tests,0failures,0errors,0skipped**, đóng gói JAR thành công.
3. Git diff --check: đạt. V1–V3 so Git hash-object với HEAD: không thay đổi (chuẩn hóa line endings checkout).

Các test mới chứng minh: schema mới migrate đếnV7,22bảng, chạy lại0migration; upgradeV3 giữ user/session/checksum; FK ownership online/POS và payment amount; unique category/review/bankreference; quantity/price/terminal timestamps; reviewrating; reset expiry/attempts/consume; RAG activeversion/chunk thuộc đúng document, dimension khớp version, JSON mảng số, publish/delete và worker lease.

Full verify bao gồm testauth/Google/Turnstile hiện có và Hibernatevalidate, không tạo fixture nghiệp vụ mới trong schemaauth dùng chung. Mỗi testmigration tạo schema riêng và tự xóa đúng schema đó sau test.

## Giới hạn

Đây là kiểm chứng database/migration, không khẳng định API/UI catalog/order/reset/RAG đã được triển khai. Ràng buộc liên bảng về eligibility, quyền, tổngitems, chuyển trạng thái, publishREADY, OTPresend và quota cần service/transaction ở các giai đoạn tiếp theo, được ghi rõ trong docs/database-design.md. Không tự import18sản phẩm nguồn, không áp dụng lên tu_coffee cổng3306, chưa commit/push/PR trong lượt này.
