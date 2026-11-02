import { HttpErrorResponse } from '@angular/common/http';

export function apiError(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) return 'Không thể hoàn tất. Vui lòng thử lại.';
  if (error.status === 0) return 'Không kết nối được máy chủ. Kiểm tra kết nối rồi thử lại.';
  const code = error.error?.code as string | undefined;
  if (code === 'GOOGLE_TOKEN_INVALID' || code === 'GOOGLE_NONCE_INVALID')
    return 'Phiên Google không hợp lệ hoặc đã hết hạn. Vui lòng mở lại form đăng nhập để thử lại.';
  if (code === 'TURNSTILE_REQUIRED' || code === 'TURNSTILE_INVALID')
    return 'Vui lòng hoàn tất xác minh Cloudflare rồi thử lại.';
  if (code === 'TURNSTILE_UNAVAILABLE') return 'Chưa thể xác minh Cloudflare. Vui lòng thử lại.';
  if (code === 'GOOGLE_NOT_CONFIGURED') return 'Đăng nhập Google hiện chưa khả dụng.';
  if (code === 'ACCOUNT_DISABLED') return 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.';
  if (code === 'EMAIL_EXISTS' || code === 'EMAIL_ALREADY_EXISTS')
    return 'Email đã được sử dụng. Vui lòng chọn email khác hoặc đăng nhập.';
  if (error.status === 429) return 'Bạn đã thử quá nhiều lần. Vui lòng chờ 15 phút rồi thử lại.';
  if (error.status === 401)
    return 'Thông tin đăng nhập không đúng hoặc phiên đã hết hạn. Vui lòng đăng nhập lại.';
  if (error.status === 403)
    return 'Bạn không có quyền thực hiện hoặc phiên bảo vệ đã hết hạn. Vui lòng tải lại trang.';
  if (error.status === 409)
    return typeof error.error?.detail === 'string'
      ? error.error.detail
      : 'Thao tác bị từ chối vì dữ liệu đã thay đổi. Vui lòng tải lại.';
  if (error.status === 400)
    return typeof error.error?.detail === 'string'
      ? error.error.detail
      : 'Thông tin chưa hợp lệ. Vui lòng kiểm tra lại các trường.';
  return 'Máy chủ chưa sẵn sàng. Vui lòng thử lại sau.';
}
