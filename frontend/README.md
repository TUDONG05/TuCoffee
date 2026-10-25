# Frontend Tu’s Coffee — giai đoạn 1

Angular standalone, strict TypeScript, SCSS và routing. Phiên bản cụ thể được khóa trong `package-lock.json`.

## Chạy local

Yêu cầu Node 24 (tối thiểu 24.15) và npm 11. Từ thư mục `frontend/`:

```powershell
npm ci
npm start
```

Mở `http://localhost:4200`. Trang `/` là lời chào tối thiểu; chưa có nghiệp vụ bán hàng.
Trang `/dev/status` dành cho lập trình viên, gọi `GET /api/v1/health` qua Angular proxy đến backend cổng 8080.
Chạy MySQL và backend theo README gốc trước khi kiểm tra kết nối. Chỉ báo thành công khi backend trả `{ "status": "UP" }`.
Yêu cầu chờ tối đa 8 giây, có hiển thị lỗi và nút thử lại. Rời trang sẽ hủy yêu cầu chưa hoàn tất.

## Kiểm tra

```powershell
npm run build
npm test
npx playwright install chromium
npm run e2e
```

Unit test dùng Vitest và HttpTestingController. Playwright tự chạy Angular dev server;
bài kiểm tra kết nối thật yêu cầu backend/MySQL đang chạy và không mock phản hồi thành công.
Hai bài còn lại kiểm tra thông báo lỗi 503 và trang chủ tại chiều rộng 320px.
Kết quả trình duyệt nằm trong `test-results/`, không đưa vào Git.

Proxy chỉ dùng cho phát triển. Reverse proxy khi triển khai sẽ cấu hình trong giai đoạn phát hành.
