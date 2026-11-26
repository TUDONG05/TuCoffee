import { HttpClient } from '@angular/common/http';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Input,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { NzButtonModule } from 'ng-zorro-antd/button';
interface TurnstileApi {
  render(host: HTMLElement, options: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}
let flight: Promise<void> | undefined;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (flight) return flight;
  flight = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      flight = undefined;
      reject(new Error('Turnstile unavailable'));
    };
    const timer = setTimeout(fail, 10000);
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => {
      if (window.turnstile) {
        clearTimeout(timer);
        resolve();
      } else fail();
    };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return flight;
}
@Component({
  selector: 'app-turnstile-widget',
  imports: [NzButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #widget [hidden]="!enabled()"></div>
    @if (loading()) {
      <p role="status">Đang tải xác minh Cloudflare…</p>
    }
    @if (error()) {
      <p role="alert">{{ error() }}</p>
      <button nz-button nzType="link" type="button" (click)="reload()">Thử lại xác minh</button>
    }
  `,
  styles: `
    :host {
      display: block;
      margin: 16px 0;
      width: 100%;
    }
    :host:empty {
      margin: 0;
    }
    p {
      font-size: 13px;
      color: var(--muted);
      margin: 8px 0;
    }
    button {
      padding: 0;
    }
  `,
})
export class TurnstileWidget implements AfterViewInit {
  @Input() action: 'login' | 'register' = 'login';
  private readonly http = inject(HttpClient);
  private readonly destroy = inject(DestroyRef);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('widget');
  readonly token = signal('');
  readonly enabled = signal(false);
  readonly ready = signal(false);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly canSubmit = computed(() => this.ready() && (!this.enabled() || !!this.token()));
  private id?: string;
  private generation = 0;
  constructor() {
    this.destroy.onDestroy(() => {
      ++this.generation;
      this.remove();
    });
  }
  ngAfterViewInit(): void {
    void this.reload();
  }
  private remove(): void {
    if (this.id !== undefined) {
      window.turnstile?.remove(this.id);
      this.id = undefined;
    }
  }
  reset(): void {
    this.token.set('');
    if (this.id !== undefined) window.turnstile?.reset(this.id);
  }
  async reload(): Promise<void> {
    const generation = ++this.generation;
    this.remove();
    this.ready.set(false);
    this.token.set('');
    this.error.set('');
    this.loading.set(true);
    try {
      const config = await firstValueFrom(
        this.http
          .get<{ enabled: boolean; siteKey: string | null }>('/api/v1/auth/turnstile/config')
          .pipe(timeout(8000)),
      );
      if (this.destroy.destroyed || generation !== this.generation) return;
      if (typeof config.enabled !== 'boolean') throw new Error('Invalid config');
      this.enabled.set(config.enabled);
      if (!config.enabled) {
        this.ready.set(true);
        return;
      }
      if (!config.siteKey) throw new Error('Missing site key');
      await loadScript();
      if (this.destroy.destroyed || generation !== this.generation) return;
      const active = () => !this.destroy.destroyed && generation === this.generation;
      const width = this.host().nativeElement.parentElement?.clientWidth ?? 300;
      this.id = window.turnstile!.render(this.host().nativeElement, {
        sitekey: config.siteKey,
        action: this.action,
        theme: 'light',
        size: width < 300 ? 'compact' : 'flexible',
        language: 'vi',
        callback: (token: string) => {
          if (active()) {
            this.token.set(token);
            this.error.set('');
          }
        },
        'expired-callback': () => {
          if (active()) this.token.set('');
        },
        'error-callback': () => {
          if (active()) {
            this.token.set('');
            this.error.set('Chưa thể xác minh. Vui lòng thử lại.');
          }
        },
      });
      this.ready.set(true);
    } catch {
      if (!this.destroy.destroyed && generation === this.generation)
        this.error.set('Không tải được xác minh Cloudflare. Vui lòng thử lại.');
    } finally {
      if (!this.destroy.destroyed && generation === this.generation) this.loading.set(false);
    }
  }
}
