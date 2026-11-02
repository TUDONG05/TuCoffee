import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { TimeoutError, firstValueFrom, timeout } from 'rxjs';
import { AuthResponse, ProfileInput, User } from './auth.models';

/** Cookies stay in the browser; the access token only lives in this service. */
@Injectable({ providedIn: 'root' })
export class AuthService implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly currentUser = signal<User | null>(null);
  private readonly accessToken = signal<string | null>(null);
  private expiresAt = 0;
  private epoch = 0;
  private initialized = false;
  private initialization?: Promise<void>;
  private refreshFlight?: Promise<string>;
  private localQueue: Promise<unknown> = Promise.resolve();
  private readonly channel =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('tucoffee-session') : null;
  readonly user = this.currentUser.asReadonly();
  readonly isAdmin = computed(() => this.user()?.role === 'ADMIN');
  readonly ready = signal(false);
  readonly notice = signal('');

  constructor() {
    if (this.channel)
      this.channel.onmessage = ({ data }) => {
        if (data === 'logout' || data === 'password' || data === 'login') {
          this.clear();
          this.notice.set(
            data === 'login'
              ? 'Phiên đăng nhập đã thay đổi ở tab khác. Đăng nhập lại để tiếp tục.'
              : 'Phiên đã kết thúc hoặc thay đổi ở tab khác. Vui lòng đăng nhập lại.',
          );
        }
      };
  }

  token(): string | null {
    return this.accessToken();
  }
  ngOnDestroy(): void {
    this.channel?.close();
  }

  initialize(): Promise<void> {
    if (this.initialization) return this.initialization;
    this.initialization = (async () => {
      try {
        await this.refresh();
      } catch {
        /* An anonymous visitor and an unavailable backend must not block the app. */
      } finally {
        this.initialized = true;
        this.ready.set(true);
      }
    })();
    return this.initialization;
  }

  async csrf(): Promise<void> {
    await firstValueFrom(this.http.get('/api/v1/auth/csrf').pipe(timeout(8000)));
  }

  async register(
    input: { name: string; email: string; password: string },
    turnstileToken?: string,
  ): Promise<User> {
    return this.lock(async () => {
      await this.csrf();
      return firstValueFrom(
        this.http
          .post<User>(
            '/api/v1/auth/register',
            input,
            turnstileToken ? { headers: { 'X-Turnstile-Token': turnstileToken } } : {},
          )
          .pipe(timeout(12000)),
      );
    });
  }

  async login(input: { email: string; password: string }, turnstileToken?: string): Promise<void> {
    return this.signIn('/api/v1/auth/login', input, turnstileToken);
  }

  async googleLogin(credential: string, currentPassword?: string): Promise<void> {
    return this.signIn('/api/v1/auth/google', {
      credential,
      ...(currentPassword ? { currentPassword } : {}),
    });
  }

  private async signIn(
    url: string,
    input: Record<string, string>,
    turnstileToken?: string,
  ): Promise<void> {
    const generation = ++this.epoch;
    await this.lock(async () => {
      await this.csrf();
      const result = await firstValueFrom(
        this.http
          .post<AuthResponse>(
            url,
            input,
            turnstileToken ? { headers: { 'X-Turnstile-Token': turnstileToken } } : {},
          )
          .pipe(timeout(12000)),
      );
      if (generation !== this.epoch) throw new Error('Session changed');
      this.accept(result);
      this.channel?.postMessage('login');
      try {
        await this.csrf();
      } catch {
        this.notice.set('Đã đăng nhập. Nếu thao tác tiếp theo thất bại, hãy tải lại trang.');
      }
    });
  }

  refresh(): Promise<string> {
    if (this.refreshFlight) return this.refreshFlight;
    const generation = this.epoch;
    const flight = this.lock(async () => {
      if (generation !== this.epoch) throw new Error('Session changed');
      await this.csrf();
      // Never retry this call: a network error may mean the cookie already rotated.
      const response = await firstValueFrom(
        this.http.post<AuthResponse>('/api/v1/auth/refresh', {}).pipe(timeout(10000)),
      );
      if (generation !== this.epoch) throw new Error('Session changed');
      this.accept(response);
      return response.accessToken;
    }).catch((error: unknown) => {
      if (generation === this.epoch) {
        this.clear();
        if (this.initialized)
          this.notice.set('Phiên không còn khả dụng. Vui lòng đăng nhập lại để tiếp tục.');
      }
      throw error;
    });
    this.refreshFlight = flight;
    void flight
      .finally(() => {
        if (this.refreshFlight === flight) this.refreshFlight = undefined;
      })
      .catch(() => {});
    return flight;
  }

  async logout(): Promise<void> {
    const token = this.token();
    this.clear(); // Invalidate pending work immediately, before waiting for the shared lock.
    this.channel?.postMessage('logout');
    try {
      await this.lock(async () => {
        await this.csrf();
        const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
        await firstValueFrom(
          this.http.post('/api/v1/auth/logout', {}, { headers }).pipe(timeout(10000)),
        );
        await this.csrf();
      });
      this.notice.set('Bạn đã đăng xuất. Hẹn gặp lại!');
    } catch (error) {
      this.notice.set(
        'Đã xóa phiên trên trang này, nhưng chưa xác nhận đăng xuất với máy chủ. Vui lòng thử đăng xuất lại khi có kết nối.',
      );
      throw error;
    }
  }

  async updateProfile(input: ProfileInput): Promise<void> {
    const generation = this.epoch;
    const result = await firstValueFrom(
      this.http.patch<User>('/api/v1/users/me', input).pipe(timeout(12000)),
    );
    if (generation === this.epoch && this.token()) this.currentUser.set(result);
  }

  async changePassword(input: { currentPassword: string; newPassword: string }): Promise<void> {
    // Refresh before entering the rotation lock; never recursively acquire the same lock.
    if (Date.now() >= this.expiresAt) await this.refresh();
    const generation = this.epoch;
    await this.lock(async () => {
      if (generation !== this.epoch) throw new Error('Session changed');
      await this.csrf();
      let response: AuthResponse;
      try {
        response = await firstValueFrom(
          this.http.put<AuthResponse>('/api/v1/users/me/password', input).pipe(timeout(12000)),
        );
      } catch (error) {
        if (
          error instanceof TimeoutError ||
          (error instanceof HttpErrorResponse && error.status === 0)
        ) {
          this.endSession();
          this.channel?.postMessage('password');
        }
        throw error;
      }
      if (generation !== this.epoch) throw new Error('Session changed');
      this.accept(response);
      this.channel?.postMessage('password');
      try {
        await this.csrf();
      } catch {
        this.notice.set('Mật khẩu đã đổi. Tải lại trang trước thao tác tiếp theo.');
      }
    });
  }

  endSession(): void {
    this.clear();
    this.notice.set('Phiên đã hết hạn hoặc tài khoản không còn khả dụng. Vui lòng đăng nhập lại.');
  }

  private accept(response: AuthResponse): void {
    this.currentUser.set(response.user);
    this.accessToken.set(response.accessToken);
    this.expiresAt = Date.now() + response.expiresIn * 1000;
    this.notice.set('');
  }

  private clear(): void {
    ++this.epoch;
    this.currentUser.set(null);
    this.accessToken.set(null);
    this.expiresAt = 0;
  }

  private lock<T>(work: () => Promise<T>): Promise<T> {
    if (typeof navigator !== 'undefined' && navigator.locks)
      return navigator.locks.request('tucoffee-session', work);
    const next = this.localQueue.then(work, work);
    this.localQueue = next.catch(() => {});
    return next;
  }
}
