import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzResultModule } from 'ng-zorro-antd/result';
import { OrderService } from '../../core/order/order.service';
import { VnPayReturnResponse } from '../../core/order/order.models';
import { VndPipe } from '../../core/catalog/catalog-ui';

@Component({
  selector: 'app-vnpay-return-page',
  imports: [
    CommonModule,
    RouterLink,
    NzButtonModule,
    NzAlertModule,
    NzResultModule,
    VndPipe,
  ],
  template: `
    <section class="vnpay-return-container" aria-labelledby="vnpay-title">
      @if (loading()) {
        <div class="state-card loading-box">
          <div class="spinner" aria-hidden="true"></div>
          <h1 id="vnpay-title">Đang xác thực kết quả thanh toán VNPAY…</h1>
          <p>Hệ thống đang kiểm tra chữ ký và trạng thái giao dịch từ VNPAY, vui lòng đợi trong giây lát.</p>
        </div>
      } @else if (result(); as res) {
        @if (res.success) {
          <div class="state-card success-card">
            <nz-result
              nzStatus="success"
              nzTitle="Thanh toán thành công qua VNPAY!"
              [nzSubTitle]="res.message"
            >
              <div nz-result-content>
                <div class="result-details">
                  <div class="detail-row">
                    <span class="label">Mã đơn hàng:</span>
                    <strong class="highlight">#{{ res.publicCode }}</strong>
                  </div>
                  @if (transactionNo()) {
                    <div class="detail-row">
                      <span class="label">Mã GD VNPAY:</span>
                      <code>{{ transactionNo() }}</code>
                    </div>
                  }
                  @if (bankCode()) {
                    <div class="detail-row">
                      <span class="label">Ngân hàng thanh toán:</span>
                      <strong>{{ bankCode() }}</strong>
                    </div>
                  }
                  @if (amountVnd(); as amt) {
                    <div class="detail-row">
                      <span class="label">Số tiền:</span>
                      <strong class="amount">{{ amt | vnd }}</strong>
                    </div>
                  }
                </div>
              </div>
              <div nz-result-extra>
                @if (res.orderId) {
                  <a nz-button nzType="primary" nzSize="large" [routerLink]="['/orders', res.orderId]">
                    Xem chi tiết đơn hàng
                  </a>
                }
                <a nz-button nzSize="large" routerLink="/orders">
                  Danh sách đơn hàng
                </a>
              </div>
            </nz-result>
          </div>
        } @else {
          <div class="state-card error-card">
            <nz-result
              nzStatus="error"
              nzTitle="Giao dịch thanh toán chưa hoàn tất"
              [nzSubTitle]="res.message"
            >
              <div nz-result-content>
                <div class="result-details">
                  @if (res.publicCode) {
                    <div class="detail-row">
                      <span class="label">Mã đơn hàng:</span>
                      <strong>#{{ res.publicCode }}</strong>
                    </div>
                  }
                  <div class="detail-row">
                    <span class="label">Mã phản hồi VNPAY:</span>
                    <code>{{ res.code }}</code>
                  </div>
                  <p class="error-tip">
                    Giao dịch có thể đã bị hủy hoặc xảy ra lỗi trong quá trình xử lý tại ngân hàng. Bạn có thể mở lại đơn hàng để tiến hành thanh toán lại bất kỳ lúc nào.
                  </p>
                </div>
              </div>
              <div nz-result-extra>
                @if (res.orderId) {
                  <a nz-button nzType="primary" nzSize="large" [routerLink]="['/orders', res.orderId]">
                    Quay lại đơn hàng để thanh toán lại
                  </a>
                }
                <a nz-button nzSize="large" routerLink="/orders">
                  Danh sách đơn hàng
                </a>
              </div>
            </nz-result>
          </div>
        }
      }
    </section>
  `,
  styles: `
    .vnpay-return-container {
      max-width: 720px;
      margin: 2.5rem auto 4rem;
      padding: 0 1.5rem;
    }
    .state-card {
      background: #fff;
      border-radius: 16px;
      padding: 2.5rem 2rem;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
      text-align: center;
    }
    .loading-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      h1 {
        font-size: 1.5rem;
        font-weight: 700;
        margin: 0;
      }
      p {
        color: #666;
        margin: 0;
      }
    }
    .spinner {
      width: 48px;
      height: 48px;
      border: 4px solid #f3f3f3;
      border-top: 4px solid #8c532b;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .result-details {
      background: #fafafa;
      border: 1px solid #eee;
      border-radius: 8px;
      padding: 1.25rem 1.5rem;
      margin: 1.5rem 0;
      text-align: left;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.95rem;
      .label {
        color: #666;
      }
      .highlight {
        color: #8c532b;
        font-size: 1.1rem;
      }
      .amount {
        color: #389e0d;
        font-size: 1.15rem;
      }
    }
    .error-tip {
      font-size: 0.85rem;
      color: #888;
      margin-top: 0.5rem;
      margin-bottom: 0;
      line-height: 1.5;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VnPayReturnPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly orderService = inject(OrderService);

  readonly loading = signal(true);
  readonly result = signal<VnPayReturnResponse | null>(null);
  readonly transactionNo = signal<string | null>(null);
  readonly bankCode = signal<string | null>(null);
  readonly amountVnd = signal<number | null>(null);

  ngOnInit(): void {
    const rawParams = this.route.snapshot.queryParams;
    const params: Record<string, string> = {};
    for (const key of Object.keys(rawParams)) {
      params[key] = String(rawParams[key]);
    }

    if (params['vnp_TransactionNo']) {
      this.transactionNo.set(params['vnp_TransactionNo']);
    }
    if (params['vnp_BankCode']) {
      this.bankCode.set(params['vnp_BankCode']);
    }
    if (params['vnp_Amount']) {
      const rawAmt = Number(params['vnp_Amount']);
      if (!isNaN(rawAmt)) {
        this.amountVnd.set(rawAmt / 100);
      }
    }

    this.orderService.processVnPayReturn(params).subscribe({
      next: (res) => {
        this.result.set(res);
        this.loading.set(false);
      },
      error: () => {
        this.result.set({
          success: false,
          code: 'CLIENT_ERROR',
          message: 'Không thể kết nối đến máy chủ để xác thực kết quả thanh toán.',
          orderId: null,
          publicCode: params['vnp_TxnRef'] || '',
        });
        this.loading.set(false);
      },
    });
  }
}