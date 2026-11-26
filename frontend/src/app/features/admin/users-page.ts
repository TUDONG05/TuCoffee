import { HttpClient, HttpParams } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  EMPTY,
  Subject,
  catchError,
  debounceTime,
  defer,
  exhaustMap,
  filter,
  finalize,
  map,
  merge,
  switchMap,
  tap,
  timeout,
} from 'rxjs';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzPaginationModule } from 'ng-zorro-antd/pagination';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { apiError } from '../../core/auth/api-error';
import { AuthService } from '../../core/auth/auth.service';
import { User, UserPage } from '../../core/auth/auth.models';

interface UsersQuery {
  q: string;
  active: string;
  page: number;
}

@Component({
  selector: 'app-users-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NzAlertModule,
    NzButtonModule,
    NzFormModule,
    NzInputModule,
    NzPaginationModule,
    NzSelectModule,
    NzTableModule,
    NzTagModule,
  ],
  templateUrl: './users-page.html',
  styleUrl: './users-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersPage {
  private readonly http = inject(HttpClient);
  private readonly destroy = inject(DestroyRef);
  readonly auth = inject(AuthService);
  readonly pageSize = 10;
  readonly filters = inject(FormBuilder).nonNullable.group({ q: '', active: '' });
  readonly result = signal<UserPage | null>(null);
  readonly busy = signal(false);
  readonly changing = signal<number | null>(null);
  readonly error = signal('');
  readonly message = signal('');
  readonly pendingUser = signal<User | null>(null);
  private readonly queries = new Subject<UsersQuery>();
  private readonly changes = new Subject<User>();
  private currentQuery: UsersQuery = { q: '', active: '', page: 0 };

  constructor() {
    const filterChanges = this.filters.valueChanges.pipe(
      debounceTime(300),
      map(() => this.query(0)),
      // Compare with the latest request, including manual searches and pagination.
      filter(
        (query) => query.q !== this.currentQuery.q || query.active !== this.currentQuery.active,
      ),
    );
    merge(this.queries, filterChanges)
      .pipe(
        switchMap((query) =>
          defer(() => {
            this.currentQuery = query;
            this.busy.set(true);
            this.error.set('');
            this.result.set(null);
            this.pendingUser.set(null);
            let params = new HttpParams().set('page', query.page).set('size', this.pageSize);
            if (query.q) params = params.set('q', query.q);
            if (query.active) params = params.set('active', query.active);
            return this.http.get<UserPage>('/api/v1/admin/users', { params }).pipe(
              timeout(12000),
              tap((value) => this.result.set(value)),
              catchError((error: unknown) => {
                this.error.set(apiError(error));
                return EMPTY;
              }),
              finalize(() => this.busy.set(false)),
            );
          }),
        ),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe();

    this.changes
      .pipe(
        exhaustMap((user) =>
          defer(() => {
            this.changing.set(user.id);
            this.error.set('');
            this.message.set('');
            return this.http
              .patch<User>(`/api/v1/admin/users/${user.id}/active`, { active: !user.active })
              .pipe(
                timeout(12000),
                tap(() => {
                  this.message.set(
                    user.active
                      ? `Đã khóa tài khoản ${user.email}. Các phiên đăng nhập đã kết thúc.`
                      : `Đã mở tài khoản ${user.email}.`,
                  );
                  this.pendingUser.set(null);
                  this.load(this.currentQuery.page);
                }),
                catchError((error: unknown) => {
                  this.error.set(apiError(error));
                  return EMPTY;
                }),
                finalize(() => this.changing.set(null)),
              );
          }),
        ),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe();
    this.load();
  }

  load(page = 0): void {
    this.queries.next(this.query(page));
  }

  toggle(): void {
    const user = this.pendingUser();
    if (!user || this.changing() !== null) return;
    this.changes.next(user);
  }

  private query(page: number): UsersQuery {
    const { q, active } = this.filters.getRawValue();
    const normalized = q.trim();
    const filtersChanged =
      normalized !== this.currentQuery.q || active !== this.currentQuery.active;
    return { q: normalized, active, page: filtersChanged ? 0 : page };
  }
}
