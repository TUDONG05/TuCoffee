import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { RecoveryService } from './recovery.service';

describe('RecoveryService', () => {
  let service: RecoveryService;
  let http: HttpTestingController;
  const auth = { csrf: vi.fn().mockResolvedValue(undefined), endSession: vi.fn() };
  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AuthService, useValue: auth }] });
    service = TestBed.inject(RecoveryService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('requests CSRF before issuing the anonymous challenge', async () => {
    const pending = service.request('test@example.com');
    await Promise.resolve();
    const request = http.expectOne('/api/v1/auth/forgot-password');
    expect(auth.csrf).toHaveBeenCalled();
    expect(request.request.body).toEqual({ email: 'test@example.com' });
    request.flush({ challengeId: 'opaque', expiresIn: 600, resendAfter: 60, message: 'received' }, { status: 202, statusText: 'Accepted' });
    expect((await pending).challengeId).toBe('opaque');
  });
  it('only clears local authentication after a confirmed password reset', async () => {
    const pending = service.reset('opaque', '123456', 'new-password');
    await Promise.resolve();
    const request = http.expectOne('/api/v1/auth/reset-password');
    expect(auth.endSession).not.toHaveBeenCalled();
    expect(request.request.body).toEqual({ challengeId: 'opaque', code: '123456', newPassword: 'new-password' });
    request.flush(null, { status: 204, statusText: 'No Content' });
    await pending;
    expect(auth.endSession).toHaveBeenCalledOnce();
  });
  it('preserves local authentication on rejected reset', async () => {
    const pending = service.reset('opaque', '123456', 'new-password');
    const rejected = expect(pending).rejects.toBeDefined();
    await Promise.resolve();
    http.expectOne('/api/v1/auth/reset-password').flush({ code: 'INVALID_RESET_CODE' }, { status: 400, statusText: 'Bad Request' });
    await rejected; expect(auth.endSession).not.toHaveBeenCalled();
  });
});
