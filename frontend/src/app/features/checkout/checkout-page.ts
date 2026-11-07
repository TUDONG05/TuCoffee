import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { CartService } from '../../core/cart/cart.service';
import { OrderService } from '../../core/order/order.service';
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
    <section class="checkout-page" aria-labelledby="checkout-title">
      <header class="checkout-heading">
        <h1 id="checkout-title">Xác nhận và Đặt hàng</h1>
        <p>Vui lòng cung cấp thông tin nhận hàng và chọn hình thức thanh toán.</p>
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
                <label for="name">Họ và tên người nhận <span class="required">*</span></label>
                <input
                  nz-input
                  id="name"
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
                <label for="phone">Số điện thoại liên hệ <span class="required">*</span></label>
                <input
                  nz-input
                  id="phone"
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
                <label for="address">Địa chỉ giao hàng <span class="required">*</span></label>
                <textarea
                  nz-input
                  id="address"
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
                <label for="note">Ghi chú cho quán (tùy chọn)</label>
                <input
                  nz-input
                  id="note"
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
                    <strong>Chuyển khoản VietQR (Khuyên dùng)</strong>
                    <span class="payment-desc">
                      Quét mã QR qua ứng dụng ngân hàng, xác nhận nhanh chóng.
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

            @if (errorMessage()) {
              <nz-alert nzType="error" [nzMessage]="errorMessage()!" nzShowIcon />
            }

            <button
              nz-button
              nzType="primary"
              nzSize="large"
              type="submit"
              class="submit-order-btn"
              [nzLoading]="submitting()"
              [disabled]="form.invalid || submitting()"
            >
              Đặt hàng ngay ({{ cart.totalAmountVnd() | vnd }})
            </button>
          </form>

          <aside class="order-review" aria-labelledby="review-title">
            <h2 id="review-title">Món đã chọn ({{ cart.totalCount() }})</h2>
            <div class="review-items">
              @for (item of cart.items(); track item.productId) {
                <div class="review-item">
                  <div class="item-name-qty">
                    <strong>{{ item.productName }}</strong>
                    <span class="qty">x {{ item.quantity }}</span>
                  </div>
                  <span class="price">{{ item.unitPriceVnd * item.quantity | vnd }}</span>
                </div>
              }
            </div>
            <div class="review-divider"></div>
            <div class="review-row">
              <span>Tạm tính</span>
              <span>{{ cart.totalAmountVnd() | vnd }}</span>
            </div>
            <div class="review-row">
              <span>Phí vận chuyển</span>
              <span class="free">Miễn phí</span>
            </div>
            <div class="review-divider"></div>
            <div class="review-row total-row">
              <strong>Tổng thanh toán</strong>
              <strong class="total-vnd">{{ cart.totalAmountVnd() | vnd }}</strong>
            </div>
          </aside>
        </div>
      }
    </section>
  `,
  styles: `
    .checkout-page {
      max-width: 1100px;
      margin: 0 auto;
      padding: 2rem 1.5rem 4rem;
    }
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
  readonly cart = inject(CartService);
  private readonly orderService = inject(OrderService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  private idempotencyKey = crypto.randomUUID();

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
    paymentMethod: ['QR_TRANSFER' as 'CASH' | 'QR_TRANSFER', [Validators.required]],
  });

  submitOrder(): void {
    if (this.form.invalid || this.cart.isEmpty() || this.submitting()) return;

    this.submitting.set(true);
    this.errorMessage.set(null);

    const val = this.form.getRawValue();
    const req = {
      items: this.cart.items().map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        expectedPriceVnd: item.unitPriceVnd,
      })),
      customerName: val.customerName!.trim(),
      customerPhone: val.customerPhone!.trim(),
      customerAddress: val.customerAddress!.trim(),
      note: val.note?.trim() || null,
      paymentMethod: val.paymentMethod!,
    };

    this.orderService.createOrder(req, this.idempotencyKey).subscribe({
      next: (order) => {
        this.cart.clear();
        this.submitting.set(false);
        this.router.navigate(['/orders', order.id]);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        if (err.status === 409) {
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
