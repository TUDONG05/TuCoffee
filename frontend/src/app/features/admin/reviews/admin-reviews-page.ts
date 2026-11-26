import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Review, ReviewDetail, ReviewPage, ReviewService } from '../../../core/reviews/review.service';

@Component({
  selector: 'app-admin-reviews-page',
  imports: [FormsModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1>Quản lý đánh giá</h1>
    <form class="filters" (ngSubmit)="load()">
      <label>Mã sản phẩm<input name="product" type="number" min="1" step="1" [(ngModel)]="productId" /></label>
      <label>Số sao<select name="stars" [(ngModel)]="stars"><option [ngValue]="undefined">Tất cả</option>
        @for (star of [1,2,3,4,5]; track star) { <option [ngValue]="star">{{ star }} sao</option> }</select></label>
      <label>Hiển thị<select name="visibility" [(ngModel)]="visible"><option [ngValue]="undefined">Tất cả</option><option [ngValue]="true">Đang hiện</option><option [ngValue]="false">Đang ẩn</option></select></label>
      <button type="submit" [disabled]="busy()">Lọc đánh giá</button>
    </form>
    @if (message()) { <p role="status">{{ message() }}</p> }
    @if (busy()) { <p role="status">Đang tải…</p> }
    @if (data(); as result) {
      <p>{{ result.totalItems }} đánh giá phù hợp</p>
      <div class="table-scroll"><table><thead><tr><th>Sản phẩm</th><th>Khách hàng</th><th>Sao</th><th>Hiển thị</th><th>Ngày</th><th>Thao tác</th></tr></thead>
        <tbody>@for (review of result.items; track review.id) {
          <tr><td>{{ review.productName }} (#{{ review.productId }})</td><td>{{ review.authorName }}</td><td>{{ review.stars }}</td><td>{{ review.visible ? 'Đang hiện' : 'Đang ẩn' }}</td><td>{{ review.createdAt | date:'dd/MM/yyyy HH:mm' }}</td><td><button type="button" (click)="open(review.id)">Xem chi tiết</button></td></tr>
        } @empty { <tr><td colspan="6">Không có đánh giá phù hợp.</td></tr> }</tbody></table></div>
      <div class="pages"><button type="button" [disabled]="busy() || result.page === 0" (click)="load(result.page - 1)">Trước</button><span>Trang {{ result.page + 1 }} / {{ result.totalPages || 1 }}</span><button type="button" [disabled]="busy() || result.page + 1 >= result.totalPages" (click)="load(result.page + 1)">Sau</button></div>
    }
    @if (detail(); as selected) {
      <section aria-labelledby="detail-title"><h2 id="detail-title">Đánh giá #{{ selected.review.id }}</h2>
        <p>{{ selected.review.authorName }} · {{ selected.review.productName }} · {{ selected.review.stars }} sao</p>
        <p class="comment">{{ selected.review.comment || '(Không có nội dung)' }}</p>
        <p>Trạng thái: {{ selected.review.visible ? 'Đang hiện' : 'Đang ẩn' }} · Phiên bản {{ selected.review.version }}</p>
        <form (ngSubmit)="moderate(selected.review)"><label>Lý do {{ selected.review.visible ? 'ẩn' : 'khôi phục' }}<textarea name="reason" [(ngModel)]="reason" required maxlength="500" rows="3"></textarea></label>
          <button type="submit" [disabled]="saving() || !reason.trim()">{{ saving() ? 'Đang lưu…' : selected.review.visible ? 'Ẩn đánh giá' : 'Khôi phục đánh giá' }}</button>
          <button type="button" [disabled]="saving()" (click)="detail.set(null)">Đóng</button></form>
        <h3>Lịch sử kiểm duyệt</h3>
        @for (event of selected.events; track event.id) { <article><strong>{{ event.actorName }}</strong> · {{ event.visible ? 'Khôi phục' : 'Ẩn' }} · {{ event.createdAt | date:'dd/MM/yyyy HH:mm' }} · v{{ event.reviewVersion }}<p class="comment">{{ event.reason }}</p></article> }
        @empty { <p>Chưa có thay đổi hiển thị.</p> }
      </section>
    }`,
  styles: `:host{display:block;padding:2rem 0}h1{margin:.3rem 0}.filters{display:flex;flex-wrap:wrap;gap:1rem;align-items:end;margin:1.5rem 0}label{display:grid;gap:.4rem}input,select,textarea,button{font:inherit;padding:.6rem;border:1px solid #ccc;border-radius:6px}button{cursor:pointer;min-height:44px}button:disabled{opacity:.5;cursor:default}.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse}th,td{padding:.8rem;border-bottom:1px solid #ddd;text-align:left}.pages{display:flex;gap:1rem;align-items:center;margin:1rem 0}section{margin-top:2rem;padding:1.5rem;border:1px solid #ddd;border-radius:8px}textarea{width:min(100%,40rem)}section form{display:grid;gap:.75rem;max-width:40rem}.comment{white-space:pre-wrap;overflow-wrap:anywhere}article{border-top:1px solid #eee;padding-top:1rem}`,
})
export class AdminReviewsPage {
  private readonly api = inject(ReviewService);
  readonly data = signal<ReviewPage | null>(null);
  readonly detail = signal<ReviewDetail | null>(null);
  readonly busy = signal(false);
  readonly saving = signal(false);
  readonly message = signal('');
  productId: number | undefined;
  stars: number | undefined;
  visible: boolean | undefined;
  reason = '';
  constructor() { void this.load(); }
  async load(page = 0) {
    this.busy.set(true); this.message.set('');
    try { this.data.set(await firstValueFrom(this.api.admin({ productId: this.productId || undefined, stars: this.stars, visible: this.visible, page }))); }
    catch { this.message.set('Không tải được đánh giá. Kiểm tra bộ lọc và thử lại.'); }
    finally { this.busy.set(false); }
  }
  async open(id: number) {
    this.reason = ''; this.message.set('');
    try { this.detail.set(await firstValueFrom(this.api.detail(id))); }
    catch { this.message.set('Không tải được chi tiết đánh giá.'); }
  }
  async moderate(review: Review) {
    if (this.saving() || !this.reason.trim()) return;
    this.saving.set(true);
    try {
      await firstValueFrom(this.api.moderate(review, !review.visible, this.reason));
      await this.open(review.id); await this.load(this.data()?.page ?? 0);
      this.message.set('Đã cập nhật hiển thị và ghi lịch sử kiểm duyệt.');
    } catch { this.message.set('Không lưu được. Đánh giá có thể đã thay đổi; tải lại chi tiết trước khi thử lại.'); }
    finally { this.saving.set(false); }
  }
}
