# Quy ước giao diện TuCoffee

## Thiết kế hiện hành — cập nhật theo ảnh tham chiếu

Ưu tiên quy định này khi các ghi chú lịch sử bên dưới khác biệt: dùng tông đỏ #c8102e, hover #a20c25, nền #fafafa, bề mặt trắng #ffffff, chữ #252525 và viền #e4e4e4. Tất cả panel/control góc vuông, không bo tròn. Tiêu đề/nội dung dùng Segoe UI/system sans-serif.

Thanh điều hướng nền trắng, chữ nâu #352317; hover/active đỏ #c8102e trên nền đỏ nhạt, mục active có gạch chân đỏ, góc vuông.

Form tài khoản dùng NG-ZORRO Modal, Tabs, Form, Input, Button và Alert. Hai tab Đăng nhập/Đăng ký, input cao 50px, nút chính đỏ rộng toàn form, Google chính thức bên dưới divider. Label vẫn có cho trình đọc màn hình; validation xuất hiện gần input. Đóng bằng nút ×/Escape và trả focus về nút mở; không đóng khi đang gửi. Chuyển tab và đăng nhập thành công giữ nguyên trang. Chưa thêm nút quên mật khẩu khi chưa có nghiệp vụ reset.

Các mục bên dưới là lịch sử trước thay đổi giao diện.

## Giai đoạn 1

Chỉ có bộ khung ứng dụng và trang kiểm tra kết nối dành cho phát triển tại `/dev/status`.
Không thêm menu bán hàng, giỏ hoặc đăng nhập trước giai đoạn tương ứng.

## Màu và chữ

- Theo ảnh tham chiếu: nâu espresso, caramel và kem. Nền sáng `#f7f1e8`; chữ đậm `#352317`.
- Màu chính/nút `#80512f`, hover `#633b21`; chữ phụ `#756354`; đường phân cách `#e2d3c1`.
- Header/footer và mảng giới thiệu dùng espresso `#321f14`, nâu sâu `#21140d`; chữ kem `#fff5e7`, chữ phụ `#dcc7ad`, nhấn caramel `#c49a6c`.
- Caramel dùng để nhấn trên nền tối hoặc làm nền nút với chữ nâu đậm; không dùng chữ caramel trên nền kem cho nội dung nhỏ.
- Trạng thái thành công giữ xanh `#366346` trên nền `#edf4ea`; lỗi giữ đỏ `#9b2c22`. Màu trạng thái không thay thế bằng màu thương hiệu.
- Tiêu đề Georgia; nội dung Segoe UI và các font hệ thống hỗ trợ tiếng Việt.
- Không phụ thuộc font, hình ảnh hoặc CDN bên ngoài để chạy bộ khung.

## Trạng thái và khả năng sử dụng

- Nút có vùng bấm tối thiểu 44px; focus bàn phím rõ ràng.
- Trang kết nối hiển thị đang tải, thành công, không sẵn sàng hoặc lỗi mạng, có thử lại.
- Thông báo động dùng aria-live; giao diện co giãn từ chiều rộng 360px.
- Tôn trọng prefers-reduced-motion; chi tiết kỹ thuật đặt ở trang phát triển.

## Bổ sung giao diện giai đoạn 2

- Giữ màu nền kem và thương hiệu nâu; bề mặt `#fffdf9`, nền nhấn `#f0e3d2`.
- Form một cột trên mobile, bố cục chia phần giới thiệu và form trên desktop.
- Nhãn luôn hiển thị, thông báo qua `aria-live`, input cao tối thiểu 48px; mật khẩu có nút hiện/ẩn.
- Danh sách tài khoản thích ứng màn hình nhỏ; xác nhận trước khi khóa/mở tài khoản.

## NG-ZORRO và RxJS

- Dùng NG-ZORRO 22.1.2 (Ant Design cho Angular 22); import module cần dùng trực tiếp trong từng standalone component. Dùng `nz-form`, `nz-input`, `nz-button`, `nz-alert`, `nz-checkbox`, `nz-select` và `nz-tag` theo chức năng của màn hình.
- Cấu hình tiếng Việt bằng `provideNzI18n(vi_VN)` tại `app.config.ts`. Giữ nguyên nhãn, mô tả và thông báo nghiệp vụ tiếng Việt.
- Chỉ nạp style nền và stylesheet của các thành phần đang sử dụng; không nạp toàn bộ thư viện. Style thương hiệu khai báo sau style thư viện, dùng token nâu `--brand: #80512f`, nền kem `--background: #f7f1e8`, bề mặt `--surface: #fffdf9` và nền nhấn `--brand-soft: #f0e3d2`.
- Các control NG-ZORRO có loading/disabled rõ ràng; giữ nhãn liên kết với input, vùng bấm tối thiểu 44px, trợ giúp và trạng thái lỗi gần trường nhập. Không để CSS control HTML cũ ghi đè control NG-ZORRO.
- Giữ Reactive Forms và Angular signals cho trạng thái hiển thị. Dùng RxJS 7.8 cho luồng HTTP/tương tác: bộ lọc quản trị debounce 300ms, `switchMap` hủy truy vấn danh sách cũ; `exhaustMap` bỏ qua thao tác khóa/mở lặp khi yêu cầu trước chưa xong; `takeUntilDestroyed` kết thúc subscription khi rời trang.
- Không tự retry thao tác thay đổi dữ liệu hoặc refresh phiên đăng nhập; giữ nguyên hợp đồng API và cơ chế xác thực hiện có.
