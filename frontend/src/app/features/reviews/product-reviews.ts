import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { Review, ReviewPage, ReviewService } from '../../core/reviews/review.service';

@Component({
  selector: 'app-product-reviews',
  imports: [FormsModule, DatePipe, DecimalPipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section aria-labelledby="reviews-title">
    <h2 id="reviews-title">Đánh giá từ khách hàng</h2>
    @if (data(); as result) {
      <p>{{ result.summary.average | number:'1.1-1' }} / 5 · {{ result.summary.count }} đánh giá</p>
      @for (review of result.items; track review.id) {
        <article><strong>{{ review.authorName }}</strong> · {{ review.stars }} / 5
          <time>{{ review.createdAt | date:'dd/MM/yyyy' }}</time><p class="comment">{{ review.comment }}</p>
        </article>
      } @empty { <p>Chưa có đánh giá nào.</p> }
      <div class="pages"><button type="button" [disabled]="busy() || result.page === 0" (click)="load(result.page - 1)">Trước</button>
        <span>Trang {{ result.page + 1 }} / {{ result.totalPages || 1 }}</span>
        <button type="button" [disabled]="busy() || result.page + 1 >= result.totalPages" (click)="load(result.page + 1)">Sau</button></div>
    }
    @if (busy()) { <p role="status">Đang tải đánh giá…</p> }
    @if (error()) { <p role="alert">{{ error() }}</p><button type="button" (click)="load()">Tải lại</button> }
    @if (!auth.user()) { <p><a routerLink="/login">Đăng nhập</a> để đánh giá sản phẩm đã mua.</p> }
    @else if (eligible()) {
      <form (ngSubmit)="save()"><h3>{{ own() ? 'Sửa đánh giá của bạn' : 'Viết đánh giá' }}</h3>
        @if (own() && !own()!.visible) { <p>Đánh giá đang được ẩn. Việc sửa nội dung không tự khôi phục hiển thị.</p> }
        <label>Số sao <select name="stars" [(ngModel)]="stars" required>
          @for (star of [1,2,3,4,5]; track star) { <option [ngValue]="star">{{ star }} / 5</option> }
        </select></label>
        <label>Nội dung <textarea name="comment" [(ngModel)]="comment" maxlength="2000" rows="4"></textarea></label>
        <small>{{ comment.length }} / 2000 ký tự</small>
        <button type="submit" [disabled]="saving()">{{ saving() ? 'Đang lưu…' : 'Lưu đánh giá' }}</button>
      </form>
    } @else { <p>Bạn có thể đánh giá sau khi đơn hàng có sản phẩm này hoàn tất.</p> }
    @if (notice()) { <p role="status">{{ notice() }}</p> }
  </section>`,
  styles: `section{margin-top:3rem;border-top:1px solid #ddd;padding-top:2rem}article{border-bottom:1px solid #eee;padding:1rem 0}time{float:right;color:var(--muted)}.comment{white-space:pre-wrap;overflow-wrap:anywhere}form{display:grid;gap:.75rem;max-width:40rem;margin-top:2rem}label{display:grid;gap:.4rem}textarea,select,button{padding:.7rem;border:1px solid #ccc;border-radius:6px;font:inherit}button{cursor:pointer;min-height:44px}button:disabled{cursor:default;opacity:.5}.pages{display:flex;align-items:center;gap:1rem;margin:1rem 0}`,
})
export class ProductReviews {
  readonly productId = input.required<number>();
  readonly auth = inject(AuthService);
  private readonly api = inject(ReviewService);
  readonly data = signal<ReviewPage | null>(null);
  readonly own = signal<Review | null>(null);
  readonly eligible = signal(false);
  readonly busy = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  stars = 5;
  comment = '';
  private generation = 0;
  constructor() { effect(() => { const id = this.productId(); const user = this.auth.user(); void this.refresh(id, !!user); }); }
  private async refresh(id: number, signedIn: boolean) {
    const generation = ++this.generation;
    this.own.set(null); this.eligible.set(false); this.comment = ''; this.stars = 5;
    void this.load();
    if (!signedIn) return;
    try {
      const mine = await firstValueFrom(this.api.mine(id));
      if (generation !== this.generation) return;
      this.own.set(mine.review); this.eligible.set(mine.eligible);
      if (mine.review) { this.stars = mine.review.stars; this.comment = mine.review.comment ?? ''; }
    } catch { if (generation === this.generation) this.error.set('Chưa tải được quyền đánh giá. Vui lòng tải lại trang.'); }
  }
  async load(page = 0) {
    const id = this.productId(); this.busy.set(true); this.error.set('');
    try { const result = await firstValueFrom(this.api.list(id, page)); if (id === this.productId()) this.data.set(result); }
    catch { this.error.set('Không tải được đánh giá. Vui lòng thử lại.'); }
    finally { this.busy.set(false); }
  }
  async save() {
    if (this.saving()) return;
    this.saving.set(true); this.notice.set('');
    try {
      const review = await firstValueFrom(this.api.write(this.productId(), this.stars, this.comment, this.own()?.version ?? null));
      this.own.set(review); this.notice.set('Đã lưu đánh giá.'); await this.load();
    } catch { this.notice.set('Chưa lưu được. Nếu đánh giá đã thay đổi, hãy tải lại trang trước khi sửa tiếp.'); }
    finally { this.saving.set(false); }
  }
}
