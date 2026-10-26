import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { adminGuard, authGuard, safeReturnUrl } from './auth.guards';
import { AuthService } from './auth.service';

describe('identity route guards', () => {
  const auth = { initialize: vi.fn(), user: vi.fn(), isAdmin: vi.fn() };
  beforeEach(() => {
    vi.clearAllMocks(); auth.initialize.mockResolvedValue(undefined); auth.user.mockReturnValue(null); auth.isAdmin.mockReturnValue(false);
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthService, useValue: auth }] });
  });
  it('waits for session restoration before redirecting an anonymous visitor', async () => {
    const result = await TestBed.runInInjectionContext(() => authGuard({} as ActivatedRouteSnapshot, { url: '/profile' } as RouterStateSnapshot));
    expect(auth.initialize).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(Router).serializeUrl(result as never)).toBe('/login?returnUrl=%2Fprofile');
  });
  it('redirects a USER away from admin routes', async () => {
    auth.user.mockReturnValue({ role: 'USER' });
    const result = await TestBed.runInInjectionContext(() => adminGuard({} as ActivatedRouteSnapshot, { url: '/admin/users' } as RouterStateSnapshot));
    expect(TestBed.inject(Router).serializeUrl(result as never)).toBe('/profile?denied=1');
  });
  it('accepts only known local return routes', () => {
    for (const value of ['https://evil.test', '//evil.test', '/admin/users?next=https://evil.test', '/\\evil.test', null]) expect(safeReturnUrl(value)).toBe('/profile');
    expect(safeReturnUrl('/admin/users')).toBe('/admin/users');
  });
});
