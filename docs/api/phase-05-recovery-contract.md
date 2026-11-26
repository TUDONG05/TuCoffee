# Phase 5 password recovery contract

Anonymous POST endpoints, with existing Origin + CSRF protection:
- `/api/v1/auth/forgot-password`: `{ "email": "user@example.com" }` -> 202 `{ "challengeId": "uuid", "expiresIn": 600, "resendAfter": 60, "message": "..." }`. Identical response for existing, absent, disabled, Google-only and rate-limited accounts. Receipt never promises SMTP delivery.
- `/api/v1/auth/reset-password`: `{ "challengeId": "uuid", "code": "123456", "newPassword": "at least 10 characters" }` -> 204. Invalid/expired/consumed/invalidated/exhausted OTP -> 400 `INVALID_RESET_CODE`. Password follows identity policy (10 characters, maximum 72 UTF-8 bytes).

OTP: six random digits, 10-minute TTL, five failed attempts, HMAC SHA-256 over challenge ID and code with server secret. No code or password logs. Issuing an allowed challenge invalidates prior challenges. Email and remote-IP limits: 60 seconds between accepted requests, at most five in any rolling hour each (conservative burst resets after one idle hour), database coordinated with existing identity lock. Wrong attempts persist on 400. Atomic consume/password update/all session revocation uses same lock as refresh; roles remain unchanged. SMTP delivery runs after commit in a bounded executor and rechecks challenge currency in a short transaction; SMTP I/O runs outside database transactions. A newer request during SMTP transmission invalidates the older code even if its email arrives late; internal PENDING/SENT/FAILED/SUPPRESSED statuses are never public.

Frontend route `/forgot-password`, component `RecoveryPage` exported from `features/auth/recovery/recovery-page.ts`. Email entry, generic pending notice, OTP/password confirmation and resend. A reset response does not log the user in. SMTP absent: recovery is operationally pending; UI says request received and email may arrive if eligible and delivery available, never claims sent.

Environment: SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM, SMTP_AUTH, SMTP_STARTTLS, PASSWORD_RESET_SECRET (fallback AUTH_JWT_SECRET). Real SMTP delivery requires environment credentials and a delivery check.
