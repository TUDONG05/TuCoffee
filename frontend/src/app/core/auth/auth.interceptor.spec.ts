import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from './auth.service';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  const auth = {
    token: vi.fn((): string | null => 'old-token'),
    refresh: vi.fn(),
    endSession: vi.fn(),
  };
  beforeEach(() => {
    vi.clearAllMocks();
    auth.token.mockReturnValue('old-token');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
      ],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('never adds a bearer to third-party, public health or authentication requests', async () => {
    for (const url of [
      'https://example.com/api/v1/users/me',
      '/api/v1/health',
      '/api/v1/auth/login',
    ]) {
      const result = firstValueFrom(client.get(url));
      const request = http.expectOne(url);
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush({});
      await result;
    }
    expect(auth.refresh).not.toHaveBeenCalled();
  });

  it('refreshes expired access once and retries the protected request once', async () => {
    auth.refresh.mockImplementation(async () => {
      auth.token.mockReturnValue('fresh-token');
      return 'fresh-token';
    });
    const result = firstValueFrom(client.get('/api/v1/users/me')).catch(
      (error: HttpErrorResponse) => error.status,
    );
    const original = http.expectOne('/api/v1/users/me');
    expect(original.request.headers.get('Authorization')).toBe('Bearer old-token');
    original.flush({ code: 'ACCESS_TOKEN_EXPIRED' }, { status: 401, statusText: 'Unauthorized' });
    await Promise.resolve();
    await Promise.resolve();
    const retry = http.expectOne('/api/v1/users/me');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer fresh-token');
    retry.flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(await result).toBe(401);
    expect(auth.refresh).toHaveBeenCalledTimes(1);
    expect(auth.endSession).toHaveBeenCalledTimes(1);
  });

  it('clears a locked account immediately without refresh', async () => {
    const result = firstValueFrom(client.get('/api/v1/users/me')).catch(() => 'rejected');
    http
      .expectOne('/api/v1/users/me')
      .flush({ code: 'ACCOUNT_DISABLED' }, { status: 401, statusText: 'Unauthorized' });
    expect(await result).toBe('rejected');
    expect(auth.endSession).toHaveBeenCalled();
    expect(auth.refresh).not.toHaveBeenCalled();
  });

  it('preserves a new session when an older request returns a delayed 401', async () => {
    const result = firstValueFrom(client.get('/api/v1/users/me')).catch(() => 'rejected');
    const oldRequest = http.expectOne('/api/v1/users/me');
    auth.token.mockReturnValue('new-session-token');
    oldRequest.flush({ code: 'SESSION_REVOKED' }, { status: 401, statusText: 'Unauthorized' });
    expect(await result).toBe('rejected');
    expect(auth.token()).toBe('new-session-token');
    expect(auth.endSession).not.toHaveBeenCalled();
    expect(auth.refresh).not.toHaveBeenCalled();
  });

  it('preserves a newer session when a retried older request returns 401', async () => {
    auth.refresh.mockImplementation(async () => {
      auth.token.mockReturnValue('fresh-token');
      return 'fresh-token';
    });
    const result = firstValueFrom(client.get('/api/v1/users/me')).catch(() => 'rejected');
    http
      .expectOne('/api/v1/users/me')
      .flush({ code: 'ACCESS_TOKEN_EXPIRED' }, { status: 401, statusText: 'Unauthorized' });
    await Promise.resolve();
    await Promise.resolve();
    const retry = http.expectOne('/api/v1/users/me');
    auth.token.mockReturnValue('new-session-token');
    retry.flush({ code: 'SESSION_REVOKED' }, { status: 401, statusText: 'Unauthorized' });
    expect(await result).toBe('rejected');
    expect(auth.token()).toBe('new-session-token');
    expect(auth.endSession).not.toHaveBeenCalled();
  });

  it('never retries a rejected refresh call', async () => {
    const result = firstValueFrom(client.post('/api/v1/auth/refresh', {})).catch(() => 'rejected');
    http.expectOne('/api/v1/auth/refresh').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(await result).toBe('rejected');
    expect(auth.refresh).not.toHaveBeenCalled();
  });
});
