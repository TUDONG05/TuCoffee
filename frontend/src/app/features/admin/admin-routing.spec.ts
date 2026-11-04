import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';
import { routes } from '../../app.routes';
import { AuthService } from '../../core/auth/auth.service';
import { User } from '../../core/auth/auth.models';

describe('admin area navigation', () => {
  const user = signal<User | null>(null);
  beforeEach(() => {
    user.set({ id: 1, name: 'Administrator', email: 'admin@example.test', role: 'ADMIN', active: true, phone: null, address: null });
    TestBed.configureTestingModule({ providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting(), {
      provide: AuthService, useValue: { user, isAdmin: () => user()?.role === 'ADMIN', initialize: vi.fn().mockResolvedValue(undefined), notice: signal('') },
    }] });
  });

  it('opens the overview with links to each available admin function', async () => {
    const harness = await RouterTestingHarness.create('/admin');
    const nav = harness.routeNativeElement?.querySelector('.admin-sidebar nav');
    expect(nav).not.toBeNull();
    expect(nav?.querySelector('a[href="/admin/users"]')).not.toBeNull();
    expect(nav?.querySelector('a[href="/admin/products"]')).not.toBeNull();
    expect(nav?.querySelector('a[href="/admin/categories"]')).not.toBeNull();
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain('Tổng quan');
  });

  it('blocks navigation between admin child pages after the role changes', async () => {
    const harness = await RouterTestingHarness.create('/admin');
    user.update(value => value ? { ...value, role: 'USER' } : null);
    await harness.navigateByUrl('/admin/products');
    expect(TestBed.inject(Router).url).toBe('/profile?denied=1');
    expect(harness.routeNativeElement?.querySelector('.admin-sidebar')).toBeNull();
  });
});
