# Trạng thái kiểm chứng giai đoạn 5 — 25/11/2026

Giai đoạn 5 đã merge vào `develop` tại commit `49d5b0d`. Đợt cập nhật này đối chiếu lịch sử Git và mã nguồn. Build, unit test, kiểm thử tích hợp MySQL, SMTP thật và E2E chưa được chạy lại trên commit đó. Trạng thái nghiệm thu vẫn mở.

| Hạng mục | PR | Bằng chứng cần bổ sung |
| --- | --- | --- |
| POS và hóa đơn | #5 | Tạo đơn khách lẻ, xác nhận thanh toán, hoàn tất và in hóa đơn đúng dữ liệu lúc bán. |
| Dashboard doanh thu | #6 | Đối chiếu tổng doanh thu với dữ liệu đã biết, gồm biên ngày và đơn hủy, chưa trả hoặc chưa hoàn tất. |
| Đánh giá và kiểm duyệt | #7 | Kiểm tra điều kiện đánh giá sau mua, quyền sửa, ẩn/khôi phục và cập nhật điểm trung bình. |
| Khôi phục mật khẩu qua OTP | #8 | Kiểm tra email đến hộp thư thử nghiệm cho USER và ADMIN, OTP hết hạn hoặc dùng lại, giữ nguyên vai trò và thu hồi phiên cũ. |

Repo có các lớp `PosIntegrationTests`, `ReportingIntegrationTests`, `ReviewIntegrationTests` và `RecoveryIntegrationTests`. Chạy backend với schema MySQL kiểm thử riêng, ghi kết quả build và unit test frontend, rồi ghi kết quả các luồng trên trình duyệt và gửi OTP qua SMTP thử nghiệm.

Xem [hướng dẫn chạy kiểm thử](../../README.md#kiểm-tra-và-build).
