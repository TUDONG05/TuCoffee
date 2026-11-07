import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzInputModule } from 'ng-zorro-antd/input';
import { OrderService } from '../../../core/order/order.service';
import { OrderDetailAdminResponse } from '../../../core/order/order.models';
import { VndPipe } from '../../../core/catalog/catalog-ui';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  selector: 'app-admin-order-detail-page',
  imports: [
    CommonModule,
    RouterLink,
    ReactiveFormsModule,
    NzButtonModule,
    NzTagModule,
    NzAlertModule,
    NzModalModule,
    NzInputModule,
    VndPipe,
  ],
  template: `
    <section class="admin-order-detail" aria-labelledby="admin-detail-title">
      <div class="top-bar">
        <a routerLink="/admin/orders" class="back-link">← Danh sách đơn hàng</a>
      </div>

      @if (loading()) {
        <p class="loading-state" role="status">Đang nạp chi tiết đơn hàng…</p>
      } @else if (error()) {
        <nz-alert nzType="error" [nzMessage]="error()!" nzShowIcon />
        <button nz-button type="button" (click)="load()" style="margin-top: 1rem;">Thử lại</button>
      } @else if (data(); as d) {
        <header class="detail-header">
          <div>
            <h1 id="admin-detail-title">Đơn hàng #{{ d.order.publicCode }}</h1>
            <p class="meta">
              Nguồn: <strong>{{ d.order.source }}</strong> · Đặt lúc: {{ d.order.createdAt | date: 'dd/MM/yyyy HH:mm:ss' }} · Version: {{ d.order.version }}
            </p>
          </div>
          <div class="header-tags">
            <nz-tag [nzColor]="getStatusColor(d.order.status)" class="tag-large">
              {{ getStatusLabel(d.order.status) }}
            </nz-tag>
            <nz-tag [nzColor]="d.order.payment?.status === 'PAID' ? 'success' : 'warning'" class="tag-large">
              {{ d.order.payment?.status === 'PAID' ? 'ĐÃ THANH TOÁN' : 'CHƯA THANH TOÁN' }}
            </nz-tag>
          </div>
        </header>

        @if (feedback()) {
          <nz-alert
            [nzType]="feedback()!.type"
            [nzMessage]="feedback()!.message"
            nzShowIcon
            style="margin-bottom: 1.5rem;"
          />
        }

        <div class="admin-detail-grid">
          <div class="grid-main">
            <!-- Action Toolbar for Admin -->
            <div class="action-card">
              <h2>Xử lý đơn hàng</h2>
              <div class="action-buttons">
                @if (d.order.status === 'PENDING') {
                  <button
                    nz-button
                    nzType="primary"
                    [nzLoading]="busyAction()"
                    (click)="updateStatus('CONFIRMED')"
                  >
                    Xác nhận đơn (Bắt đầu làm món)
                  </button>
                }

                @if (d.order.status === 'CONFIRMED') {
                  <button
                    nz-button
                    nzType="primary"
                    [nzLoading]="busyAction()"
                    [disabled]="d.order.payment?.status !== 'PAID'"
                    (click)="updateStatus('COMPLETED')"
                  >
                    Hoàn tất đơn hàng
                  </button>
                  @if (d.order.payment?.status !== 'PAID') {
                    <span class="action-hint">⚠️ Cần xác nhận thanh toán trước khi hoàn tất.</span>
                  }
                }

                @if (d.order.payment?.status === 'UNPAID' && (d.order.status === 'PENDING' || d.order.status === 'CONFIRMED')) {
                  <button
                    nz-button
                    nzType="default"
                    class="pay-confirm-btn"
                    [nzLoading]="busyAction()"
                    (click)="openPaymentModal()"
                  >
                    💰 Xác nhận đã nhận tiền
                  </button>

                  <button
                    nz-button
                    nzDanger
                    [nzLoading]="busyAction()"
                    (click)="updateStatus('CANCELLED')"
                  >
                    Hủy đơn hàng
                  </button>
                }
              </div>
            </div>

            <!-- Items Snapshot -->
            <div class="card-section">
              <h2>Sản phẩm trong đơn</h2>
              <div class="items-list">
                @for (item of d.order.items; track item.id) {
                  <div class="item-entry">
                    <div class="item-info">
                      <strong>{{ item.productName }}</strong>
                      <span class="calc">{{ item.unitPriceVnd | vnd }} x {{ item.quantity }}</span>
                    </div>
                    <strong class="subtotal">{{ item.subtotalVnd | vnd }}</strong>
                  </div>
                }
              </div>
              <div class="summary-total">
                <span>Tổng giá trị đơn:</span>
                <strong class="total-vnd">{{ d.order.totalVnd | vnd }}</strong>
              </div>
            </div>

            <!-- Audit Events Timeline -->
            <div class="card-section">
              <h2>Lịch sử sự kiện đơn hàng (Audit Log)</h2>
              <div class="events-timeline">
                @for (ev of d.events; track ev.id) {
                  <div class="event-item">
                    <div class="event-dot"></div>
                    <div class="event-content">
                      <div class="event-meta">
                        <strong>{{ ev.eventType }}</strong>
                        <span class="time">{{ ev.createdAt | date: 'dd/MM/yyyy HH:mm:ss' }}</span>
                      </div>
                      <p class="event-desc">
                        @if (ev.fromStatus) {
                          Trạng thái: <code>{{ ev.fromStatus }}</code> → <code>{{ ev.toStatus }}</code>
                        } @else {
                          Trạng thái: <code>{{ ev.toStatus }}</code>
                        }
                        · Version: {{ ev.orderVersion }}
                        @if (ev.paymentReference) {
                          · Mã GD: <code>{{ ev.paymentReference }}</code>
                        }
                      </p>
                      @if (ev.note) {
                        <p class="event-note">Ghi chú: {{ ev.note }}</p>
                      }
                    </div>
                  </div>
                }
              </div>
            </div>
          </div>

          <aside class="grid-side">
            <div class="card-section">
              <h2>Khách hàng & Giao hàng</h2>
              <div class="meta-row">
                <span class="label">Khách hàng:</span>
                <strong>{{ d.order.customerName }}</strong>
              </div>
              <div class="meta-row">
                <span class="label">Số điện thoại:</span>
                <span>{{ d.order.customerPhone || 'Không có' }}</span>
              </div>
              <div class="meta-row">
                <span class="label">Địa chỉ:</span>
                <span>{{ d.order.customerAddress || 'Tại quầy' }}</span>
              </div>
              @if (d.order.note) {
                <div class="meta-row">
                  <span class="label">Ghi chú:</span>
                  <span class="note-box">{{ d.order.note }}</span>
                </div>
              }
            </div>

            <div class="card-section">
              <h2>Thông tin thanh toán</h2>
              <div class="meta-row">
                <span class="label">Phương thức:</span>
                <strong>{{ d.order.payment?.method === 'QR_TRANSFER' ? 'Chuyển khoản VietQR' : 'Tiền mặt' }}</strong>
              </div>
              <div class="meta-row">
                <span class="label">Trạng thái:</span>
                <span [class.paid-badge]="d.order.payment?.status === 'PAID'">
                  {{ d.order.payment?.status === 'PAID' ? 'ĐÃ THANH TOÁN' : 'CHƯA THANH TOÁN' }}
                </span>
              </div>
              <div class="meta-row">
                <span class="label">Số tiền:</span>
                <strong>{{ (d.order.payment?.amountVnd || 0) | vnd }}</strong>
              </div>
              @if (d.order.payment?.reference) {
                <div class="meta-row">
                  <span class="label">Mã giao dịch:</span>
                  <code>{{ d.order.payment?.reference }}</code>
                </div>
              }
              @if (d.order.payment?.confirmedAt) {
                <div class="meta-row">
                  <span class="label">Xác nhận lúc:</span>
                  <span>{{ d.order.payment?.confirmedAt | date: 'dd/MM/yyyy HH:mm:ss' }}</span>
                </div>
              }
            </div>
          </aside>
        </div>
      }
    </section>

    <!-- Payment Confirmation Modal -->
    <nz-modal
      [(nzVisible)]="paymentModalVisible"
      nzTitle="Xác nhận đã nhận tiền thanh toán"
      (nzOnCancel)="paymentModalVisible.set(false)"
      (nzOnOk)="confirmPayment()"
      [nzOkLoading]="busyAction()"
      nzOkText="Xác nhận thanh toán"
      [nzOkDisabled]="paymentForm.invalid || busyAction()"
    >
      <ng-container *nzModalContent>
        <form [formGroup]="paymentForm" class="payment-confirm-form">
          <p>
            Đơn hàng: <strong>#{{ data()?.order?.publicCode }}</strong>
            · Số tiền: <strong>{{ ((data()?.order?.totalVnd) || 0) | vnd }}</strong>
          </p>

          @if (data()?.order?.payment?.method === 'QR_TRANSFER') {
            <div class="form-item">
              <label for="reference">Mã giao dịch ngân hàng <span class="required">*</span></label>
              <input
                nz-input
                id="reference"
                formControlName="reference"
                placeholder="Ví dụ: FT123456789 (mã tham chiếu giao dịch)"
              />
              <span class="help-text">Đối chiếu số tiền và mã trên app ngân hàng trước khi xác nhận.</span>
            </div>
          } @else {
            <p style="color: #666; font-size: 0.9rem;">
              Xác nhận bạn đã nhận đủ <strong>{{ ((data()?.order?.totalVnd) || 0) | vnd }}</strong> tiền mặt từ khách hàng.
            </p>
          }
        </form>
      </ng-container>
    </nz-modal>
  `,
  styles: `
    .admin-order-detail {
      padding: 1rem 0 3rem;
    }
    .top-bar {
      margin-bottom: 1rem;
      .back-link {
        color: #8c532b;
        font-weight: 600;
        text-decoration: none;
        &:hover {
          text-decoration: underline;
        }
      }
    }
    .detail-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 1.25rem;
      border-bottom: 1px solid #eee;
      margin-bottom: 1.5rem;
      h1 {
        font-size: 1.75rem;
        font-weight: 700;
        margin: 0;
      }
      .meta {
        color: #777;
        font-size: 0.85rem;
        margin-top: 0.25rem;
      }
      .header-tags {
        display: flex;
        gap: 0.5rem;
      }
      .tag-large {
        font-size: 0.95rem;
        padding: 0.25rem 0.75rem;
      }
    }
    .admin-detail-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 340px;
      gap: 1.75rem;
      align-items: start;
      @media (max-width: 900px) {
        grid-template-columns: 1fr;
      }
    }
    .grid-main {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    .grid-side {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    .action-card {
      background: #fdfaf7;
      border: 1px solid #f0dfd5;
      border-radius: 8px;
      padding: 1.25rem;
      h2 {
        font-size: 1.15rem;
        font-weight: 700;
        color: #8c532b;
        margin-bottom: 1rem;
      }
      .action-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: center;
      }
      .pay-confirm-btn {
        background: #389e0d;
        color: #fff;
        border-color: #389e0d;
        &:hover {
          background: #237804;
          border-color: #237804;
        }
      }
      .action-hint {
        color: #d46b08;
        font-size: 0.85rem;
      }
    }
    .card-section {
      background: #fff;
      border: 1px solid #eee;
      border-radius: 8px;
      padding: 1.25rem;
      h2 {
        font-size: 1.1rem;
        font-weight: 700;
        margin-bottom: 1rem;
        padding-bottom: 0.5rem;
        border-bottom: 1px solid #f5f5f5;
      }
    }
    .items-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .item-entry {
      display: flex;
      justify-content: space-between;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid #fafafa;
      .item-info {
        display: flex;
        flex-direction: column;
        .calc {
          font-size: 0.8rem;
          color: #777;
        }
      }
      .subtotal {
        font-size: 0.95rem;
      }
    }
    .summary-total {
      display: flex;
      justify-content: space-between;
      margin-top: 1rem;
      padding-top: 0.75rem;
      border-top: 1px solid #eee;
      font-size: 1.15rem;
      .total-vnd {
        color: #d4380d;
      }
    }
    .events-timeline {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding-left: 0.5rem;
    }
    .event-item {
      display: flex;
      gap: 0.75rem;
      position: relative;
      .event-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #8c532b;
        margin-top: 5px;
        flex-shrink: 0;
      }
      .event-content {
        flex: 1;
        .event-meta {
          display: flex;
          justify-content: space-between;
          font-size: 0.9rem;
          .time {
            color: #888;
            font-size: 0.8rem;
          }
        }
        .event-desc {
          margin: 0.2rem 0;
          font-size: 0.85rem;
          color: #555;
          code {
            background: #f5f5f5;
            padding: 1px 4px;
            border-radius: 3px;
          }
        }
        .event-note {
          font-size: 0.8rem;
          color: #777;
          font-style: italic;
          margin: 0;
        }
      }
    }
    .meta-row {
      display: flex;
      flex-direction: column;
      margin-bottom: 0.75rem;
      font-size: 0.9rem;
      .label {
        color: #777;
        font-size: 0.8rem;
        margin-bottom: 0.15rem;
      }
      .note-box {
        background: #fafafa;
        padding: 0.5rem;
        border-radius: 4px;
        font-style: italic;
      }
      .paid-badge {
        color: #389e0d;
        font-weight: 700;
      }
    }
    .payment-confirm-form {
      .form-item {
        margin-top: 1rem;
        label {
          display: block;
          font-weight: 600;
          margin-bottom: 0.25rem;
        }
        .required {
          color: #ff4d4f;
        }
        .help-text {
          display: block;
          color: #888;
          font-size: 0.8rem;
          margin-top: 0.25rem;
        }
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminOrderDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly orderService = inject(OrderService);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly data = signal<OrderDetailAdminResponse | null>(null);
  readonly busyAction = signal(false);
  readonly feedback = signal<{ type: 'success' | 'error'; message: string } | null>(null);
  readonly paymentModalVisible = signal(false);

  readonly paymentForm = this.fb.group({
    reference: [''],
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id) {
      this.error.set('Không tìm thấy mã đơn hàng.');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.orderService.getAdminOrder(id).subscribe({
      next: (res) => {
        this.data.set(res);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Không thể tải chi tiết đơn hàng.');
        this.loading.set(false);
      },
    });
  }

  updateStatus(targetStatus: 'CONFIRMED' | 'COMPLETED' | 'CANCELLED'): void {
    const d = this.data();
    if (!d || this.busyAction()) return;

    this.busyAction.set(true);
    this.feedback.set(null);

    this.orderService
      .adminUpdateStatus(d.order.id, {
        targetStatus,
        version: d.order.version,
      })
      .subscribe({
        next: () => {
          this.busyAction.set(false);
          this.feedback.set({
            type: 'success',
            message: `Cập nhật trạng thái thành công sang ${this.getStatusLabel(targetStatus)}.`,
          });
          this.load();
        },
        error: (err: HttpErrorResponse) => {
          this.busyAction.set(false);
          this.feedback.set({
            type: 'error',
            message: err.error?.detail || 'Không thể chuyển trạng thái đơn hàng.',
          });
        },
      });
  }

  openPaymentModal(): void {
    const d = this.data();
    if (!d) return;
    this.paymentForm.reset();
    if (d.order.payment?.method === 'QR_TRANSFER') {
      this.paymentForm.controls.reference.setValidators([Validators.required]);
    } else {
      this.paymentForm.controls.reference.clearValidators();
    }
    this.paymentForm.controls.reference.updateValueAndValidity();
    this.paymentModalVisible.set(true);
  }

  confirmPayment(): void {
    const d = this.data();
    if (!d || this.busyAction()) return;

    this.busyAction.set(true);
    this.feedback.set(null);

    const ref = this.paymentForm.value.reference?.trim() || null;
    const confirmationKey = crypto.randomUUID();

    this.orderService
      .adminConfirmPayment(d.order.id, {
        amountVnd: d.order.totalVnd,
        reference: ref,
        version: d.order.version,
        confirmationKey,
      })
      .subscribe({
        next: () => {
          this.busyAction.set(false);
          this.paymentModalVisible.set(false);
          this.feedback.set({
            type: 'success',
            message: 'Đã xác nhận thanh toán thành công!',
          });
          this.load();
        },
        error: (err: HttpErrorResponse) => {
          this.busyAction.set(false);
          this.feedback.set({
            type: 'error',
            message: err.error?.detail || 'Không thể xác nhận thanh toán.',
          });
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
