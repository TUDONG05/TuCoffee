import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import { VndPipe } from '../../core/catalog/catalog-ui';
import { VoucherService } from '../../core/vouchers/voucher.service';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  imports: [DatePipe, VndPipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="promotion-page">
      <h1>Khuyến mại TuCoffee</h1>
      @if (feedback()) { <p role="status">{{ feedback() }}</p> }
      @if (view(); as state) {
        @if (!state.ok) { <p role="alert">Chưa tải được chương trình khuyến mại.</p> }
        @else {
          <div class="promotion-grid">
            @for (promo of state.items; track promo.id) {
              <article>
                <span class="saving">{{ promo.kind === 'PERCENT' ? promo.amount + '%' : (promo.amount | vnd) }}</span>
                <h2>{{ promo.title }}</h2>
                <p class="description">{{ promo.description }}</p>
                <p>Đơn từ {{ promo.minSubtotal | vnd }}
                  @if (promo.maxDiscount !== null) { · Giảm tối đa {{ promo.maxDiscount | vnd }} }
                </p>
                <small>Đến {{ promo.endsAt | date:'dd/MM/yyyy HH:mm' }}</small>
                @if (promo.selfClaim) {
                  <div class="claim">
                    @if (auth.user(); as user) {
                      @if (user.role !== 'ADMIN') {
                        <button type="button" [disabled]="pending() !== null || claimed().has(promo.id)" (click)="claim(promo.id)">
                          {{ claimed().has(promo.id) ? 'Đã nhận' : pending() === promo.id ? 'Đang nhận…' : 'Nhận voucher' }}
                        </button>
                      }
                    } @else {
                      <a routerLink="/login" [queryParams]="{ returnUrl: '/khuyen-mai' }">Đăng nhập để nhận</a>
                    }
                  </div>
                } @else {
                  <p><small>Đã cấp cho bạn</small></p>
                }
              </article>
            } @empty { <p>Hiện chưa có voucher khả dụng.</p> }
          </div>
        }
      } @else { <p role="status">Đang tải khuyến mại…</p> }
    </section>
  `,
  styles: `
    .promotion-page { max-width: 70rem; margin: auto; padding: 2rem 1rem 3rem; }
    h1 { font-size: clamp(1.8rem, 4vw, 3rem); margin: 0 0 1rem; }
    .promotion-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr)); gap: 1rem; }
    article { padding: 1.2rem; border: 1px solid #e8dacc; background: #fffdfb; }
    h2 { font-size: 1.2rem; margin: .7rem 0 .35rem; }
    .saving { font-size: 1.15rem; font-weight: 700; color: var(--brand); }
    .description { white-space: pre-wrap; overflow-wrap: anywhere; }
    .claim { margin-top: .8rem; }
  `,
})
export class PromotionsPage {
  private readonly api = inject(VoucherService);
  readonly auth = inject(AuthService);
  readonly claimed = signal(new Set<number>());
  readonly pending = signal<number | null>(null);
  readonly feedback = signal('');
  readonly view = toSignal(toObservable(this.auth.user).pipe(
    map(user => user?.id ?? null),
    distinctUntilChanged(),
    switchMap(id => this.api.promotions(id !== null).pipe(
      map(items => ({ ok: true, items })),
      catchError(() => of({ ok: false, items: [] })),
      startWith(undefined),
    )),
  ));

  constructor() {
    effect(onCleanup => {
      const user = this.auth.user();
      this.claimed.set(new Set());
      this.feedback.set('');
      if (!user || user.role === 'ADMIN') return;
      const request = this.api.wallet().subscribe({
        next: items => this.claimed.update(ids => new Set([...ids, ...items.map(item => item.id)])),
        error: () => {},
      });
      onCleanup(() => request.unsubscribe());
    });
  }

  claim(id: number): void {
    const user = this.auth.user();
    if (!user || user.role === 'ADMIN' || this.pending() !== null || this.claimed().has(id)) return;
    this.pending.set(id);
    this.feedback.set('');
    this.api.claim(id).subscribe({
      next: () => {
        this.pending.set(null);
        if (this.auth.user()?.id !== user.id) return;
        this.claimed.update(ids => new Set(ids).add(id));
        this.feedback.set('Đã thêm vào Voucher của tôi.');
      },
      error: (error: HttpErrorResponse) => {
        this.pending.set(null);
        if (this.auth.user()?.id === user.id) {
          this.feedback.set(error.error?.detail ?? 'Chưa nhận được voucher. Vui lòng thử lại.');
        }
      },
    });
  }
}

@Component({
  imports: [DatePipe, VndPipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="wallet">
      <h1>Voucher của tôi</h1>
      <p>Chọn voucher khi thanh toán. Mỗi đơn áp dụng tối đa một voucher.</p>
      @if (view(); as state) {
        @if (!state.ok) { <p role="alert">Chưa tải được voucher.</p> }
        @else {
          @for (voucher of state.items; track voucher.id) {
            <article>
              <h2>{{ voucher.title }}</h2>
              <p><strong>{{ voucher.code }}</strong> · Giảm {{ voucher.kind === 'PERCENT' ? voucher.amount + '%' : (voucher.amount | vnd) }}</p>
              <p>Đơn từ {{ voucher.minSubtotal | vnd }}
                @if (voucher.maxDiscount !== null) { · Giảm tối đa {{ voucher.maxDiscount | vnd }} }
              </p>
              <p>{{ voucher.startsAt | date:'dd/MM/yyyy HH:mm' }} – {{ voucher.endsAt | date:'dd/MM/yyyy HH:mm' }}</p>
              <p>{{ !voucher.enabled ? 'Đã ngừng áp dụng' : voucher.remaining ? 'Còn ' + voucher.remaining + ' lượt' : 'Hết lượt' }}</p>
            </article>
          } @empty { <p>Bạn chưa được cấp voucher.</p> }
        }
      } @else { <p role="status">Đang tải voucher…</p> }
      <a routerLink="/menu">Xem thực đơn</a>
    </section>
  `,
  styles: `
    .wallet { max-width: 52rem; margin: auto; padding: 2rem 1rem 3rem; }
    h1 { font-size: 2rem; }
    article { margin-block: 1rem; padding: 1rem; border: 1px solid #e8dacc; background: #fffdfb; }
    h2 { font-size: 1.15rem; }
    article p { margin-bottom: .25rem; }
  `,
})
export class VoucherWalletPage {
  readonly view = toSignal(inject(VoucherService).wallet().pipe(
    map(items => ({ ok: true, items })),
    catchError(() => of({ ok: false, items: [] })),
  ));
}
