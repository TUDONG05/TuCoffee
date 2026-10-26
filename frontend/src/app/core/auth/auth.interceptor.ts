import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const AUTH_RETRIED = new HttpContextToken(() => false);

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  // Do not send credentials to absolute/third-party URLs or public/auth endpoints.
  const protectedRoute = /^\/api\/v1\/(users|admin)(\/|\?|$)/.test(request.url);
  if (!protectedRoute) return next(request);
  const auth = inject(AuthService);
  const token = auth.token();
  const outbound = token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;
  return next(outbound).pipe(catchError((error: unknown) => {
    if (!(error instanceof HttpErrorResponse) || error.status !== 401) return throwError(() => error);
    // A delayed failure from an older session must not invalidate a newer login/rotation.
    if (auth.token() !== token) return throwError(() => error);
    const revoked = ['ACCOUNT_DISABLED', 'USER_INACTIVE', 'SESSION_REVOKED', 'INVALID_TOKEN', 'SESSION_EXPIRED', 'REFRESH_REUSED'].includes(error.error?.code);
    // Password rotation already owns the browser lock; a failed rotation needs login, not nested refresh.
    if (revoked || request.url === '/api/v1/users/me/password' || request.context.get(AUTH_RETRIED) || !token) {
      auth.endSession();
      return throwError(() => error);
    }
    return from(auth.refresh()).pipe(switchMap((freshToken) => next(request.clone({
      setHeaders: { Authorization: `Bearer ${freshToken}` },
      context: request.context.set(AUTH_RETRIED, true),
    })).pipe(catchError((retryError: unknown) => {
      if (retryError instanceof HttpErrorResponse && retryError.status === 401 && auth.token() === freshToken) auth.endSession();
      return throwError(() => retryError);
    }))));
  }));
};
