import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { TurnstileWidget } from './turnstile-widget';
describe('Turnstile widget lifecycle', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [TurnstileWidget],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }),
  );
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    delete window.turnstile;
  });
  it('allows email forms only after backend explicitly disables the widget', async () => {
    const f = TestBed.createComponent(TurnstileWidget);
    f.detectChanges();
    expect(f.componentInstance.canSubmit()).toBe(false);
    TestBed.inject(HttpTestingController)
      .expectOne('/api/v1/auth/turnstile/config')
      .flush({ enabled: false, siteKey: null });
    await f.whenStable();
    expect(f.componentInstance.canSubmit()).toBe(true);
  });
  it('blocks submission when configuration cannot be loaded', async () => {
    const f = TestBed.createComponent(TurnstileWidget);
    f.detectChanges();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/v1/auth/turnstile/config')
      .flush({}, { status: 503, statusText: 'Unavailable' });
    await f.whenStable();
    expect(f.componentInstance.canSubmit()).toBe(false);
    expect(f.componentInstance.error()).not.toBe('');
  });
  it('expires tokens, resets after attempts and removes the widget on close', async () => {
    const render = vi.fn().mockReturnValue('widget-id');
    const reset = vi.fn();
    const remove = vi.fn();
    window.turnstile = { render, reset, remove };
    const f = TestBed.createComponent(TurnstileWidget);
    f.detectChanges();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/v1/auth/turnstile/config')
      .flush({ enabled: true, siteKey: 'public-key' });
    await f.whenStable();
    for (let i = 0; i < 8; i++) await Promise.resolve();
    const options = render.mock.calls[0][1];
    expect(options.action).toBe('login');
    expect(f.componentInstance.canSubmit()).toBe(false);
    options.callback('token');
    expect(f.componentInstance.canSubmit()).toBe(true);
    options['expired-callback']();
    expect(f.componentInstance.canSubmit()).toBe(false);
    options.callback('second');
    f.componentInstance.reset();
    expect(reset).toHaveBeenCalledWith('widget-id');
    expect(f.componentInstance.token()).toBe('');
    f.destroy();
    expect(remove).toHaveBeenCalledWith('widget-id');
    options.callback('late');
    expect(f.componentInstance.token()).toBe('');
  });
});
