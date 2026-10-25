---
date: 2026-10-25
timezone: Asia/Saigon
phase: 1
---

# Nhật ký giai đoạn 1 — Nền tảng

## Bối cảnh

Bắt đầu TuCoffee theo kế hoạch tiếng Việt, triển khai từng giai đoạn.

## Diễn biến

Spring Boot, Angular và MySQL đã kết nối qua proxy. Maven đạt 2 kiểm tra; Angular đạt 7; Playwright đạt 3. Dừng MySQL làm health trả 503; chạy lại DB trả 200, giữ một bản ghi Flyway V1.

## Nhìn lại

Windows khóa JAR đang chạy khiến lần đóng gói đầu lỗi; dừng JVM rồi chạy lại đạt. CLI cập nhật kế hoạch bỏ qua định dạng tiếng Việt, cần đồng bộ tay và đọc lại.

## Quyết định

Giữ health tối thiểu, chưa tạo nghiệp vụ tương lai. Không nhận local pass là CI từ xa.

## Tiếp theo

Commit nền tảng đang chờ. Giai đoạn 2–6 còn nguyên; tiếp theo làm tài khoản khi chuyển giai đoạn.
