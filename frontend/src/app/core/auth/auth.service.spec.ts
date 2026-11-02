import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { AuthResponse } from './auth.models';
import { vi } from 'vitest';

const response: AuthResponse = {
  accessToken: 'memory-token',
  expiresIn: 900,
  user: {
    id: 7,
    name: 'Nguyễn An',
    email: 'an@example.com',
    phone: null,
    address: null,
    role: 'USER',
    active: true,
  },
};
const tick = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

describe('AuthService session coordination', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('accepts Google login using the existing session lifecycle', async () => {
    const login = auth.googleLogin('google-credential', 'existing-password');
    await tick();
    http.expectOne('/api/v1/auth/csrf').flush({});
    await tick();
    const request = http.expectOne('/api/v1/auth/google');
    expect(request.request.body).toEqual({
      credential: 'google-credential',
      currentPassword: 'existing-password',
    });
    request.flush(response);
    await tick();
    http.expectOne('/api/v1/auth/csrf').flush({});
    await login;
    expect(auth.user()?.id).toBe(7);
    expect(auth.token()).toBe('memory-token');
    expect(localStorage.getItem('google-credential')).toBeNull();
  });

  it('does not retry a failed Google login or accept it as a session', async () => {
    const login = auth.googleLogin('google-credential').catch(() => 'failed');
    await tick();
    http.expectOne('/api/v1/auth/csrf').flush({});
    await tick();
    http
      .expectOne('/api/v1/auth/google')
      .flush({ code: 'GOOGLE_LINK_REQUIRED' }, { status: 409, statusText: 'Conflict' });
    expect(await login).toBe('failed');
    expect(auth.user()).toBeNull();
    http.expectNone('/api/v1/auth/google');
  });

  async function answerRefresh(): Promise<void> {
    await tick();
    http.expectOne('/api/v1/auth/csrf').flush({ headerName: 'X-XSRF-TOKEN', token: 'csrf' });
    await tick();
    http.expectOne('/api/v1/auth/refresh').flush(response);
    await tick();
  }

  it('shares a single refresh and keeps the access token out of browser storage', async () => {
    const a = auth.refresh();
    const b = auth.refresh();
    expect(a).toBe(b);
    await answerRefresh();
    expect(await a).toBe('memory-token');
    expect(auth.user()?.id).toBe(7);
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(sessionStorage.getItem('accessToken')).toBeNull();
  });

  it('does not retry an ambiguous refresh network failure', async () => {
    const result = auth.refresh().catch(() => 'failed');
    await tick();
    http.expectOne('/api/v1/auth/csrf').flush({});
    await tick();
    http.expectOne('/api/v1/auth/refresh').error(new ProgressEvent('error'));
    expect(await result).toBe('failed');
    expect(auth.token()).toBeNull();
    http.expectNone('/api/v1/auth/refresh');
  });

  it('settles bootstrap on an anonymous refresh response', async () => {
    const initialized = auth.initialize();
    await tick();
    http.expectOne('/api/v1/auth/csrf').flush({});
    await tick();
    http.expectOne('/api/v1/auth/refresh').flush({}, { status: 401, statusText: 'Unauthorized' });
    await initialized;
    expect(auth.ready()).toBe(true);
    expect(auth.user()).toBeNull();
    expect(auth.notice()).toBe('');
  });

  it('does not resurrect state when logout overlaps an in-flight refresh', async () => {
    const refreshing = auth.refresh().catch(() => 'cancelled');
    await tick();
    http.expectOne('/api/v1/auth/csrf').flush({});
    await tick();
    const request = http.expectOne('/api/v1/auth/refresh');
    const logout = auth.logout();
    request.flush(response);
    await tick();
    http.expectOne('/api/v1/auth/csrf').flush({});
    await tick();
    http.expectOne('/api/v1/auth/logout').flush(null);
    await tick();
    http.expectOne('/api/v1/auth/csrf').flush({});
    await logout;
    expect(await refreshing).toBe('cancelled');
    expect(auth.token()).toBeNull();
  });

  it('registers without silently authenticating the new account', async () => {
    const registered = auth.register({
      name: 'Nguyễn An',
      email: 'an@example.com',
      password: 'safe-password',
    });
    await tick();
    http.expectOne('/api/v1/auth/csrf').flush({});
    await tick();
    const request = http.expectOne('/api/v1/auth/register');
    expect(request.request.body).toEqual({
      name: 'Nguyễn An',
      email: 'an@example.com',
      password: 'safe-password',
    });
    request.flush(response.user, { status: 201, statusText: 'Created' });
    expect((await registered).role).toBe('USER');
    expect(auth.user()).toBeNull();
  });

  it('acquires the same origin browser lock before reading current refresh cookies', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
    const acquire = vi.fn((_name: string, work: () => Promise<string>) => work());
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: acquire } });
    try {
      const refreshed = auth.refresh();
      await answerRefresh();
      await refreshed;
      expect(acquire).toHaveBeenCalledWith('tucoffee-session', expect.any(Function));
    } finally {
      if (descriptor) Object.defineProperty(navigator, 'locks', descriptor);
      else Reflect.deleteProperty(navigator, 'locks');
    }
  });
});
