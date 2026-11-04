import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap, map, distinctUntilChanged, catchError, of } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { CatalogService } from '../../core/catalog/catalog.service';
import { Product } from '../../core/catalog/catalog.models';
import { ProductImage, VndPipe } from '../../core/catalog/catalog-ui';
@Component({
  selector: 'app-product-detail-page',
  imports: [RouterLink, NzButtonModule, NzAlertModule, ProductImage, VndPipe],
  template: `<section class="detail-page">
    <a class="back" routerLink="/menu">← Thực đơn</a>
    @if (busy()) {
      <p role="status">Đang tải sản phẩm…</p>
    }
    @if (error()) {
      <nz-alert nzType="error" [nzMessage]="error()" role="alert" /><button
        nz-button
        type="button"
        (click)="load()"
      >
        Thử lại
      </button>
    }
    @if (product(); as item) {
      <div class="detail-grid">
        <app-product-image [src]="item.imageUrl" [alt]="item.name" [eager]="true" />
        <div class="detail-copy">
          <span class="category">{{ item.category.name }}</span>
          <h1>{{ item.name }}</h1>
          <p class="price">{{ item.priceVnd | vnd }}</p>
          <p class="description">
            {{ item.description || 'Thông tin sản phẩm đang được cập nhật.' }}
          </p>
          <a nz-button nzSize="large" routerLink="/menu">Tiếp tục xem thực đơn</a>
        </div>
      </div>
    }
  </section>`,
  styles: `
    .detail-page {
      padding-block: 2rem 4rem;
    }
    .back {
      display: inline-flex;
      align-items: center;
      min-height: 44px;
      margin-bottom: 1.5rem;
    }
    .detail-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: clamp(1.5rem, 5vw, 4rem);
      align-items: center;
    }
    .detail-copy {
      padding-block: 1rem;
    }
    .category {
      color: var(--muted);
      font-size: 0.9rem;
    }
    h1 {
      overflow-wrap: anywhere;
      font-size: clamp(2rem, 5vw, 3.5rem);
      margin: 0.75rem 0 1rem;
      color: var(--text);
    }
    .price {
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--brand);
      margin: 0 0 1.5rem;
    }
    .description {
      white-space: pre-line;
      line-height: 1.8;
      color: var(--muted);
      margin-bottom: 2rem;
      overflow-wrap: anywhere;
    }
    nz-alert {
      display: block;
      margin-bottom: 1rem;
    }
    @media (max-width: 640px) {
      .detail-grid {
        grid-template-columns: 1fr;
        gap: 1rem;
      }
      .detail-page {
        padding-top: 1rem;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductDetailPage {
  private readonly api = inject(CatalogService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy = inject(DestroyRef);
  readonly product = signal<Product | null>(null);
  readonly busy = signal(true);
  readonly error = signal('');
  private id = 0;
  constructor() {
    this.route.paramMap
      .pipe(
        map((p) => Number(p.get('id'))),
        distinctUntilChanged(),
        switchMap((id) => {
          this.id = id;
          this.busy.set(true);
          this.error.set('');
          this.product.set(null);
          return this.request(id);
        }),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe((item) => {
        this.product.set(item);
        this.busy.set(false);
      });
  }
  private request(id: number) {
    if (!Number.isSafeInteger(id) || id < 1) {
      this.error.set('Sản phẩm không tồn tại hoặc đã ngừng bán.');
      return of(null);
    }
    return this.api.product(id).pipe(
      catchError((error) => {
        this.error.set(
          error instanceof HttpErrorResponse && error.status === 404
            ? 'Sản phẩm không tồn tại hoặc đã ngừng bán.'
            : 'Chưa tải được sản phẩm. Vui lòng thử lại.',
        );
        return of(null);
      }),
    );
  }
  load(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.request(this.id)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe((item) => {
        this.product.set(item);
        this.busy.set(false);
      });
  }
}
