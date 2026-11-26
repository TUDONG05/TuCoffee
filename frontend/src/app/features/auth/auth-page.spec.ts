import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { AuthPage } from './auth-page';
import { AuthService } from '../../core/auth/auth.service';

describe('Google account linking form', () => {
  it('requires confirmation and submits the existing password through the real form', async () => {
    const googleLogin = vi
      .fn()
      .mockRejectedValueOnce(
        new HttpErrorResponse({ status: 409, error: { code: 'GOOGLE_LINK_REQUIRED' } }),
      )
      .mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      imports: [AuthPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { notice: signal(''), googleLogin } },
      ],
    });
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AuthPage);
    fixture.detectChanges();
    http.expectOne('/api/v1/auth/turnstile/config').flush({ enabled: false });
    http.expectOne('/api/v1/auth/google/config').flush({ enabled: false });
    await fixture.componentInstance.signInWithGoogle('verified-credential');
    fixture.detectChanges();
    expect(fixture.componentInstance.googleLink()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
    fixture.componentInstance.googlePassword.setValue('local-password');
    const form = fixture.nativeElement.querySelector('form.google-link') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(googleLogin).toHaveBeenLastCalledWith('verified-credential', 'local-password');
    expect(fixture.componentInstance.googlePassword.value).toBe('');
    expect(fixture.componentInstance.googleLink()).toBe(false);
    expect(navigate).toHaveBeenCalled();
    http.verify();
  });
});

describe('Embedded authentication', () => {
  it('finishes login in place without navigating away from the current page', async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      imports: [AuthPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { notice: signal(''), login } },
      ],
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(AuthPage);
    fixture.componentRef.setInput('mode', 'login');
    fixture.detectChanges();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/v1/auth/turnstile/config')
      .flush({ enabled: false });
    await fixture.whenStable();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/v1/auth/google/config')
      .flush({ enabled: false });
    fixture.componentInstance.form.patchValue({
      email: 'test@example.com',
      password: 'valid-password',
    });
    await fixture.componentInstance.submit();
    expect(login).toHaveBeenCalledWith(
      { email: 'test@example.com', password: 'valid-password' },
      undefined,
    );
    expect(navigate).not.toHaveBeenCalled();
  });
});
