import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, firstValueFrom } from 'rxjs';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzPaginationModule } from 'ng-zorro-antd/pagination';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { Category } from '../../../core/catalog/catalog.models';
import { CatalogService } from '../../../core/catalog/catalog.service';
import { apiError } from '../../../core/auth/api-error';
@Component({
  selector: 'app-admin-categories-page',
  imports: [
    ReactiveFormsModule,
    NzButtonModule,
    NzInputModule,
    NzSelectModule,
    NzPaginationModule,
    NzFormModule,
    NzAlertModule,
    NzTableModule,
    NzModalModule,
    NzTagModule,
  ],
  templateUrl: './categories-page.html',
  styleUrl: './catalog-admin.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminCategoriesPage {
  private readonly api = inject(CatalogService);
  private readonly destroy = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  readonly items = signal<Category[]>([]);
  readonly pageSize = 10;
  readonly page = signal(0);
  readonly filters = this.fb.nonNullable.group({ q: '', active: '' });
  private readonly appliedFilters = signal({ q: '', active: '' });
  readonly filteredItems = computed(() => {
    const { q, active } = this.appliedFilters();
    return this.items().filter(
      (item) =>
        (!q || item.name.toLowerCase().includes(q) || item.slug.toLowerCase().includes(q)) &&
        (active === '' || item.active === (active === 'true')),
    );
  });
  readonly total = computed(() => this.filteredItems().length);
  readonly pageItems = computed(() =>
    this.filteredItems().slice(this.page() * this.pageSize, (this.page() + 1) * this.pageSize),
  );
  readonly loading = signal(false);
  readonly changing = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly open = signal(false);
  readonly selected = signal<Category | null>(null);
  readonly pending = signal<Category | null>(null);
  readonly formError = signal('');
  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    slug: [
      '',
      [
        Validators.required,
        Validators.maxLength(120),
        Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      ],
    ],
  });
  constructor() {
    this.filters.valueChanges
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroy))
      .subscribe(() => this.applyFilters());
    this.load();
  }
  private applyFilters(): void {
    const value = this.filters.getRawValue();
    const next = { q: value.q.trim().toLowerCase(), active: value.active };
    const previous = this.appliedFilters();
    if (next.q !== previous.q || next.active !== previous.active) {
      this.appliedFilters.set(next);
      this.page.set(0);
    }
  }
  search(): void {
    this.applyFilters();
    this.page.set(0);
  }
  setPage(page: number): void {
    const last = Math.max(0, Math.ceil(this.total() / this.pageSize) - 1);
    this.page.set(Math.max(0, Math.min(page, last)));
  }
  load(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.api
      .categories(true)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (items) => {
          this.items.set(items);
          this.setPage(this.page());
          this.loading.set(false);
        },
        error: (error) => {
          this.error.set(apiError(error));
          this.loading.set(false);
        },
      });
  }
  edit(category: Category | null = null): void {
    if (this.changing()) return;
    this.selected.set(category);
    this.formError.set('');
    this.form.reset({ name: category?.name ?? '', slug: category?.slug ?? '' });
    this.open.set(true);
  }
  close(): void {
    if (!this.changing()) this.open.set(false);
  }
  async save(): Promise<void> {
    if (this.changing()) return;
    const value = this.form.getRawValue();
    this.form.setValue({ name: value.name.trim(), slug: value.slug.trim() });
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.changing.set(true);
    this.formError.set('');
    try {
      const selected = this.selected();
      const input = this.form.getRawValue();
      await firstValueFrom(
        selected ? this.api.updateCategory(selected, input) : this.api.createCategory(input),
      );
      if (this.destroy.destroyed) return;
      this.open.set(false);
      this.message.set(selected ? 'Đã cập nhật danh mục.' : 'Đã thêm danh mục.');
      this.load();
    } catch (error) {
      if (!this.destroy.destroyed) this.formError.set(apiError(error));
    } finally {
      if (!this.destroy.destroyed) this.changing.set(false);
    }
  }
  async toggle(): Promise<void> {
    const category = this.pending();
    if (!category || this.changing()) return;
    this.changing.set(true);
    this.error.set('');
    try {
      await firstValueFrom(this.api.toggleCategory(category));
      if (this.destroy.destroyed) return;
      this.pending.set(null);
      this.message.set(
        category.active
          ? 'Đã ngừng hoạt động danh mục và ẩn các món thuộc danh mục khỏi thực đơn.'
          : 'Đã bật lại danh mục.',
      );
      this.load();
    } catch (error) {
      if (!this.destroy.destroyed) this.error.set(apiError(error));
    } finally {
      if (!this.destroy.destroyed) this.changing.set(false);
    }
  }
  invalid(field: 'name' | 'slug'): boolean {
    const c = this.form.controls[field];
    return c.touched && c.invalid;
  }
}
