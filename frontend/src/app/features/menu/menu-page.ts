import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzPaginationModule } from 'ng-zorro-antd/pagination';
import { CatalogService } from '../../core/catalog/catalog.service';
import { Category } from '../../core/catalog/catalog.models';
import { ProductListState } from '../../core/catalog/product-list-state';
import { ProductImage, VndPipe } from '../../core/catalog/catalog-ui';
@Component({
  selector: 'app-menu-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NzInputModule,
    NzSelectModule,
    NzButtonModule,
    NzAlertModule,
    NzPaginationModule,
    ProductImage,
    VndPipe,
  ],
  templateUrl: './menu-page.html',
  styleUrl: './menu-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MenuPage {
  private readonly api = inject(CatalogService);
  private readonly destroy = inject(DestroyRef);
  readonly list = new ProductListState(this.api, this.destroy);
  readonly categories = signal<Category[]>([]);
  readonly categoryError = signal(false);
  constructor() {
    this.loadCategories();
  }
  loadCategories(): void {
    this.categoryError.set(false);
    this.api
      .categories()
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (items) => this.categories.set(items),
        error: () => this.categoryError.set(true),
      });
  }
}
