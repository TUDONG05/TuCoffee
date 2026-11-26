# Cloudflare Turnstile

Phạm vi: đăng nhập email/mật khẩu và đăng ký. Google login giữ kiểm chứng ID token; refresh/logout không cần captcha.

GET /api/v1/auth/turnstile/config: public, no-store, trả {enabled,siteKey}, không trả secret. Khi bật, POST /auth/login và /auth/register yêu cầu header X-Turnstile-Token bên cạnh CSRF. Backend Siteverify kiểm tra success, action login/register, hostname allowlist trước identity. Thiếu token: 400 TURNSTILE_REQUIRED; sai/hết hạn/dùng lại/action/hostname sai: 400 TURNSTILE_INVALID; mạng/provider lỗi: 503 TURNSTILE_UNAVAILABLE, không cho qua.

Cấu hình .env: TURNSTILE_ENABLED=false khi chưa cấu hình; TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY, TURNSTILE_HOSTNAMES=localhost,127.0.0.1. Tạo widget Managed tại Cloudflare, khai báo hostname tương ứng, điền keys, bật true rồi restart backend. Bật mà thiếu key/hostname sẽ từ chối khởi động. Không log token/secret, không đưa Secret Key vào Angular/Git/chat. Không thay cấu hình Google hiện có.

Frontend explicit rendering, flexible/light; chưa xác minh thì chặn submit email. Lỗi config không coi là disabled; có thử lại. Token expired/error phải xóa. Reset sau mỗi attempt và remove widget khi đóng/chuyển tab. Không tự retry POST. Token 300 giây, dùng một lần.

Kiểm tra unit backend HTTP mock cho valid/invalid/missing/action/hostname/timeout và controller trước identity; frontend callback/reset/cleanup/header; E2E mock tách với provider thật. Chưa có keys thì live vẫn chưa kiểm chứng. Test keys chính thức chỉ dùng kiểm thử, không bật mặc định trên môi trường thật.

Nguồn: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/ và https://developers.cloudflare.com/turnstile/troubleshooting/testing/.
