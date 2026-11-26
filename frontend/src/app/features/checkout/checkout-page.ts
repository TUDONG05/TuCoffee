import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { CartService } from '../../core/cart/cart.service';
import { OrderService } from '../../core/order/order.service';
import { OrderResponse } from '../../core/order/order.models';
import { CartItem } from '../../core/cart/cart.models';
import { WalletVoucher, VoucherQuote, VoucherService } from '../../core/vouchers/voucher.service';
import { AuthService } from '../../core/auth/auth.service';
import { VndPipe } from '../../core/catalog/catalog-ui';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  selector: 'app-checkout-page',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    NzButtonModule,
    NzInputModule,
    NzRadioModule,
    NzAlertModule,
    VndPipe,
  ],
  template: `
    <section class="checkout-page" [class.embedded]="embedded()" [attr.aria-labelledby]="fieldId('checkout-title')">
      <header class="checkout-heading">
        @if (embedded()) {
          <h2 [id]="fieldId('checkout-title')">Xác nhận đơn hàng</h2>
        } @else {
          <h1 id="checkout-title">Xác nhận và Đặt hàng</h1>
        }
        @if (!embedded()) {
          <p>Vui lòng cung cấp thông tin nhận hàng và chọn hình thức thanh toán.</p>
        }
      </header>

      @if (cart.isEmpty()) {
        <div class="empty-notice">
          <nz-alert
            nzType="warning"
            nzMessage="Giỏ hàng của bạn đang trống"
            nzDescription="Vui lòng chọn món trước khi đặt hàng."
            nzShowIcon
          />
          <a nz-button nzType="primary" routerLink="/menu" style="margin-top: 1rem;">
            Về thực đơn
          </a>
        </div>
      } @else {
        <div class="checkout-grid">
          <form class="checkout-form" [formGroup]="form" (ngSubmit)="submitOrder()">
            <fieldset class="form-section">
              <legend>Thông tin nhận hàng</legend>

              <div class="form-group">
                <label [attr.for]="fieldId('name')">Họ và tên người nhận <span class="required">*</span></label>
                <input
                  nz-input
                  [id]="fieldId('name')"
                  nzSize="large"
                  formControlName="customerName"
                  placeholder="Nhập họ và tên…"
                />
                @if (
                  form.controls.customerName.invalid &&
                  (form.controls.customerName.dirty || form.controls.customerName.touched)
                ) {
                  <span class="error-msg">Vui lòng nhập họ tên (1–100 ký tự).</span>
                }
              </div>

              <div class="form-group">
                <label [attr.for]="fieldId('phone')">Số điện thoại liên hệ <span class="required">*</span></label>
                <input
                  nz-input
                  [id]="fieldId('phone')"
                  nzSize="large"
                  formControlName="customerPhone"
                  placeholder="Ví dụ: 0912345678"
                />
                @if (
                  form.controls.customerPhone.invalid &&
                  (form.controls.customerPhone.dirty || form.controls.customerPhone.touched)
                ) {
                  <span class="error-msg">Vui lòng nhập số điện thoại liên hệ.</span>
                }
              </div>

              <div class="form-group">
                <label [attr.for]="fieldId('address')">Địa chỉ giao hàng <span class="required">*</span></label>
                <textarea
                  nz-input
                  [id]="fieldId('address')"
                  nzSize="large"
                  rows="3"
                  formControlName="customerAddress"
                  placeholder="Số nhà, tên đường, phường/xã, quận/huyện…"
                ></textarea>
                @if (
                  form.controls.customerAddress.invalid &&
                  (form.controls.customerAddress.dirty || form.controls.customerAddress.touched)
                ) {
                  <span class="error-msg">Vui lòng nhập địa chỉ nhận hàng.</span>
                }
              </div>

              <div class="form-group">
                <label [attr.for]="fieldId('note')">Ghi chú cho quán (tùy chọn)</label>
                <input
                  nz-input
                  [id]="fieldId('note')"
                  nzSize="large"
                  formControlName="note"
                  placeholder="Ví dụ: Ít đường, nhiều đá, giao giờ trưa…"
                />
              </div>
            </fieldset>

            <fieldset class="form-section">
              <legend>Phương thức thanh toán</legend>
              <nz-radio-group formControlName="paymentMethod" class="payment-options">
                <label nz-radio nzValue="QR_TRANSFER" class="payment-radio">
                  <div class="payment-info">
                    <strong>{{ embedded() ? 'Chuyển khoản VietQR' : 'Chuyển khoản VietQR (Tự động xác nhận qua SePay)' }}</strong>
                    <span class="payment-desc">
                      Quét mã VietQR bằng app ngân hàng bất kỳ, SePay tự động khớp giao dịch trong vài giây.
                    </span>
                  </div>
                </label>
                <label nz-radio nzValue="CASH" class="payment-radio">
                  <div class="payment-info">
                    <strong>Tiền mặt khi nhận hàng (COD)</strong>
                    <span class="payment-desc">
                      Thanh toán tiền mặt cho nhân viên giao hàng khi nhận nước.
                    </span>
                  </div>
                </label>
              </nz-radio-group>
            </fieldset>

            <fieldset class="form-section voucher-picker">
              <legend>Voucher</legend>
              @if (wallet().length) {
                <label [attr.for]="fieldId('voucher')">Chọn voucher</label>
                <select [id]="fieldId('voucher')" [value]="selectedVoucher()" [disabled]="submitting() || quoting()"
                  (change)="chooseVoucher(+$any($event.target).value)">
                  <option value="0">Không áp dụng</option>
                  @for (voucher of wallet(); track voucher.id) {
                    <option [value]="voucher.id">{{ voucher.code }} · {{ voucher.title }}</option>
                  }
                </select>
              } @else if (!walletError()) { <p>Bạn chưa có voucher đang áp dụng được.</p> }
              @if (walletError()) { <p>Chưa tải được danh sách voucher.</p> }
              @if (quoting()) { <p role="status">Đang kiểm tra voucher…</p> }
              @if (voucherError()) { <p role="alert">{{ voucherError() }}</p> }
              @if (selectedVoucher() && !activeQuote() && !quoting()) {
                <button nz-button type="button" [disabled]="submitting()" (click)="chooseVoucher(selectedVoucher())">Kiểm tra lại voucher</button>
              }
            </fieldset>
            @if (errorMessage()) {
              <nz-alert nzType="error" [nzMessage]="errorMessage()!" nzShowIcon />
            }
            <a routerLink="/chinh-sach" target="_blank" rel="noopener">Xem chính sách TuCoffee</a>

            <button
              nz-button
              nzType="primary"
              nzSize="large"
              type="submit"
              class="submit-order-btn"
              [nzLoading]="submitting()"
              [disabled]="form.invalid || submitting() || quoting() || (selectedVoucher() > 0 && !activeQuote())"
            >
              {{ embedded() ? 'Xác nhận đặt đơn' : 'Đặt hàng ngay' }} ({{ payable() | vnd }})
            </button>
          </form>

          <aside class="order-review" [attr.aria-labelledby]="fieldId('review-title')">
            <h2 [id]="fieldId('review-title')">Món đã chọn ({{ cart.totalCount() }})</h2>
            <div class="review-items">
              @for (item of cart.items(); track item.productId) {
                <div class="review-item">
                  <div class="item-name-qty">
                    <strong>{{ item.productName }}</strong>
                    <span class="qty">x {{ item.quantity }}</span>
                  </div>
                  <div class="review-item-end">
                    <span class="price">{{ item.unitPriceVnd * item.quantity | vnd }}</span>
                    @if (embedded()) {
                      <button nz-button nzType="text" class="remove-item" type="button"
                        [attr.aria-label]="'Xóa ' + item.productName + ' khỏi đơn'"
                        [disabled]="submitting()" (click)="cart.removeItem(item.productId)">Xóa</button>
                    }
                  </div>
                </div>
              }
            </div>
            <div class="review-divider"></div>
            @if (!embedded() || activeQuote()) {
              <div class="review-row">
                <span>Tạm tính</span>
                <span>{{ cart.totalAmountVnd() | vnd }}</span>
              </div>
            }
            @if (activeQuote(); as quote) {
              <div class="review-row"><span>Giảm voucher</span><strong class="free">−{{ quote.discountVnd | vnd }}</strong></div>
            }
            <div class="review-row">
              <span>Phí vận chuyển</span>
              <span class="free">Miễn phí</span>
            </div>
            <div class="review-divider"></div>
            <div class="review-row total-row">
              <strong>Tổng thanh toán</strong>
              <strong class="total-vnd">{{ payable() | vnd }}</strong>
            </div>
          </aside>
        </div>
      }
    </section>
  `,
  styles: `
    .checkout-page.embedded {
      padding: .5rem 0 0;
      margin: 0;
      .checkout-heading { margin-bottom: .6rem; }
      .checkout-heading h2 { margin: 0; font-size: 1.125rem; color: #302017; }
      .checkout-grid { display: flex; flex-direction: column-reverse; align-items: stretch; gap: .65rem; }
      .order-review, .form-section {
        min-width: 0;
        padding: .75rem;
        border-color: #e8dacc;
        border-radius: .85rem;
        background: #fffdfb;
      }
      .order-review h2, .form-section legend { font-size: .95rem; margin-bottom: .4rem; }
      .review-items { gap: .4rem; max-height: 8rem; }
      .review-divider { margin: .45rem 0; }
      .review-item, .review-row { gap: .75rem; font-size: .85rem; }
      .item-name-qty { overflow-wrap: anywhere; }
      .price, .total-vnd { flex: none; white-space: nowrap; }
      .review-item-end { display: flex; align-items: center; gap: .35rem; }
      .remove-item { color: var(--brand); padding-inline: .35rem; min-height: 32px; }
      .total-row { align-items: baseline; margin-bottom: 0; }
      .total-row .total-vnd { font-size: 1.05rem; }
      .checkout-form { min-width: 0; }
      .form-section, .form-group { margin-bottom: .55rem; }
      .form-group:last-child { margin-bottom: 0; }
      .form-group label { font-size: .8rem; margin-bottom: .2rem; }
      .payment-options { gap: .35rem; }
      .payment-radio { padding: .45rem .55rem; }
      .payment-info strong { font-size: .85rem; }
      .payment-info .payment-desc { display: none; }
      .submit-order-btn {
        margin-top: .2rem;
        font-size: .95rem;
        color: #fff;
        &:disabled {
          color: #fff;
          background: #74655b;
          border-color: #74655b;
        }
      }
    }
    .checkout-page {
      max-width: 1100px;
      margin: 0 auto;
      padding: 2rem 1.5rem 4rem;
    }
    .voucher-picker select { display: block; width: 100%; margin: .35rem 0; padding: .45rem; border: 1px solid #d8cbc1; }
    .voucher-picker p { margin: .35rem 0; }
    .checkout-heading {
      margin-bottom: 2rem;
      h1 {
        font-size: 2rem;
        font-weight: 700;
        margin-bottom: 0.25rem;
      }
      p {
        color: #666;
        margin: 0;
      }
    }
    .checkout-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 360px;
      gap: 2.5rem;
      align-items: start;
      @media (max-width: 900px) {
        grid-template-columns: 1fr;
      }
    }
    .form-section {
      border: 1px solid #eee;
      border-radius: 8px;
      padding: 1.5rem;
      background: #fff;
      margin-bottom: 1.5rem;
      legend {
        font-size: 1.15rem;
        font-weight: 700;
        padding: 0 0.5rem;
        color: #333;
      }
    }
    .form-group {
      margin-bottom: 1.25rem;
      label {
        display: block;
        font-weight: 600;
        font-size: 0.9rem;
        margin-bottom: 0.35rem;
        color: #333;
      }
      .required {
        color: #ff4d4f;
      }
      .error-msg {
        display: block;
        color: #ff4d4f;
        font-size: 0.8rem;
        margin-top: 0.25rem;
      }
    }
    .payment-options {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      width: 100%;
    }
    .payment-radio {
      display: flex !important;
      align-items: flex-start;
      padding: 1rem;
      border: 1px solid #eee;
      border-radius: 6px;
      background: #fafafa;
      margin: 0 !important;
      transition: all 0.2s;
      &.ant-radio-wrapper-checked {
        border-color: #8c532b;
        background: #fdfaf7;
      }
    }
    .payment-info {
      margin-left: 0.5rem;
      strong {
        display: block;
        font-size: 1rem;
        color: #222;
      }
      .payment-desc {
        display: block;
        font-size: 0.85rem;
        color: #666;
        margin-top: 0.15rem;
      }
    }
    .submit-order-btn {
      width: 100%;
      height: 48px;
      font-size: 1.1rem;
      font-weight: 600;
      background: #8c532b;
      border-color: #8c532b;
      margin-top: 1rem;
      &:hover {
        background: #6e3e1d;
        border-color: #6e3e1d;
      }
    }
    .order-review {
      background: #fafafa;
      border: 1px solid #eee;
      border-radius: 8px;
      padding: 1.5rem;
      h2 {
        font-size: 1.2rem;
        font-weight: 700;
        margin-bottom: 1rem;
      }
    }
    .review-items {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      max-height: 350px;
      overflow-y: auto;
    }
    .review-item {
      display: flex;
      justify-content: space-between;
      font-size: 0.95rem;
      .item-name-qty {
        display: flex;
        flex-direction: column;
        .qty {
          font-size: 0.8rem;
          color: #777;
        }
      }
      .price {
        font-weight: 600;
      }
    }
    .review-divider {
      height: 1px;
      background: #e8e8e8;
      margin: 1rem 0;
    }
    .review-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 0.5rem;
      font-size: 0.95rem;
      .free {
        color: #389e0d;
        font-weight: 600;
      }
    }
    .total-row {
      font-size: 1.15rem;
      color: #111;
      .total-vnd {
        color: #8c532b;
        font-size: 1.35rem;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutPage {
  readonly embedded = input(false);
  readonly orderPlaced = output<OrderResponse>();
  readonly cart = inject(CartService);
  private readonly orderService = inject(OrderService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly voucherService = inject(VoucherService);
  readonly wallet = signal<WalletVoucher[]>([]);
  readonly walletError = signal(false);
  readonly selectedVoucher = signal(0);
  readonly quoting = signal(false);
  readonly voucherError = signal('');
  private readonly quote = signal<{ value: VoucherQuote; items: CartItem[] } | null>(null);
  readonly activeQuote = computed(() => {
    const quote = this.quote();
    return quote?.items === this.cart.items() ? quote.value : null;
  });
  readonly payable = computed(() => this.activeQuote()?.totalVnd ?? this.cart.totalAmountVnd());

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  private idempotencyKey = crypto.randomUUID();
  private lastRequest?: string;

  constructor() {
    this.voucherService.wallet().subscribe({
      next: items => {
        const now = Date.now();
        this.wallet.set(items.filter(item => item.enabled && item.remaining > 0
          && Date.parse(item.startsAt) <= now && Date.parse(item.endsAt) > now));
      },
      error: () => this.walletError.set(true),
    });
  }

  chooseVoucher(id: number): void {
    if (this.quoting() || this.submitting()) return;
    this.selectedVoucher.set(id);
    this.quote.set(null);
    this.voucherError.set('');
    if (!id || this.cart.isEmpty()) return;
    const items = this.cart.items();
    this.quoting.set(true);
    this.voucherService.quote(id, this.orderItems(items)).subscribe({
      next: value => {
        this.quote.set({ value, items });
        this.quoting.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.quoting.set(false);
        this.voucherError.set(err.error?.detail ?? 'Không áp dụng được voucher. Vui lòng thử lại.');
      },
    });
  }

  private orderItems(items: CartItem[]) {
    return items.map(item => ({ productId: item.productId, quantity: item.quantity, expectedPriceVnd: item.unitPriceVnd }));
  }

  fieldId(name: string): string {
    return this.embedded() ? `chat-checkout-${name}` : name;
  }

  readonly form = this.fb.group({
    customerName: [this.auth.user()?.name || '', [Validators.required, Validators.maxLength(100)]],
    customerPhone: [
      this.auth.user()?.phone || '',
      [Validators.required, Validators.maxLength(20)],
    ],
    customerAddress: [
      this.auth.user()?.address || '',
      [Validators.required, Validators.maxLength(300)],
    ],
    note: ['', [Validators.maxLength(1000)]],
    paymentMethod: ['QR_TRANSFER' as 'CASH' | 'QR_TRANSFER' | 'VNPAY', [Validators.required]],
  });

  submitOrder(): void {
    const quote = this.activeQuote();
    if (this.form.invalid || this.cart.isEmpty() || this.submitting() || this.quoting()
      || (this.selectedVoucher() && !quote)) return;

    const buyerId = this.auth.user()?.id;
    if (buyerId == null) return;
    this.submitting.set(true);
    this.errorMessage.set(null);

    const val = this.form.getRawValue();
    const cartItems = this.cart.items();
    const req = {
      items: this.orderItems(cartItems),
      customerName: val.customerName!.trim(),
      customerPhone: val.customerPhone!.trim(),
      customerAddress: val.customerAddress!.trim(),
      note: val.note?.trim() || null,
      paymentMethod: val.paymentMethod!,
      ...(quote ? { voucherId: quote.voucherId, expectedTotalVnd: quote.totalVnd } : {}),
    };

    const request = JSON.stringify(req);
    if (this.lastRequest !== undefined && this.lastRequest !== request) {
      this.idempotencyKey = crypto.randomUUID();
    }
    this.lastRequest = request;
    this.orderService.createOrder(req, this.idempotencyKey).subscribe({
      next: (order) => {
        this.submitting.set(false);
        if (this.auth.user()?.id !== buyerId) return;
        if (this.cart.items() === cartItems) this.cart.clear();
        if (this.embedded()) this.orderPlaced.emit(order);
        else this.router.navigate(['/orders', order.id]);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        if (err.status === 409) {
          if (quote && /^(VOUCHER_|PRICE_CHANGED)/.test(err.error?.code ?? '')) this.quote.set(null);
          // If price changed or idempotency conflict, refresh key
          this.idempotencyKey = crypto.randomUUID();
          this.errorMessage.set(
            err.error?.detail ||
              'Giá sản phẩm đã có sự thay đổi. Vui lòng kiểm tra lại đơn hàng.'
          );
        } else {
          this.errorMessage.set(
            err.error?.detail || 'Không thể tạo đơn hàng. Vui lòng thử lại sau.'
          );
        }
      },
    });
  }
}
