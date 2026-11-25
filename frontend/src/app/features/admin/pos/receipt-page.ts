import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { PosService } from '../../../core/pos/pos.service';
import { OrderResponse, PaymentInstructionsResponse } from '../../../core/order/order.models';
import { OrderService } from '../../../core/order/order.service';
import { VndPipe } from '../../../core/catalog/catalog-ui';
import { apiError } from '../../../core/auth/api-error';

@Component({
  selector: 'app-receipt-page',
  imports: [DatePipe, RouterLink, NzButtonModule, NzAlertModule, VndPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="controls"><a routerLink="/admin/pos">← Bán tại quầy</a>@if (order(); as o) { <a [routerLink]="['/admin/orders', o.id]">Xử lý đơn</a><button nz-button type="button" (click)="print()">In / Lưu PDF</button> }</div>
    @if (loading()) { <p role="status">Đang tải hóa đơn…</p> }
    @if (error()) { <nz-alert nzType="error" [nzMessage]="error()" /><button nz-button type="button" (click)="load()">Thử lại</button> }
    @if (order(); as o) {
      <article class="receipt" aria-labelledby="receipt-heading">
        <header><p>TU’S COFFEE</p><h1 id="receipt-heading">Hóa đơn bán hàng</h1><p>#{{ o.publicCode }}</p></header>
        <p>{{ o.createdAt | date:'dd/MM/yyyy HH:mm':'+0700' }} · {{ o.source === 'POS' ? 'Tại quầy' : 'Trực tuyến' }}</p>
        <p>Khách hàng: {{ o.customerName }}</p>
        <table><caption>Chi tiết món</caption><thead><tr><th>Món</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead><tbody>@for (item of o.items; track item.id) { <tr><td>{{ item.productName }}</td><td>{{ item.quantity }}</td><td>{{ item.unitPriceVnd | vnd }}</td><td>{{ item.subtotalVnd | vnd }}</td></tr> }</tbody></table>
        <p class="total"><span>Tổng cộng</span><strong>{{ o.totalVnd | vnd }}</strong></p>
        <p>{{ o.payment?.method === 'CASH' ? 'Tiền mặt' : o.payment?.method === 'QR_TRANSFER' ? 'Chuyển khoản' : 'VNPAY' }} · <strong>{{ o.payment?.status === 'PAID' ? 'Đã thanh toán' : 'Chưa thanh toán' }}</strong></p>
        @if (o.status === 'CANCELLED') { <p><strong>Đơn hàng đã hủy</strong></p> }
        @if (instructions(); as p) { @if (p.qrUrl && o.payment?.status !== 'PAID' && o.status !== 'CANCELLED') { <section class="qr"><h2>Chuyển khoản thanh toán</h2><img [src]="p.qrUrl" alt="Mã VietQR theo số tiền và mã đơn" width="220" height="220" /><p>{{ p.bankAccountName }} · {{ p.bankAccount }}</p><p>Nội dung: <strong>{{ p.transferContent }}</strong></p><small>QR không phải xác nhận đã nhận tiền.</small></section> } }
        @if (o.note) { <p>Ghi chú: {{ o.note }}</p> }
        <footer><p>Cảm ơn bạn đã ghé Tu’s Coffee!</p><small>Phiếu bán hàng, không phải hóa đơn thuế.</small></footer>
      </article>
    }`,
  styles: `:host{display:block;padding:2rem 0}.controls{display:flex;gap:1rem;align-items:center;flex-wrap:wrap;margin-bottom:1.5rem}.receipt{max-width:720px;margin:auto;background:white;color:#251b16;padding:2rem;border:1px solid #ddd}header,footer,.qr{text-align:center}header p:first-child{letter-spacing:.2em}h1{font-size:1.6rem}table{width:100%;border-collapse:collapse;margin:1.5rem 0}caption{text-align:left;margin-bottom:.75rem}th,td{padding:.7rem .3rem;text-align:right;border-bottom:1px dashed #ccc}th:first-child,td:first-child{text-align:left}.total{display:flex;justify-content:space-between;font-size:1.2rem}footer{margin-top:2rem}small{color:#6d6058}.qr img{max-width:100%;height:auto}@media(max-width:480px){.receipt{padding:1rem}th,td{font-size:.8rem}}@media print{.controls{display:none}.receipt{border:0;padding:0;max-width:none}.qr{break-inside:avoid}tr{break-inside:avoid}:host{padding:0}}`,
})
export class ReceiptPage {
  private readonly route = inject(ActivatedRoute);
  private readonly pos = inject(PosService);
  private readonly orders = inject(OrderService);
  readonly order = signal<OrderResponse | null>(null);
  readonly instructions = signal<PaymentInstructionsResponse | null>(null);
  readonly error = signal('');
  readonly loading = signal(false);
  constructor() { void this.load(); }
  async load() {
    this.loading.set(true); this.error.set('');
    const id = Number(this.route.snapshot.paramMap.get('id'));
    try {
      const order = await firstValueFrom(this.pos.receipt(id));
      this.order.set(order);
      if (order.payment?.method === 'QR_TRANSFER' && order.payment.status !== 'PAID' && order.status !== 'CANCELLED') {
        this.instructions.set(await firstValueFrom(this.orders.getPaymentInstructions(id)));
      }
    } catch (e) { this.error.set(apiError(e)); }
    finally { this.loading.set(false); }
  }
  print() { window.print(); }
}
