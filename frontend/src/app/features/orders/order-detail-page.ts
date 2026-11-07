import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { OrderService } from '../../core/order/order.service';
import { OrderResponse, PaymentInstructionsResponse } from '../../core/order/order.models';
import { VndPipe } from '../../core/catalog/catalog-ui';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  selector: 'app-order-detail-page',
  imports: [
    CommonModule,
    RouterLink,
    NzButtonModule,
    NzTagModule,
    NzAlertModule,
    NzModalModule,
    VndPipe,
  ],
  template: `
    <section class="order-detail-page" aria-labelledby="detail-title">
      <div class="top-nav">
        <a routerLink="/orders" class="back-link">← Danh sách đơn hàng</a>
      </div>

      @if (loading()) {
        <p class="loading-state" role="status">Đang tải thông tin đơn hàng…</p>
      } @else if (error()) {
        <nz-alert nzType="error" [nzMessage]="error()!" nzShowIcon />
        <button nz-button type="button" (click)="loadOrder()" style="margin-top: 1rem;">
          Thử lại
        </button>
      } @else if (order(); as ord) {
        <header class="detail-header">
          <div>
            <h1 id="detail-title">Đơn hàng #{{ ord.publicCode }}</h1>
            <p class="order-timestamp">Đặt lúc: {{ ord.createdAt | date: 'dd/MM/yyyy HH:mm:ss' }}</p>
          </div>
          <div class="header-tags">
            <nz-tag [nzColor]="getStatusColor(ord.status)" class="status-tag">
              {{ getStatusLabel(ord.status) }}
            </nz-tag>
            <nz-tag [nzColor]="ord.payment?.status === 'PAID' ? 'success' : 'warning'" class="status-tag">
              {{ ord.payment?.status === 'PAID' ? 'Đã thanh toán' : 'Chưa thanh toán' }}
            </nz-tag>
          </div>
        </header>

        @if (actionFeedback()) {
          <nz-alert
            [nzType]="actionFeedback()!.type"
            [nzMessage]="actionFeedback()!.message"
            nzShowIcon
            style="margin-bottom: 1.5rem;"
          />
        }

        <div class="detail-layout">
          <div class="detail-main">
            <!-- Payment QR Card if QR_TRANSFER and UNPAID -->
            @if (ord.payment?.method === 'QR_TRANSFER' && ord.payment?.status === 'UNPAID') {
              <div class="qr-payment-card">
                <div class="qr-card-header">
                  <h2>Thông tin thanh toán chuyển khoản</h2>
                  <span class="qr-tag">VietQR 24/7</span>
                </div>
                <div class="qr-card-body">
                  @if (instructions()?.qrUrl; as qrUrl) {
                    <div class="qr-image-container">
                      <img [src]="qrUrl" alt="Mã VietQR chuyển khoản" class="qr-image" />
                      <p class="qr-note">Quét mã bằng app ngân hàng bất kỳ</p>
                    </div>
                  }
                  <div class="bank-details">
                    <div class="bank-row">
                      <span class="label">Ngân hàng:</span>
                      <strong class="val">{{ instructions()?.bankCode || ord.payment?.bankCode }}</strong>
                    </div>
                    <div class="bank-row">
                      <span class="label">Số tài khoản:</span>
                      <strong class="val highlight">{{ instructions()?.bankAccount || ord.payment?.bankAccount }}</strong>
                      <button nz-button nzSize="small" type="button" (click)="copyText(instructions()?.bankAccount || ord.payment?.bankAccount)">Copy STK</button>
                    </div>
                    <div class="bank-row">
                      <span class="label">Chủ tài khoản:</span>
                      <strong class="val">{{ instructions()?.bankAccountName || ord.payment?.bankAccountName }}</strong>
                    </div>
                    <div class="bank-row">
                      <span class="label">Số tiền:</span>
                      <strong class="val price-val">{{ ord.totalVnd | vnd }}</strong>
                    </div>
                    <div class="bank-row">
                      <span class="label">Nội dung CK:</span>
                      <strong class="val highlight">{{ ord.publicCode }}</strong>
                      <button nz-button nzSize="small" type="button" (click)="copyText(ord.publicCode)">Copy nội dung</button>
                    </div>
                  </div>
                </div>
                <p class="qr-instruction">
                  ⚠️ Vui lòng ghi chính xác <strong>nội dung chuyển khoản</strong> để đơn hàng được nhân viên quán xác nhận nhanh nhất!
                </p>
              </div>
            }

            <div class="info-section">
              <h2>Danh sách món đã đặt</h2>
              <div class="items-table">
                @for (item of ord.items; track item.id) {
                  <div class="item-row">
                    <div class="item-meta">
                      <strong>{{ item.productName }}</strong>
                      <span class="item-calc">{{ item.unitPriceVnd | vnd }} x {{ item.quantity }}</span>
                    </div>
                    <strong class="item-total">{{ item.subtotalVnd | vnd }}</strong>
                  </div>
                }
              </div>
              <div class="total-summary">
                <div class="summary-line">
                  <span>Phí vận chuyển</span>
                  <span>Miễn phí</span>
                </div>
                <div class="summary-line final-line">
                  <strong>Tổng cộng</strong>
                  <strong class="total-vnd">{{ ord.totalVnd | vnd }}</strong>
                </div>
              </div>
            </div>
          </div>

          <aside class="detail-sidebar">
            <div class="info-card">
              <h2>Thông tin nhận hàng</h2>
              <div class="card-detail">
                <span class="card-label">Người nhận:</span>
                <strong>{{ ord.customerName }}</strong>
              </div>
              <div class="card-detail">
                <span class="card-label">Số điện thoại:</span>
                <span>{{ ord.customerPhone || 'Chưa cung cấp' }}</span>
              </div>
              <div class="card-detail">
                <span class="card-label">Địa chỉ giao:</span>
                <span>{{ ord.customerAddress || 'Tại quầy' }}</span>
              </div>
              @if (ord.note) {
                <div class="card-detail">
                  <span class="card-label">Ghi chú:</span>
                  <span class="note-text">{{ ord.note }}</span>
                </div>
              }
            </div>

            <div class="info-card">
              <h2>Hình thức thanh toán</h2>
              <div class="card-detail">
                <span class="card-label">Phương thức:</span>
                <strong>{{ ord.payment?.method === 'QR_TRANSFER' ? 'Chuyển khoản VietQR' : 'Tiền mặt khi nhận' }}</strong>
              </div>
              <div class="card-detail">
                <span class="card-label">Trạng thái:</span>
                <span [class.paid-text]="ord.payment?.status === 'PAID'">
                  {{ ord.payment?.status === 'PAID' ? 'Đã thanh toán' : 'Chưa thanh toán' }}
                </span>
              </div>
            </div>

            <!-- Cancel action for customer -->
            @if (ord.status === 'PENDING' && ord.payment?.status === 'UNPAID') {
              <div class="cancel-action-card">
                <p>Bạn muốn thay đổi hoặc hủy đơn hàng?</p>
                <button
                  nz-button
                  nzDanger
                  type="button"
                  [nzLoading]="cancelling()"
                  (click)="showCancelConfirm()"
                >
                  Hủy đơn hàng này
                </button>
              </div>
            }
          </aside>
        </div>
      }
    </section>

    <!-- Cancel Confirmation Modal -->
    <nz-modal
      [(nzVisible)]="confirmModalVisible"
      nzTitle="Xác nhận hủy đơn hàng"
      (nzOnCancel)="confirmModalVisible.set(false)"
      (nzOnOk)="executeCancel()"
      [nzOkLoading]="cancelling()"
      nzOkText="Đồng ý hủy"
      nzOkDanger="true"
      nzCancelText="Không hủy"
    >
      <ng-container *nzModalContent>
        <p>Bạn có chắc chắn muốn hủy đơn hàng <strong>#{{ order()?.publicCode }}</strong> không?</p>
        <p style="color: #888; font-size: 0.9rem;">Thao tác này không thể hoàn tác.</p>
      </ng-container>
    </nz-modal>
  `,
  styles: `
    .order-detail-page {
      max-width: 1100px;
      margin: 0 auto;
      padding: 2rem 1.5rem 4rem;
    }
    .top-nav {
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
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #eee;
      @media (max-width: 600px) {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.75rem;
      }
      h1 {
        font-size: 1.8rem;
        font-weight: 700;
        margin: 0;
      }
      .order-timestamp {
        color: #777;
        font-size: 0.9rem;
        margin-top: 0.25rem;
      }
      .header-tags {
        display: flex;
        gap: 0.5rem;
      }
      .status-tag {
        font-size: 0.95rem;
        padding: 0.25rem 0.75rem;
      }
    }
    .detail-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 340px;
      gap: 2rem;
      align-items: start;
      @media (max-width: 900px) {
        grid-template-columns: 1fr;
      }
    }
    .qr-payment-card {
      background: #fdfaf7;
      border: 2px solid #8c532b;
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 2rem;
    }
    .qr-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.25rem;
      h2 {
        font-size: 1.25rem;
        font-weight: 700;
        color: #8c532b;
        margin: 0;
      }
      .qr-tag {
        background: #8c532b;
        color: #fff;
        font-size: 0.75rem;
        font-weight: 700;
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
      }
    }
    .qr-card-body {
      display: flex;
      gap: 2rem;
      align-items: center;
      @media (max-width: 600px) {
        flex-direction: column;
        align-items: flex-start;
      }
    }
    .qr-image-container {
      text-align: center;
      .qr-image {
        width: 180px;
        height: 180px;
        border-radius: 8px;
        border: 1px solid #ddd;
        background: #fff;
        padding: 4px;
      }
      .qr-note {
        font-size: 0.75rem;
        color: #666;
        margin-top: 0.4rem;
      }
    }
    .bank-details {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }
    .bank-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.95rem;
      .label {
        width: 110px;
        color: #666;
      }
      .val {
        color: #222;
        &.highlight {
          color: #8c532b;
          font-family: monospace;
          font-size: 1.1rem;
        }
        &.price-val {
          color: #d4380d;
          font-size: 1.15rem;
        }
      }
    }
    .qr-instruction {
      margin-top: 1.25rem;
      padding-top: 0.75rem;
      border-top: 1px dashed #d9d9d9;
      font-size: 0.85rem;
      color: #666;
    }
    .info-section {
      background: #fff;
      border: 1px solid #eee;
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      h2 {
        font-size: 1.15rem;
        font-weight: 700;
        margin-bottom: 1rem;
      }
    }
    .items-table {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .item-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid #f5f5f5;
      .item-meta {
        display: flex;
        flex-direction: column;
        strong {
          font-size: 1rem;
        }
        .item-calc {
          font-size: 0.85rem;
          color: #777;
        }
      }
      .item-total {
        font-size: 1rem;
      }
    }
    .total-summary {
      margin-top: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      .summary-line {
        display: flex;
        justify-content: space-between;
        font-size: 0.95rem;
        color: #666;
        &.final-line {
          font-size: 1.2rem;
          color: #111;
          margin-top: 0.5rem;
          padding-top: 0.75rem;
          border-top: 1px solid #eee;
          .total-vnd {
            color: #8c532b;
          }
        }
      }
    }
    .detail-sidebar {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    .info-card {
      background: #fafafa;
      border: 1px solid #eee;
      border-radius: 8px;
      padding: 1.25rem;
      h2 {
        font-size: 1.1rem;
        font-weight: 700;
        margin-bottom: 1rem;
      }
      .card-detail {
        margin-bottom: 0.75rem;
        font-size: 0.95rem;
        .card-label {
          display: block;
          font-size: 0.8rem;
          color: #777;
          margin-bottom: 0.15rem;
        }
        .note-text {
          font-style: italic;
          color: #555;
        }
        .paid-text {
          color: #389e0d;
          font-weight: 600;
        }
      }
    }
    .cancel-action-card {
      background: #fff;
      border: 1px dashed #ff4d4f;
      border-radius: 8px;
      padding: 1.25rem;
      text-align: center;
      p {
        color: #666;
        font-size: 0.9rem;
        margin-bottom: 0.75rem;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly orderService = inject(OrderService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly order = signal<OrderResponse | null>(null);
  readonly instructions = signal<PaymentInstructionsResponse | null>(null);
  readonly cancelling = signal(false);
  readonly confirmModalVisible = signal(false);
  readonly actionFeedback = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  ngOnInit(): void {
    this.loadOrder();
  }

  loadOrder(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id) {
      this.error.set('Không tìm thấy mã đơn hàng.');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.orderService.getOrder(id).subscribe({
      next: (ord) => {
        this.order.set(ord);
        this.loading.set(false);
        if (ord.payment?.method === 'QR_TRANSFER') {
          this.loadInstructions(id);
        }
      },
      error: () => {
        this.error.set('Không tìm thấy thông tin đơn hàng hoặc bạn không có quyền xem.');
        this.loading.set(false);
      },
    });
  }

  private loadInstructions(id: number): void {
    this.orderService.getPaymentInstructions(id).subscribe({
      next: (inst) => this.instructions.set(inst),
      error: () => {},
    });
  }

  showCancelConfirm(): void {
    this.confirmModalVisible.set(true);
  }

  executeCancel(): void {
    const ord = this.order();
    if (!ord) return;

    this.cancelling.set(true);
    this.actionFeedback.set(null);

    this.orderService.cancelOrder(ord.id, { version: ord.version }).subscribe({
      next: (updated) => {
        this.order.set(updated);
        this.cancelling.set(false);
        this.confirmModalVisible.set(false);
        this.actionFeedback.set({
          type: 'success',
          message: 'Đơn hàng đã được hủy thành công.',
        });
      },
      error: (err: HttpErrorResponse) => {
        this.cancelling.set(false);
        this.confirmModalVisible.set(false);
        this.actionFeedback.set({
          type: 'error',
          message: err.error?.detail || 'Không thể hủy đơn hàng lúc này.',
        });
      },
    });
  }

  copyText(text?: string | null): void {
    if (!text) return;
    navigator.clipboard.writeText(text);
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
