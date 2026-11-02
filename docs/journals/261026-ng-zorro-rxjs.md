---
title: "Frontend NG-ZORRO và RxJS"
date: "2026-10-26"
status: completed
scope: frontend
---

# Frontend NG-ZORRO và RxJS

## Yêu cầu và phạm vi

Người dùng yêu cầu frontend Angular dùng NG-ZORRO (Ant Design) và RxJS. Chuyển giao diện các màn hình hiện có; không thêm nghiệp vụ bán hàng, thay đổi backend hoặc hợp đồng API.

## Quyết định triển khai

- Dùng NG-ZORRO 22.1.2 tương thích Angular 22, locale `vi_VN`; import module trực tiếp trong standalone component và nạp có chọn lọc stylesheet.
- Thay control tại đăng nhập/đăng ký, hồ sơ, quản trị tài khoản, điều hướng và nút kiểm tra kết nối. Giữ nội dung tiếng Việt, ID/label, Reactive Forms, loading/disabled và bố cục đáp ứng hiện có.
- Giữ token thương hiệu xanh/kem; tách CSS control HTML cũ khỏi control NG-ZORRO để tránh xung đột.
- Dùng RxJS 7.8 ở quản trị: debounce bộ lọc 300ms; `switchMap` hủy truy vấn danh sách cũ; `exhaustMap` chặn yêu cầu khóa/mở trùng; `takeUntilDestroyed` dọn subscription. Giữ nguyên cơ chế xác thực và không thêm retry cho mutation/refresh.

## Kiểm chứng

- Dùng Node 24.18.0 đã cài tại `C:/Program Files/nodejs` để chạy kiểm tra; shell của IDE đang trỏ Node 24.13.0.
- Toàn bộ 36 unit test trong 7 tệp đạt, gồm 11 ca quản trị. Hai lỗi cạnh tranh được tái hiện trước khi sửa: tìm A → tìm thủ công B → quay về A; đổi bộ lọc khi mutation hoàn tất ở trang sau. Đã sửa bằng so sánh với query mới nhất và đưa bộ lọc mới về trang 0.
- Production build đạt; initial bundle 621.37kB vượt ngưỡng cảnh báo 500kB nhưng dưới ngưỡng lỗi 1MB; giữ nguyên budget.
- Playwright smoke trên production build với API giả lập đạt: đăng ký/đăng nhập, sửa hồ sơ, đổi mật khẩu, lọc bàn phím, khóa/mở tài khoản; kiểm tra 360px và không có lỗi runtime. Chưa chạy lại E2E với MySQL/backend thật trong đợt này.
- Rà soát mã cuối không còn lỗi được phát hiện. `git diff --check` đạt.
- `npm audit` còn 2 cảnh báo trong nhánh công cụ build Angular/Vite đang có; NG-ZORRO không nằm trong danh sách advisory. Không chạy audit fix force hoặc đổi bộ công cụ ngoài phạm vi.

## Theo dõi

Chưa commit hoặc push. Theo dõi tối ưu bundle và cập nhật công cụ build riêng; không thay đổi nghiệp vụ/backend trong đợt này.
