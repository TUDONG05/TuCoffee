import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { EMPTY, Subscription, expand, finalize, firstValueFrom, interval, reduce, switchMap, takeWhile } from 'rxjs';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { CatalogService } from '../../../core/catalog/catalog.service';
import { Product } from '../../../core/catalog/catalog.models';
import { ProductImage, VndPipe } from '../../../core/catalog/catalog-ui';
import { PosService } from '../../../core/pos/pos.service';
import { OrderService } from '../../../core/order/order.service';
import { CreateOrderRequest, OrderResponse, PaymentInstructionsResponse } from '../../../core/order/order.models';
import { apiError } from '../../../core/auth/api-error';

@Component({
  selector: 'app-pos-page',
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    NzButtonModule,
    NzInputModule,
    NzAlertModule,
    NzModalModule,
    NzTagModule,
    ProductImage,
    VndPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="no-print"><h1>Tạo đơn POS</h1></header>
    @if (error()) { <nz-alert class="no-print" nzType="error" [nzMessage]="error()" nzShowIcon /> }
    <div class="pos-grid no-print">
      <section class="panel" aria-label="Chọn món">
        <form class="search" (ngSubmit)="search()">
          <label for="pos-search">Tìm món</label>
          <input nz-input id="pos-search" name="q" [ngModel]="q" (ngModelChange)="queueSearch($event)" [disabled]="busy()" placeholder="Nhập tên món" />
          <button nz-button [disabled]="busy() || loading()">Tìm</button>
        </form>
        @if (loading()) { <p role="status">Đang tải thực đơn…</p> }
        @if (catalogError()) { <nz-alert nzType="error" [nzMessage]="catalogError()" /><button nz-button type="button" (click)="search()">Thử lại</button> }
        <div class="products">
          @for (product of products(); track product.id) {
            <button class="product" type="button" (click)="add(product)" [disabled]="busy() || uncertain()" [attr.aria-label]="'Thêm ' + product.name + ' vào đơn'">
              <app-product-image [src]="product.imageUrl" [alt]="product.name" />
              <span class="product-info">
                <strong class="product-name">{{ product.name }}</strong>
                <span class="product-bottom"><strong class="product-price">{{ product.priceVnd | vnd }}</strong><span class="product-add" aria-hidden="true">+</span></span>
              </span>
            </button>
          } @empty { @if (!loading() && !catalogError()) { <p>Không có món phù hợp.</p> } }
        </div>
      </section>

      <section class="panel order-panel" aria-labelledby="pos-cart-title">
        <h2 id="pos-cart-title">Đơn tại quầy</h2>
        @for (line of lines(); track line.product.id) {
          <div class="line">
            <div>
              <strong>{{ line.product.name }}</strong>
              <small>{{ line.product.priceVnd | vnd }} / món</small>
            </div>
            <div class="quantity">
              <button nz-button type="button" [attr.aria-label]="'Giảm ' + line.product.name" (click)="quantity(line.product.id,-1)" [disabled]="busy() || uncertain()">−</button>
              <span>{{ line.quantity }}</span>
              <button nz-button type="button" [attr.aria-label]="'Tăng ' + line.product.name" (click)="quantity(line.product.id,1)" [disabled]="busy() || uncertain() || line.quantity >= 99">+</button>
            </div>
          </div>
        } @empty { <p class="empty-hint">Chưa có món trong đơn. Bấm vào món bên trái để thêm.</p> }

        <p class="total"><span>Tổng cộng</span><strong>{{ total() | vnd }}</strong></p>

        <form (ngSubmit)="submit()">
          <label for="pos-name">Tên khách</label>
          <input nz-input id="pos-name" name="customer" [(ngModel)]="customerName" maxlength="100" [disabled]="busy() || uncertain()" />
          <label for="pos-note">Ghi chú pha chế</label>
          <textarea nz-input id="pos-note" name="note" [(ngModel)]="note" maxlength="1000" [disabled]="busy() || uncertain()" placeholder="Ít đá, ít đường..."></textarea>

          <label for="pos-payment">Hình thức thanh toán mặc định</label>
          <select id="pos-payment" name="payment" [(ngModel)]="paymentMethod" [disabled]="busy() || uncertain()">
            <option value="CASH">Tiền mặt</option>
            <option value="QR_TRANSFER">Chuyển khoản VietQR</option>
          </select>

          @if (uncertain()) {
            <p role="status" class="uncertain-msg">
              Chưa xác định kết quả lần gửi trước. Gửi lại sẽ dùng cùng mã yêu cầu để tránh tạo trùng. Bạn cũng có thể <a routerLink="/admin/orders">kiểm tra danh sách đơn</a>.
            </p>
            <button nz-button nzType="dashed" nzSize="large" nzBlock type="submit" [nzLoading]="busy()">
              Kiểm tra / gửi lại đơn
            </button>
          }

          <div class="pos-fast-actions">
            <button nz-button nzType="primary" nzSize="large" nzBlock type="button"
              (click)="submitCashAndPrint()"
              [nzLoading]="busy() && currentAction() === 'CASH'"
              [disabled]="busy() || !lines().length || !customerName.trim()">
              Thu tiền mặt & In bill (1 chạm)
            </button>

            <button nz-button nzType="default" nzSize="large" nzBlock type="button"
              (click)="submitQrAndShowModal()"
              [nzLoading]="busy() && currentAction() === 'QR'"
              [disabled]="busy() || !lines().length || !customerName.trim()">
              Quét mã VietQR
            </button>
          </div>
        </form>
      </section>
    </div>

    <!-- Modal Thanh toán VietQR -->
    <nz-modal
      [(nzVisible)]="qrModalVisible"
      [nzTitle]="'Thanh toán VietQR — Đơn #' + (activeQrOrder()?.publicCode || '')"
      [nzFooter]="qrModalFooter"
      (nzOnCancel)="closeQrModal()"
      [nzWidth]="480">
      <ng-container *nzModalContent>
        <div class="qr-modal-body">
          <p class="qr-amount">{{ (activeQrOrder()?.totalVnd || 0) | vnd }}</p>

          @if (loadingQr()) {
            <p role="status">Đang nạp mã VietQR thanh toán…</p>
          } @else if (activeQrInstructions(); as p) {
            <div class="qr-box">
              <img [src]="p.qrUrl" alt="VietQR" class="qr-img" width="220" height="220" />
              <div class="qr-info">
                <p>Ngân hàng: <strong>{{ p.bankCode }}</strong></p>
                <p>Số tài khoản: <strong>{{ p.bankAccount }}</strong></p>
                <p>Chủ tài khoản: <strong>{{ p.bankAccountName }}</strong></p>
                <p class="qr-content">Nội dung: <strong>{{ p.transferContent }}</strong></p>
              </div>
            </div>

            <div class="qr-status-indicator">
              @if (qrPaid()) {
                <nz-tag nzColor="success" class="tag-paid">ĐÃ NHẬN TIỀN THÀNH CÔNG</nz-tag>
              } @else {
                <nz-tag nzColor="processing" class="tag-waiting">Đang chờ khách chuyển khoản…</nz-tag>
                <small>Hệ thống tự động nhận diện giao dịch và xác nhận ngay.</small>
              }
            </div>
          }
        </div>
      </ng-container>
      <ng-template #qrModalFooter>
        @if (!qrPaid()) {
          <button nz-button (click)="manualConfirmQr()" [nzLoading]="confirmingQr()">
            Xác nhận đã nhận tiền (Thủ công)
          </button>
        }
        <button nz-button (click)="printFromQrModal()">
          In phiếu thanh toán / QR
        </button>
        <button nz-button nzType="primary" (click)="closeQrModal()">
          {{ qrPaid() ? 'Hoàn tất & Đơn mới' : 'Đóng' }}
        </button>
      </ng-template>
    </nz-modal>

    <!-- Modal Hóa đơn bán lẻ -->
    <nz-modal
      [(nzVisible)]="receiptModalVisible"
      [nzTitle]="'Hóa đơn bán hàng — Đơn #' + (activeReceiptOrder()?.publicCode || '')"
      [nzFooter]="receiptModalFooter"
      (nzOnCancel)="closeReceiptModal()"
      [nzWidth]="520">
      <ng-container *nzModalContent>
        @if (activeReceiptOrder(); as o) {
          <article class="receipt-preview" aria-labelledby="pos-receipt-heading">
            <header>
              <p class="brand-title">TU’S COFFEE</p>
              <h2 id="pos-receipt-heading">HÓA ĐƠN BÁN HÀNG</h2>
              <p class="code">#{{ o.publicCode }}</p>
            </header>
            <div class="receipt-meta">
              <p>{{ o.createdAt | date:'dd/MM/yyyy HH:mm':'+0700' }} · Tại quầy</p>
              <p>Khách hàng: <strong>{{ o.customerName }}</strong></p>
            </div>
            <table class="receipt-table">
              <thead>
                <tr>
                  <th class="col-name">Món</th>
                  <th class="col-qty">SL</th>
                  <th class="col-price">Đơn giá</th>
                  <th class="col-subtotal">T.Tiền</th>
                </tr>
              </thead>
              <tbody>
                @for (item of o.items; track item.id) {
                  <tr>
                    <td class="col-name">{{ item.productName }}</td>
                    <td class="col-qty">{{ item.quantity }}</td>
                    <td class="col-price">{{ item.unitPriceVnd | vnd }}</td>
                    <td class="col-subtotal">{{ item.subtotalVnd | vnd }}</td>
                  </tr>
                }
              </tbody>
            </table>
            <div class="receipt-total">
              <span>Tổng cộng:</span>
              <strong>{{ o.totalVnd | vnd }}</strong>
            </div>
            <div class="receipt-payment">
              <span>Hình thức: {{ o.payment?.method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản VietQR' }}</span>
              <strong [class.paid]="o.payment?.status === 'PAID'">
                {{ o.payment?.status === 'PAID' ? 'ĐÃ THANH TOÁN' : 'CHƯA THANH TOÁN' }}
              </strong>
            </div>
            @if (activeQrInstructions(); as p) {
              @if (p.qrUrl && o.payment?.status !== 'PAID') {
                <div class="receipt-qr-section">
                  <img [src]="p.qrUrl" alt="VietQR" width="160" height="160" />
                  <p>{{ p.bankAccountName }} · {{ p.bankAccount }}</p>
                  <p>Nội dung: <strong>{{ p.transferContent }}</strong></p>
                </div>
              }
            }
            @if (o.note) {
              <p class="receipt-note">Ghi chú: {{ o.note }}</p>
            }
            <footer>
              <p>Cảm ơn quý khách và hẹn gặp lại!</p>
            </footer>
          </article>
        }
      </ng-container>
      <ng-template #receiptModalFooter>
        <button nz-button nzType="primary" (click)="triggerPrint()">
          In hóa đơn
        </button>
        <button nz-button (click)="closeReceiptModal()">
          Tạo đơn mới
        </button>
      </ng-template>
    </nz-modal>
  `,
  styleUrl: './pos-page.scss',
})
export class PosPage {
  private readonly catalog = inject(CatalogService);
  private readonly pos = inject(PosService);
  private readonly orders = inject(OrderService, { optional: true });
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private searchTimer?: ReturnType<typeof setTimeout>;
  private searchRequest?: Subscription;
  private pollSubscription?: Subscription;

  readonly products = signal<Product[]>([]);
  readonly lines = signal<{ product: Product; quantity: number }[]>([]);
  readonly total = computed(() => this.lines().reduce((sum, l) => sum + l.product.priceVnd * l.quantity, 0));

  readonly busy = signal(false);
  readonly uncertain = signal(false);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly catalogError = signal('');

  readonly currentAction = signal<'SUBMIT' | 'CASH' | 'QR' | null>(null);

  // QR Modal states
  readonly qrModalVisible = signal(false);
  readonly activeQrOrder = signal<OrderResponse | null>(null);
  readonly activeQrInstructions = signal<PaymentInstructionsResponse | null>(null);
  readonly loadingQr = signal(false);
  readonly qrPaid = signal(false);
  readonly confirmingQr = signal(false);

  // Receipt Modal states
  readonly receiptModalVisible = signal(false);
  readonly activeReceiptOrder = signal<OrderResponse | null>(null);

  q = '';
  customerName = 'Khách lẻ';
  note = '';
  paymentMethod: 'CASH' | 'QR_TRANSFER' = 'CASH';

  private pending: { key: string; body: CreateOrderRequest } | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.searchTimer);
      this.searchRequest?.unsubscribe();
      this.pollSubscription?.unsubscribe();
    });
    this.search();
  }

  queueSearch(value: string) {
    this.q = value;
    clearTimeout(this.searchTimer);
    this.searchRequest?.unsubscribe();
    this.searchTimer = setTimeout(() => this.search(), 300);
  }

  search() {
    clearTimeout(this.searchTimer);
    this.searchRequest?.unsubscribe();
    this.loading.set(true);
    this.catalogError.set('');
    const query = { q: this.q.trim(), size: 100, categoryId: null, active: '' as const, sort: 'name' as const };
    this.searchRequest = this.catalog.products({ ...query, page: 0 })
      .pipe(
        expand(result => result.page + 1 < result.totalPages
          ? this.catalog.products({ ...query, page: result.page + 1 })
          : EMPTY),
        reduce((items, result) => items.concat(result.items), [] as Product[]),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: items => this.products.set(items),
        error: e => this.catalogError.set(apiError(e)),
      });
  }

  add(product: Product) {
    if (this.busy() || this.uncertain()) return;
    if (this.lines().some(l => l.product.id === product.id)) {
      this.quantity(product.id, 1);
      return;
    }
    if (this.lines().length >= 50) {
      this.error.set('Đơn chỉ được có tối đa 50 loại món.');
      return;
    }
    this.lines.update(lines => [...lines, { product, quantity: 1 }]);
  }

  quantity(id: number, delta: number) {
    if (this.busy() || this.uncertain()) return;
    this.lines.update(lines =>
      lines
        .map(l => l.product.id === id ? { ...l, quantity: Math.min(99, l.quantity + delta) } : l)
        .filter(l => l.quantity > 0)
    );
  }

  private buildRequestBody(method: 'CASH' | 'QR_TRANSFER'): CreateOrderRequest {
    return {
      items: this.lines().map(l => ({
        productId: l.product.id,
        quantity: l.quantity,
        expectedPriceVnd: l.product.priceVnd,
      })),
      customerName: this.customerName.trim() || 'Khách lẻ',
      note: this.note.trim() || null,
      paymentMethod: method,
    };
  }

  /**
   * 1-chạm: Thu tiền mặt & Mở hộp thoại in hóa đơn ngay lập tức
   */
  async submitCashAndPrint() {
    if (this.busy() || !this.lines().length || !this.customerName.trim()) return;
    if (this.total() > 100000000) {
      this.error.set('Đơn không được vượt quá 100.000.000 đ.');
      return;
    }

    const key = crypto.randomUUID();
    const body = this.buildRequestBody('CASH');

    this.busy.set(true);
    this.currentAction.set('CASH');
    this.error.set('');

    try {
      const order = await firstValueFrom(this.pos.create(body, key, true));
      this.activeReceiptOrder.set(order);
      this.activeQrInstructions.set(null);
      this.receiptModalVisible.set(true);

      // Reset giỏ hàng sẵn sàng cho đơn tiếp theo
      this.resetCart();

      // Tự động kích hoạt print sau một khoảng ngắn để modal render
      setTimeout(() => this.triggerPrint(), 350);
    } catch (e: unknown) {
      this.error.set(apiError(e));
    } finally {
      this.busy.set(false);
      this.currentAction.set(null);
    }
  }

  /**
   * 1-chạm: Tạo đơn và mở Modal quét VietQR ngay tại màn hình POS
   */
  async submitQrAndShowModal() {
    if (this.busy() || !this.lines().length || !this.customerName.trim()) return;
    if (this.total() > 100000000) {
      this.error.set('Đơn không được vượt quá 100.000.000 đ.');
      return;
    }

    const key = crypto.randomUUID();
    const body = this.buildRequestBody('QR_TRANSFER');

    this.busy.set(true);
    this.currentAction.set('QR');
    this.error.set('');

    try {
      const order = await firstValueFrom(this.pos.create(body, key, false));
      this.activeQrOrder.set(order);
      this.qrPaid.set(false);
      this.qrModalVisible.set(true);
      this.loadingQr.set(true);

      // Nạp thông tin VietQR
      if (this.orders) {
        try {
          const instructions = await firstValueFrom(this.orders.getPaymentInstructions(order.id));
          this.activeQrInstructions.set(instructions);
        } catch {
          // instructions optional
        }
      }
      this.loadingQr.set(false);

      // Bắt đầu polling lắng nghe webhook SePay cập nhật trạng thái thanh toán
      this.startQrPolling(order.id);
    } catch (e: unknown) {
      this.error.set(apiError(e));
    } finally {
      this.busy.set(false);
      this.currentAction.set(null);
    }
  }

  private startQrPolling(orderId: number) {
    this.pollSubscription?.unsubscribe();
    this.pollSubscription = interval(2500)
      .pipe(
        switchMap(() => this.pos.receipt(orderId)),
        takeWhile(o => o.payment?.status !== 'PAID', true)
      )
      .subscribe({
        next: latest => {
          this.activeQrOrder.set(latest);
          if (latest.payment?.status === 'PAID') {
            this.qrPaid.set(true);
            this.pollSubscription?.unsubscribe();
            // Nếu đơn chưa hoàn tất, chuyển sang COMPLETED
            if (latest.status !== 'COMPLETED' && this.orders) {
              this.orders.adminUpdateStatus(latest.id, {
                targetStatus: 'COMPLETED',
                version: latest.version,
                note: 'Tự động hoàn tất sau khi nhận thanh toán VietQR.',
              }).subscribe({
                next: completed => this.activeQrOrder.set(completed),
              });
            }
          }
        },
      });
  }

  async manualConfirmQr() {
    const o = this.activeQrOrder();
    if (!o || !this.orders) return;
    this.confirmingQr.set(true);
    try {
      const paid = await firstValueFrom(
        this.orders.adminConfirmPayment(o.id, {
          amountVnd: o.totalVnd,
          confirmationKey: 'MANUAL_POS_QR_' + o.id + '_' + Date.now(),
          version: o.version,
          reference: 'Thu ngân xác nhận tại quầy',
        })
      );
      this.activeQrOrder.set(paid);
      this.qrPaid.set(true);
      this.pollSubscription?.unsubscribe();

      if (paid.status !== 'COMPLETED') {
        const completed = await firstValueFrom(
          this.orders.adminUpdateStatus(o.id, {
            targetStatus: 'COMPLETED',
            version: paid.version,
            note: 'Hoàn tất đơn sau khi xác nhận thanh toán thủ công.',
          })
        );
        this.activeQrOrder.set(completed);
      }
    } catch (e: unknown) {
      this.error.set(apiError(e));
    } finally {
      this.confirmingQr.set(false);
    }
  }

  printFromQrModal() {
    const o = this.activeQrOrder();
    if (!o) return;
    this.activeReceiptOrder.set(o);
    this.receiptModalVisible.set(true);
    setTimeout(() => this.triggerPrint(), 350);
  }

  closeQrModal() {
    this.pollSubscription?.unsubscribe();
    this.qrModalVisible.set(false);
    if (this.qrPaid()) {
      this.resetCart();
    }
  }

  closeReceiptModal() {
    this.receiptModalVisible.set(false);
  }

  triggerPrint() {
    window.print();
  }

  private resetCart() {
    this.lines.set([]);
    this.customerName = 'Khách lẻ';
    this.note = '';
    this.pending = null;
    this.uncertain.set(false);
  }

  /**
   * Phương thức submit cũ (chuyển sang trang quản lý đơn) — giữ tương thích 100% với spec và test
   */
  async submit() {
    if (this.busy() || !this.lines().length || !this.customerName.trim()) return;
    if (this.total() > 100000000) {
      this.error.set('Đơn không được vượt quá 100.000.000 đ.');
      return;
    }
    this.pending ??= {
      key: crypto.randomUUID(),
      body: {
        items: this.lines().map(l => ({
          productId: l.product.id,
          quantity: l.quantity,
          expectedPriceVnd: l.product.priceVnd,
        })),
        customerName: this.customerName.trim(),
        note: this.note.trim() || null,
        paymentMethod: this.paymentMethod,
      },
    };
    this.busy.set(true);
    this.currentAction.set('SUBMIT');
    this.error.set('');
    try {
      const order = await firstValueFrom(this.pos.create(this.pending.body, this.pending.key));
      await this.router.navigate(['/admin/orders', order.id]);
    } catch (e: unknown) {
      const status = (e as { status?: number })?.status;
      this.uncertain.set(status === undefined || status === 0 || status >= 500);
      if (!this.uncertain()) this.pending = null;
      this.error.set(apiError(e));
    } finally {
      this.busy.set(false);
      this.currentAction.set(null);
    }
  }
}
