import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { OrderService } from '../../../core/order/order.service';
import { OrderPageResponse, OrderResponse } from '../../../core/order/order.models';
import { VndPipe } from '../../../core/catalog/catalog-ui';

@Component({
  selector: 'app-admin-orders-page',
  imports: [
    CommonModule,
    RouterLink,
    ReactiveFormsModule,
    NzButtonModule,
    NzInputModule,
    NzSelectModule,
    NzTableModule,
    NzTagModule,
    NzAlertModule,
    VndPipe,
  ],
  template: `
    <section class="admin-orders-page" aria-labelledby="admin-orders-title">
      <header class="page-heading">
        <div>
          <h1 id="admin-orders-title">Quản lý Đơn hàng</h1>
          <p>Xem, tìm kiếm, chuyển trạng thái và xác nhận thanh toán đơn hàng.</p>
        </div>
      </header>

      <form class="filters-bar" [formGroup]="filters" (ngSubmit)="search(0)">
        <div class="filter-item search-field">
          <label for="q">Tìm kiếm</label>
          <input
            nz-input
            id="q"
            formControlName="q"
            placeholder="Mã đơn, tên khách, SĐT…"
          />
        </div>

        <div class="filter-item">
          <label for="status">Trạng thái đơn</label>
          <nz-select nzId="status" formControlName="status">
            <nz-option [nzValue]="null" nzLabel="Tất cả trạng thái" />
            <nz-option nzValue="PENDING" nzLabel="Chờ xác nhận" />
            <nz-option nzValue="CONFIRMED" nzLabel="Đang xử lý" />
            <nz-option nzValue="COMPLETED" nzLabel="Hoàn tất" />
            <nz-option nzValue="CANCELLED" nzLabel="Đã hủy" />
          </nz-select>
        </div>

        <div class="filter-item">
          <label for="paymentStatus">Thanh toán</label>
          <nz-select nzId="paymentStatus" formControlName="paymentStatus">
            <nz-option [nzValue]="null" nzLabel="Tất cả thanh toán" />
            <nz-option nzValue="UNPAID" nzLabel="Chưa thanh toán" />
            <nz-option nzValue="PAID" nzLabel="Đã thanh toán" />
          </nz-select>
        </div>

        <div class="filter-actions">
          <button nz-button nzType="primary" type="submit" [nzLoading]="loading()">
            Lọc đơn
          </button>
          <button nz-button type="button" (click)="resetFilters()">
            Đặt lại
          </button>
        </div>
      </form>

      @if (error()) {
        <nz-alert nzType="error" [nzMessage]="error()!" nzShowIcon style="margin-bottom: 1rem;" />
      }

      <div class="table-container">
        <nz-table
          #ordersTable
          [nzData]="pageData()?.items || []"
          [nzLoading]="loading()"
          [nzFrontPagination]="false"
          [nzTotal]="pageData()?.totalItems || 0"
          [nzPageIndex]="page() + 1"
          [nzPageSize]="pageSize"
          (nzPageIndexChange)="search($event - 1)"
        >
          <thead>
            <tr>
              <th>Mã đơn</th>
              <th>Khách hàng</th>
              <th>Số tiền</th>
              <th>Trạng thái đơn</th>
              <th>Thanh toán</th>
              <th>Thời gian</th>
              <th nzAlign="right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            @for (order of ordersTable.data; track order.id) {
              <tr>
                <td>
                  <strong class="order-code">{{ order.publicCode }}</strong>
                  <span class="source-tag">({{ order.source }})</span>
                </td>
                <td>
                  <div class="customer-info">
                    <strong>{{ order.customerName }}</strong>
                    <small>{{ order.customerPhone || 'Không có SĐT' }}</small>
                  </div>
                </td>
                <td>
                  <strong class="price-val">{{ order.totalVnd | vnd }}</strong>
                </td>
                <td>
                  <nz-tag [nzColor]="getStatusColor(order.status)">
                    {{ getStatusLabel(order.status) }}
                  </nz-tag>
                </td>
                <td>
                  <nz-tag [nzColor]="order.payment?.status === 'PAID' ? 'success' : 'warning'">
                    {{ order.payment?.status === 'PAID' ? 'ĐÃ TRẢ' : 'CHƯA TRẢ' }}
                  </nz-tag>
                  <small class="method-tag">{{ order.payment?.method === 'QR_TRANSFER' ? 'VietQR' : (order.payment?.method === 'VNPAY' ? 'VNPAY' : 'Tiền mặt') }}</small>
                </td>
                <td>
                  {{ order.createdAt | date: 'dd/MM/yy HH:mm' }}
                </td>
                <td nzAlign="right">
                  <a nz-button nzSize="small" [routerLink]="['/admin/orders', order.id]">
                    Xử lý →
                  </a>
                </td>
              </tr>
            }
          </tbody>
        </nz-table>
      </div>
    </section>
  `,
  styles: `
    .admin-orders-page {
      padding: 1rem 0;
    }
    .page-heading {
      margin-bottom: 1.5rem;
      h1 {
        font-size: 1.75rem;
        font-weight: 700;
        margin-bottom: 0.25rem;
      }
      p {
        color: #666;
        margin: 0;
      }
    }
    .filters-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      align-items: flex-end;
      background: #fafafa;
      border: 1px solid #eee;
      border-radius: 8px;
      padding: 1.25rem;
      margin-bottom: 1.5rem;
    }
    .filter-item {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      min-width: 170px;
      &.search-field {
        flex: 1;
        min-width: 220px;
      }
      label {
        font-size: 0.85rem;
        font-weight: 600;
        color: #555;
      }
    }
    .filter-actions {
      display: flex;
      gap: 0.5rem;
    }
    .table-container {
      background: #fff;
      border: 1px solid #eee;
      border-radius: 8px;
      overflow: hidden;
    }
    .order-code {
      font-family: monospace;
      font-size: 0.95rem;
      color: #8c532b;
    }
    .source-tag {
      font-size: 0.75rem;
      color: #999;
      margin-left: 0.25rem;
    }
    .customer-info {
      display: flex;
      flex-direction: column;
      small {
        color: #777;
        font-size: 0.8rem;
      }
    }
    .price-val {
      color: #d4380d;
    }
    .method-tag {
      display: block;
      color: #888;
      font-size: 0.75rem;
      margin-top: 0.15rem;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminOrdersPage implements OnInit {
  private readonly orderService = inject(OrderService);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly pageData = signal<OrderPageResponse | null>(null);
  readonly page = signal(0);
  readonly pageSize = 12;

  readonly filters = this.fb.group({
    q: [''],
    status: [null as string | null],
    paymentStatus: [null as string | null],
  });

  ngOnInit(): void {
    this.search(0);
  }

  search(pageIndex: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.page.set(pageIndex);

    const val = this.filters.getRawValue();
    this.orderService
      .getAdminOrders({
        q: val.q?.trim() || undefined,
        status: val.status || undefined,
        paymentStatus: val.paymentStatus || undefined,
        page: pageIndex,
        size: this.pageSize,
      })
      .subscribe({
        next: (data) => {
          this.pageData.set(data);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Không thể tải danh sách đơn hàng quản trị.');
          this.loading.set(false);
        },
      });
  }

  resetFilters(): void {
    this.filters.reset();
    this.search(0);
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
        return 'Đang chuẩn bị';
      case 'COMPLETED':
        return 'Hoàn tất';
      case 'CANCELLED':
        return 'Đã hủy';
      default:
        return status;
    }
  }
}
