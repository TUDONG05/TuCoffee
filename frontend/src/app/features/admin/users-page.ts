import { HttpClient, HttpParams } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription, firstValueFrom, timeout } from 'rxjs';
import { apiError } from '../../core/auth/api-error';
import { AuthService } from '../../core/auth/auth.service';
import { User, UserPage } from '../../core/auth/auth.models';

@Component({
  selector: 'app-users-page', imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './users-page.html', styleUrl: './users-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersPage {
  private readonly http = inject(HttpClient);
  private readonly destroy = inject(DestroyRef);
  readonly auth = inject(AuthService);
  readonly filters = inject(FormBuilder).nonNullable.group({ q: '', active: '' });
  readonly result = signal<UserPage | null>(null);
  readonly busy = signal(false);
  readonly changing = signal<number | null>(null);
  readonly error = signal('');
  readonly message = signal('');
  readonly pendingUser = signal<User | null>(null);
  private request?: Subscription;

  constructor() { this.load(); }

  load(page = 0): void {
    this.request?.unsubscribe();
    this.busy.set(true); this.error.set('');
    const { q, active } = this.filters.getRawValue();
    let params = new HttpParams().set('page', page).set('size', 12);
    if (q.trim()) params = params.set('q', q.trim());
    if (active) params = params.set('active', active);
    this.request = this.http.get<UserPage>('/api/v1/admin/users', { params }).pipe(timeout(12000), takeUntilDestroyed(this.destroy)).subscribe({
      next: (value) => { this.result.set(value); this.busy.set(false); },
      error: (error: unknown) => { this.error.set(apiError(error)); this.busy.set(false); },
    });
  }

  async toggle(): Promise<void> {
    const user = this.pendingUser();
    if (!user || this.changing() !== null) return;
    this.changing.set(user.id); this.error.set(''); this.message.set('');
    try {
      await firstValueFrom(this.http.patch<User>(`/api/v1/admin/users/${user.id}/active`, { active: !user.active }).pipe(timeout(12000), takeUntilDestroyed(this.destroy)));
      if (!this.destroy.destroyed) {
        this.message.set(user.active ? `Đã khóa tài khoản ${user.email}. Các phiên đăng nhập đã kết thúc.` : `Đã mở tài khoản ${user.email}.`);
        this.pendingUser.set(null);
        this.load(this.result()?.page ?? 0);
      }
    } catch (error) { if (!this.destroy.destroyed) this.error.set(apiError(error)); }
    finally { if (!this.destroy.destroyed) this.changing.set(null); }
  }
}
