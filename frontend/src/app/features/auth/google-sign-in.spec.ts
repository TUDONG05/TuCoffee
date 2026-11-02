import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { GoogleSignIn } from './google-sign-in';

describe('Google sign-in button', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [GoogleSignIn],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    delete window.google;
  });

  it('keeps a clear disabled state when Google is not configured', async () => {
    const fixture = TestBed.createComponent(GoogleSignIn);
    fixture.detectChanges();
    http
      .expectOne('/api/v1/auth/google/config')
      .flush({ enabled: false, clientId: null, nonce: null });
    await fixture.whenStable();
    for (let i = 0; i < 8; i++) await Promise.resolve();
    fixture.detectChanges();
    expect(fixture.componentInstance.state()).toBe('disabled');
    expect(fixture.nativeElement.querySelector('button').disabled).toBe(true);
  });

  it('binds the official button to the server nonce and emits the credential', async () => {
    const initialize = vi.fn();
    const renderButton = vi.fn();
    window.google = { accounts: { id: { initialize, renderButton } } };
    const fixture = TestBed.createComponent(GoogleSignIn);
    const credential = vi.fn();
    fixture.componentInstance.credential.subscribe(credential);
    fixture.detectChanges();
    http
      .expectOne('/api/v1/auth/google/config')
      .flush({ enabled: true, clientId: 'web-client', nonce: 'browser-nonce' });
    await fixture.whenStable();
    for (let i = 0; i < 8; i++) await Promise.resolve();
    fixture.detectChanges();
    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'web-client',
        nonce: 'browser-nonce',
        auto_select: false,
      }),
    );
    expect(renderButton).toHaveBeenCalledOnce();
    initialize.mock.calls[0][0].callback({ credential: 'signed-google-token' });
    expect(credential).toHaveBeenCalledWith('signed-google-token');
    fixture.destroy();
    initialize.mock.calls[0][0].callback({ credential: 'late-callback' });
    expect(credential).toHaveBeenCalledTimes(1);
  });

  it('allows retry after the backend is temporarily unavailable', async () => {
    const fixture = TestBed.createComponent(GoogleSignIn);
    fixture.detectChanges();
    http
      .expectOne('/api/v1/auth/google/config')
      .flush({}, { status: 503, statusText: 'Unavailable' });
    await fixture.whenStable();
    expect(fixture.componentInstance.state()).toBe('error');
    const retried = fixture.componentInstance.reload();
    http.expectOne('/api/v1/auth/google/config').flush({ enabled: false });
    await retried;
    expect(fixture.componentInstance.state()).toBe('disabled');
  });
});
