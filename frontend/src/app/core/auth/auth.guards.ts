import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export function safeReturnUrl(value: string | null): string {
  return value && ['/checkout', '/orders', '/profile', '/admin', '/admin/users', '/admin/products', '/admin/categories'].includes(value)
    ? value : '/profile';
}

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.initialize();
  return auth.user()
    ? true
    : router.createUrlTree(['/login'], { queryParams: { returnUrl: safeReturnUrl(state.url) } });
};

export const adminGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.initialize();
  if (!auth.user())
    return router.createUrlTree(['/login'], {
      queryParams: { returnUrl: safeReturnUrl(state.url) },
    });
  return auth.isAdmin() || router.createUrlTree(['/profile'], { queryParams: { denied: '1' } });
};
