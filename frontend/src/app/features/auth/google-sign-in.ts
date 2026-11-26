import { HttpClient } from '@angular/common/http';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { NzButtonModule } from 'ng-zorro-antd/button';

interface GoogleApi {
  initialize(options: {
    client_id: string;
    nonce: string;
    auto_select: boolean;
    callback: (response: { credential: string }) => void;
  }): void;
  renderButton(
    element: HTMLElement,
    options: {
      type: string;
      theme: string;
      size: string;
      text: string;
      locale: string;
      width: number;
      shape: string;
    },
  ): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleApi } };
  }
}

let scriptFlight: Promise<void> | undefined;
function loadGoogle(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptFlight) return scriptFlight;
  scriptFlight = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    const timer = window.setTimeout(() => fail(), 10000);
    const fail = () => {
      window.clearTimeout(timer);
      script.remove();
      scriptFlight = undefined;
      reject(new Error('Google unavailable'));
    };
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      window.clearTimeout(timer);
      window.google?.accounts?.id ? resolve() : fail();
    };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return scriptFlight;
}

@Component({
  selector: 'app-google-sign-in',
  imports: [NzButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="divider"><span>hoặc</span></div>
    <div #button class="google-button" [style.visibility]="state() === 'ready' ? 'visible' : 'hidden'"></div>
    @if (state() === 'loading') {
      <p role="status">Đang tải đăng nhập Google…</p>
    }
    @if (state() === 'disabled' || state() === 'error') {
      <button nz-button nzBlock nzSize="large" type="button" disabled>Đăng nhập bằng Google</button>
      <p role="status">Đăng nhập Google hiện chưa khả dụng.</p>
    }
    @if (state() === 'error') {
      <button nz-button nzType="link" type="button" class="retry" (click)="reload()">
        Thử lại Google
      </button>
    }
  `,
  styles: `
    :host {
      display: block;
      text-align: center;
      margin-top: 1.5rem;
    }
    .divider {
      display: flex;
      align-items: center;
      gap: 1rem;
      color: var(--muted);
      margin-bottom: 1.25rem;
    }
    .divider::before,
    .divider::after {
      content: '';
      height: 1px;
      background: var(--line);
      flex: 1;
    }
    .google-button {
      display: flex;
      justify-content: center;
      min-height: 44px;
    }

    p {
      font-size: 0.85rem;
      color: var(--muted);
      margin: 0.75rem 0;
    }
    button {
      max-width: 100%;
      min-height: 44px;
    }
    .retry {
      border: 0;
      background: transparent;
      color: var(--muted);
      font-size: 0.8rem;
      text-decoration: underline;
    }
  `,
})
export class GoogleSignIn implements AfterViewInit {
  private readonly http = inject(HttpClient);
  private readonly destroy = inject(DestroyRef);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('button');
  private generation = 0;
  readonly credential = output<string>();
  readonly state = signal<'loading' | 'ready' | 'disabled' | 'error'>('loading');

  ngAfterViewInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    const generation = ++this.generation;
    this.state.set('loading');
    this.host().nativeElement.replaceChildren();
    try {
      const config = await firstValueFrom(
        this.http
          .get<{ enabled: boolean; clientId: string | null; nonce: string | null }>(
            '/api/v1/auth/google/config',
          )
          .pipe(timeout(8000)),
      );
      if (this.destroy.destroyed || generation !== this.generation) return;
      if (!config.enabled || !config.clientId || !config.nonce) {
        this.state.set('disabled');
        return;
      }
      await loadGoogle();
      if (this.destroy.destroyed || generation !== this.generation) return;
      const google = window.google!.accounts.id;
      google.initialize({
        client_id: config.clientId,
        nonce: config.nonce,
        auto_select: false,
        callback: (response) => {
          if (!this.destroy.destroyed && generation === this.generation)
            this.credential.emit(response.credential);
        },
      });
      google.renderButton(this.host().nativeElement, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        locale: 'vi',
        width: Math.min(400, Math.max(200, this.host().nativeElement.clientWidth)),
        shape: 'rectangular',
      });
      this.state.set('ready');
    } catch {
      if (!this.destroy.destroyed && generation === this.generation) this.state.set('error');
    }
  }
}
