import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { CartService } from '../../core/cart/cart.service';
import { ProductImage, VndPipe } from '../../core/catalog/catalog-ui';

@Component({
  selector: 'app-cart-page',
  imports: [RouterLink, NzButtonModule, NzAlertModule, ProductImage, VndPipe],
  template: `
    <section class="cart-page" aria-labelledby="cart-title">
      <header class="cart-heading">
        <h1 id="cart-title">Giỏ hàng của bạn</h1>
        <p>Kiểm tra danh sách món trước khi tiến hành đặt hàng.</p>
      </header>

      @if (cart.isEmpty()) {
        <div class="empty-cart" role="region" aria-label="Giỏ hàng trống">
          <div class="empty-icon" aria-hidden="true">🛒</div>
          <h2>Giỏ hàng của bạn đang trống</h2>
          <p>Hãy chọn những món cà phê thơm ngon từ thực đơn của Tu’s Coffee nhé.</p>
          <a nz-button nzType="primary" nzSize="large" routerLink="/menu">Khám phá thực đơn</a>
        </div>
      } @else {
        <div class="cart-layout">
          <div class="cart-items" role="list" aria-label="Danh sách món trong giỏ">
            @for (item of cart.items(); track item.productId) {
              <div class="cart-item-card" role="listitem">
                <div class="item-img">
                  <app-product-image [src]="item.imageUrl || null" [alt]="item.productName" />
                </div>
                <div class="item-details">
                  @if (item.categoryName) {
                    <span class="item-cat">{{ item.categoryName }}</span>
                  }
                  <h2 class="item-name">{{ item.productName }}</h2>
                  <p class="item-price">{{ item.unitPriceVnd | vnd }}</p>
                </div>
                <div class="item-actions">
                  <div class="quantity-stepper" aria-label="Điều chỉnh số lượng">
                    <button
                      nz-button
                      nzSize="small"
                      type="button"
                      aria-label="Giảm 1"
                      [disabled]="item.quantity <= 1"
                      (click)="cart.updateQuantity(item.productId, item.quantity - 1)"
                    >
                      –
                    </button>
                    <span class="qty-display" aria-live="polite">{{ item.quantity }}</span>
                    <button
                      nz-button
                      nzSize="small"
                      type="button"
                      aria-label="Tăng 1"
                      [disabled]="item.quantity >= 99"
                      (click)="cart.updateQuantity(item.productId, item.quantity + 1)"
                    >
                      +
                    </button>
                  </div>
                  <span class="item-subtotal">
                    {{ item.unitPriceVnd * item.quantity | vnd }}
                  </span>
                  <button
                    nz-button
                    nzType="text"
                    nzDanger
                    nzSize="small"
                    type="button"
                    class="remove-btn"
                    aria-label="Xóa món khỏi giỏ"
                    (click)="cart.removeItem(item.productId)"
                  >
                    Xóa
                  </button>
                </div>
              </div>
            }
          </div>

          <aside class="cart-summary" aria-labelledby="summary-title">
            <h2 id="summary-title">Tóm tắt đơn hàng</h2>
            <div class="summary-row">
              <span>Số lượng món</span>
              <span>{{ cart.totalCount() }} món</span>
            </div>
            <div class="summary-row">
              <span>Tạm tính</span>
              <span>{{ cart.totalAmountVnd() | vnd }}</span>
            </div>
            <div class="summary-row">
              <span>Phí vận chuyển</span>
              <span class="free-shipping">Miễn phí</span>
            </div>
            <div class="summary-divider"></div>
            <div class="summary-row total-row">
              <strong>Tổng thanh toán</strong>
              <strong class="total-amount">{{ cart.totalAmountVnd() | vnd }}</strong>
            </div>

            <a nz-button nzType="primary" nzSize="large" class="checkout-btn" routerLink="/checkout">
              Tiến hành đặt hàng
            </a>

            <a nz-button nzType="link" class="continue-btn" routerLink="/menu">
              ← Tiếp tục chọn món
            </a>
          </aside>
        </div>
      }
    </section>
  `,
  styles: `
    .cart-page {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem 1.5rem 4rem;
    }
    .cart-heading {
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
    .empty-cart {
      text-align: center;
      padding: 4rem 1rem;
      background: #fafafa;
      border-radius: 12px;
      border: 1px dashed #d9d9d9;
      .empty-icon {
        font-size: 3.5rem;
        margin-bottom: 1rem;
      }
      h2 {
        font-size: 1.4rem;
        margin-bottom: 0.5rem;
      }
      p {
        color: #777;
        margin-bottom: 1.5rem;
      }
    }
    .cart-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 380px;
      gap: 2.5rem;
      align-items: start;
      @media (max-width: 900px) {
        grid-template-columns: 1fr;
      }
    }
    .cart-items {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .cart-item-card {
      display: flex;
      gap: 1.25rem;
      align-items: center;
      padding: 1.25rem;
      background: #fff;
      border: 1px solid #eee;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.02);
      @media (max-width: 600px) {
        flex-wrap: wrap;
      }
    }
    .item-img {
      width: 80px;
      height: 80px;
      flex-shrink: 0;
      border-radius: 6px;
      overflow: hidden;
      background: #f5f5f5;
    }
    .item-details {
      flex: 1;
      min-width: 150px;
      .item-cat {
        font-size: 0.75rem;
        text-transform: uppercase;
        color: #999;
        font-weight: 600;
      }
      .item-name {
        font-size: 1.05rem;
        font-weight: 600;
        margin: 0.15rem 0 0.35rem;
      }
      .item-price {
        font-size: 0.95rem;
        color: #8c532b;
        font-weight: 600;
        margin: 0;
      }
    }
    .item-actions {
      display: flex;
      align-items: center;
      gap: 1.5rem;
      @media (max-width: 600px) {
        width: 100%;
        justify-content: space-between;
      }
    }
    .quantity-stepper {
      display: inline-flex;
      align-items: center;
      border: 1px solid #d9d9d9;
      border-radius: 4px;
      overflow: hidden;
      .qty-display {
        padding: 0 0.75rem;
        font-weight: 600;
        min-width: 32px;
        text-align: center;
      }
    }
    .item-subtotal {
      font-weight: 700;
      font-size: 1.05rem;
      min-width: 90px;
      text-align: right;
    }
    .cart-summary {
      background: #fafafa;
      border: 1px solid #eee;
      border-radius: 8px;
      padding: 1.5rem;
      h2 {
        font-size: 1.25rem;
        font-weight: 700;
        margin-bottom: 1.25rem;
        padding-bottom: 0.75rem;
        border-bottom: 1px solid #eee;
      }
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 0.75rem;
      font-size: 0.95rem;
      color: #555;
      .free-shipping {
        color: #389e0d;
        font-weight: 600;
      }
    }
    .summary-divider {
      height: 1px;
      background: #e8e8e8;
      margin: 1rem 0;
    }
    .total-row {
      font-size: 1.15rem;
      color: #111;
      margin-bottom: 1.5rem;
      .total-amount {
        color: #8c532b;
        font-size: 1.35rem;
      }
    }
    .checkout-btn {
      width: 100%;
      height: 48px;
      font-size: 1.05rem;
      font-weight: 600;
      background: #8c532b;
      border-color: #8c532b;
      display: flex;
      align-items: center;
      justify-content: center;
      &:hover {
        background: #6e3e1d;
        border-color: #6e3e1d;
      }
    }
    .continue-btn {
      display: block;
      text-align: center;
      margin-top: 0.75rem;
      color: #666;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CartPage {
  readonly cart = inject(CartService);
}
