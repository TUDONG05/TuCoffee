import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzPaginationModule } from 'ng-zorro-antd/pagination';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { OrderService } from '../../core/order/order.service';
import { OrderPageResponse } from '../../core/order/order.models';
import { VndPipe } from '../../core/catalog/catalog-ui';

@Component({
  selector: 'app-my-orders-page',
  imports: [
    CommonModule,
    RouterLink,
    NzButtonModule,
    NzTagModule,
    NzPaginationModule,
    NzAlertModule,
    VndPipe,
  ],
  template: `
    <section class="orders-page" aria-labelledby="orders-title">
      <header class="orders-heading">
        <h1 id="orders-title">Đơn hàng của tôi</h1>
        <p>Theo dõi tiến độ đơn hàng và lịch sử mua sắm của bạn.</p>
      </header>

      @if (loading()) {
        <p class="loading-state" role="status">Đang tải danh sách đơn hàng…</p>
      } @else if (error()) {
        <nz-alert nzType="error" [nzMessage]="error()!" nzShowIcon />
        <button nz-button type="button" (click)="loadOrders(page())" style="margin-top: 1rem;">
          Thử lại
        </button>
      } @else if (!pageData() || pageData()!.items.length === 0) {
        <div class="empty-orders">
          <div class="empty-icon" aria-hidden="true">📦</div>
          <h2>Bạn chưa có đơn hàng nào</h2>
          <p>Hãy khám phá thực đơn cà phê thơm ngon của Tu’s Coffee và đặt món ngay nhé!</p>
          <a nz-button nzType="primary" nzSize="large" routerLink="/menu">Xem thực đơn ngay</a>
        </div>
      } @else {
        <div class="orders-list">
          @for (order of pageData()!.items; track order.id) {
            <article class="order-card">
              <div class="order-card-header">
                <div>
                  <span class="order-code">Mã đơn: <strong>{{ order.publicCode }}</strong></span>
                  <span class="order-time">{{ order.createdAt | date: 'dd/MM/yyyy HH:mm' }}</span>
                </div>
                <div class="order-badges">
                  <nz-tag [nzColor]="getStatusColor(order.status)">
                    {{ getStatusLabel(order.status) }}
                  </nz-tag>
                  <nz-tag [nzColor]="order.payment?.status === 'PAID' ? 'success' : 'warning'">
                    {{ order.payment?.status === 'PAID' ? 'Đã thanh toán' : 'Chưa thanh toán' }}
                  </nz-tag>
                </div>
              </div>

              <div class="order-items-preview">
                @for (item of order.items; track item.id) {
                  <div class="preview-item">
                    <span>{{ item.productName }} <small>x{{ item.quantity }}</small></span>
                    <span>{{ item.subtotalVnd | vnd }}</span>
                  </div>
                }
              </div>

              <div class="order-card-footer">
                <div class="total-info">
                  <span>Tổng tiền:</span>
                  <strong class="total-price">{{ order.totalVnd | vnd }}</strong>
                </div>
                <a nz-button nzType="default" [routerLink]="['/orders', order.id]">
                  Chi tiết đơn hàng →
                </a>
              </div>
            </article>
          }
        </div>

        @if (pageData()!.totalPages > 1) {
          <div class="pagination-container">
            <nz-pagination
              [nzPageIndex]="page() + 1"
              [nzPageSize]="pageData()!.size"
              [nzTotal]="pageData()!.totalItems"
              (nzPageIndexChange)="loadOrders($event - 1)"
            />
          </div>
        }
      }
    </section>
  `,
  styles: `
    .orders-page {
      max-width: 960px;
      margin: 0 auto;
      padding: 2rem 1.5rem 4rem;
    }
    .orders-heading {
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
    .loading-state {
      text-align: center;
      padding: 3rem;
      color: #666;
    }
    .empty-orders {
      text-align: center;
      padding: 4rem 1.5rem;
      background: #fafafa;
      border: 1px dashed #d9d9d9;
      border-radius: 12px;
      .empty-icon {
        font-size: 3.5rem;
        margin-bottom: 1rem;
      }
      h2 {
        font-size: 1.35rem;
        margin-bottom: 0.5rem;
      }
      p {
        color: #777;
        margin-bottom: 1.5rem;
      }
    }
    .orders-list {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .order-card {
      background: #fff;
      border: 1px solid #eee;
      border-radius: 8px;
      padding: 1.25rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.02);
    }
    .order-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid #f0f0f0;
      margin-bottom: 0.75rem;
      @media (max-width: 600px) {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.5rem;
      }
      .order-code {
        font-size: 1.05rem;
        color: #333;
      }
      .order-time {
        font-size: 0.85rem;
        color: #888;
        margin-left: 0.75rem;
      }
      .order-badges {
        display: flex;
        gap: 0.35rem;
      }
    }
    .order-items-preview {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid #f0f0f0;
      .preview-item {
        display: flex;
        justify-content: space-between;
        font-size: 0.9rem;
        color: #555;
        small {
          color: #888;
        }
      }
    }
    .order-card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 0.75rem;
      .total-info {
        font-size: 0.95rem;
        span {
          color: #666;
          margin-right: 0.5rem;
        }
        .total-price {
          color: #8c532b;
          font-size: 1.2rem;
        }
      }
    }
    .pagination-container {
      margin-top: 2rem;
      display: flex;
      justify-content: center;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyOrdersPage implements OnInit {
  private readonly orderService = inject(OrderService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly pageData = signal<OrderPageResponse | null>(null);
  readonly page = signal(0);

  ngOnInit(): void {
    this.loadOrders(0);
  }

  loadOrders(pageIndex: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.page.set(pageIndex);

    this.orderService.getMyOrders(pageIndex, 10).subscribe({
      next: (data) => {
        this.pageData.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Không thể tải danh sách đơn hàng. Vui lòng thử lại sau.');
        this.loading.set(false);
      },
    });
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'PENDING':
        return 'warning';
      case 'CONFIRMED':
        return 'processing';
      case 'COMPLETED':
        return 'success';
      case 'CANCELLED':
        return 'default';
      default:
        return 'default';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'PENDING':
        return 'Chờ xác nhận';
      case 'CONFIRMED':
        return 'Đang xử lý';
      case 'COMPLETED':
        return 'Hoàn tất';
      case 'CANCELLED':
        return 'Đã hủy';
      default:
        return status;
    }
  }
}
