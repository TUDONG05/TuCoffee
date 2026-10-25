# Quy ước giao diện TuCoffee

## Giai đoạn 1

Chỉ có bộ khung ứng dụng và trang kiểm tra kết nối dành cho phát triển tại `/dev/status`.
Không thêm menu bán hàng, giỏ hoặc đăng nhập trước giai đoạn tương ứng.

## Màu và chữ

- Nền sáng: `#f7f3ec`; chữ đậm: `#30251f`.
- Màu chính: `#264b3c`; chữ phụ: `#695c52`; đường phân cách: `#d5cbbd`.
- Tiêu đề Georgia; nội dung Segoe UI và các font hệ thống hỗ trợ tiếng Việt.
- Không phụ thuộc font, hình ảnh hoặc CDN bên ngoài để chạy bộ khung.

## Trạng thái và khả năng sử dụng

- Nút có vùng bấm tối thiểu 44px; focus bàn phím rõ ràng.
- Trang kết nối hiển thị đang tải, thành công, không sẵn sàng hoặc lỗi mạng, có thử lại.
- Thông báo động dùng aria-live; giao diện co giãn từ chiều rộng 360px.
- Tôn trọng prefers-reduced-motion; chi tiết kỹ thuật đặt ở trang phát triển.
