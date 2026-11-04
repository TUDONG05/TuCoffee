import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzPaginationModule } from 'ng-zorro-antd/pagination';
import { CatalogService } from '../../../core/catalog/catalog.service';
import { Category, Product } from '../../../core/catalog/catalog.models';
import { ProductListState } from '../../../core/catalog/product-list-state';
import { ProductImage, VndPipe } from '../../../core/catalog/catalog-ui';
import { apiError } from '../../../core/auth/api-error';
@Component({
  selector: 'app-admin-products-page',
  imports: [
    ReactiveFormsModule,
    NzButtonModule,
    NzInputModule,
    NzSelectModule,
    NzFormModule,
    NzAlertModule,
    NzTableModule,
    NzModalModule,
    NzTagModule,
    NzPaginationModule,
    ProductImage,
    VndPipe,
  ],
  templateUrl: './products-page.html',
  styleUrl: './catalog-admin.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminProductsPage {
  private readonly api = inject(CatalogService);
  private readonly destroy = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  readonly list = new ProductListState(this.api, this.destroy, true);
  readonly categories = signal<Category[]>([]);
  readonly categoryError = signal('');
  readonly changing = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly open = signal(false);
  readonly selected = signal<Product | null>(null);
  readonly pending = signal<Product | null>(null);
  readonly formError = signal('');
  readonly imageProduct = signal<Product | null>(null);
  readonly imageError = signal('');
  readonly imageFile = signal<File | null>(null);
  readonly form = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    categoryId: this.fb.control<number | null>(null, [Validators.required]),
    description: this.fb.nonNullable.control('', [Validators.maxLength(10000)]),
    priceVnd: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(0),
      Validators.max(100000000),
      Validators.pattern(/^\d+$/),
    ]),
  });
  constructor() {
    this.loadCategories();
  }
  loadCategories(): void {
    this.categoryError.set('');
    this.api
      .categories(true)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (items) => this.categories.set(items),
        error: () =>
          this.categoryError.set(
            'Chưa tải được danh mục. Vui lòng thử lại trước khi lưu sản phẩm.',
          ),
      });
  }
  edit(product: Product | null = null): void {
    if (this.changing()) return;
    this.selected.set(product);
    this.formError.set('');
    this.form.reset({
      name: product?.name ?? '',
      categoryId: product?.category.id ?? null,
      description: product?.description ?? '',
      priceVnd: product?.priceVnd ?? null,
    });
    this.open.set(true);
  }
  close(): void {
    if (!this.changing()) this.open.set(false);
  }
  async save(): Promise<void> {
    if (this.changing()) return;
    this.form.controls.name.setValue(this.form.controls.name.value.trim());
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    const input = {
      name: value.name,
      categoryId: value.categoryId!,
      description: value.description.trim() || null,
      priceVnd: value.priceVnd!,
    };
    this.changing.set(true);
    this.formError.set('');
    try {
      const product = this.selected();
      await firstValueFrom(
        product ? this.api.updateProduct(product, input) : this.api.createProduct(input),
      );
      if (this.destroy.destroyed) return;
      this.open.set(false);
      this.message.set(
        product ? 'Đã cập nhật sản phẩm.' : 'Đã thêm sản phẩm. Bạn có thể tải ảnh trong danh sách.',
      );
      this.list.load();
    } catch (error) {
      if (!this.destroy.destroyed) this.formError.set(apiError(error));
    } finally {
      if (!this.destroy.destroyed) this.changing.set(false);
    }
  }
  async toggle(): Promise<void> {
    const product = this.pending();
    if (!product || this.changing()) return;
    this.changing.set(true);
    this.error.set('');
    try {
      await firstValueFrom(this.api.toggleProduct(product));
      if (this.destroy.destroyed) return;
      this.pending.set(null);
      this.message.set(product.active ? 'Đã ngừng bán sản phẩm.' : 'Đã bật bán sản phẩm.');
      this.list.load();
    } catch (error) {
      if (!this.destroy.destroyed) this.error.set(apiError(error));
    } finally {
      if (!this.destroy.destroyed) this.changing.set(false);
    }
  }
  openImage(product: Product): void {
    if (this.changing()) return;
    this.imageProduct.set(product);
    this.imageFile.set(null);
    this.imageError.set('');
  }
  chooseImage(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.imageFile.set(null);
    this.imageError.set('');
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      this.imageError.set('Ảnh tối đa 5 MB.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.imageError.set('Chỉ chọn ảnh JPEG, PNG hoặc WebP.');
      return;
    }
    this.imageFile.set(file);
  }
  async upload(): Promise<void> {
    const product = this.imageProduct();
    const file = this.imageFile();
    if (!product || !file || this.changing()) return;
    this.changing.set(true);
    this.imageError.set('');
    try {
      await firstValueFrom(this.api.uploadImage(product, file));
      if (this.destroy.destroyed) return;
      this.imageProduct.set(null);
      this.message.set('Đã cập nhật ảnh sản phẩm.');
      this.list.load();
    } catch (error) {
      if (!this.destroy.destroyed) this.imageError.set(apiError(error));
    } finally {
      if (!this.destroy.destroyed) this.changing.set(false);
    }
  }
  closeImage(): void {
    if (!this.changing()) this.imageProduct.set(null);
  }
  invalid(field: 'name' | 'categoryId' | 'description' | 'priceVnd'): boolean {
    const c = this.form.controls[field];
    return c.touched && c.invalid;
  }
}
