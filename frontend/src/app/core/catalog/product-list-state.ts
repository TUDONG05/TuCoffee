import { DestroyRef, signal } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  EMPTY,
  Subject,
  catchError,
  debounceTime,
  defer,
  distinctUntilChanged,
  finalize,
  map,
  merge,
  startWith,
  switchMap,
} from 'rxjs';
import { apiError } from '../auth/api-error';
import { CatalogService } from './catalog.service';
import { CatalogSort, ProductPage, ProductQuery } from './catalog.models';
export class ProductListState {
  readonly filters = new FormGroup({
    q: new FormControl('', { nonNullable: true }),
    categoryId: new FormControl<number | null>(null),
    active: new FormControl<'' | 'true' | 'false'>('', { nonNullable: true }),
    sort: new FormControl<CatalogSort>('id', { nonNullable: true }),
  });
  readonly page = signal(0);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly result = signal<ProductPage>({
    items: [],
    page: 0,
    size: 12,
    totalItems: 0,
    totalPages: 0,
  });
  private readonly manual = new Subject<ProductQuery>();
  constructor(api: CatalogService, destroy: DestroyRef, admin = false, readonly pageSize = admin ? 10 : 12) {
    this.result.update(result => ({ ...result, size: this.pageSize }));
    const changes = this.filters.valueChanges.pipe(
      debounceTime(300),
      map(() => this.query(0)),
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
    );
    merge(changes, this.manual)
      .pipe(
        startWith(this.query(0)),
        switchMap((query) =>
          defer(() => {
            this.page.set(query.page);
            this.busy.set(true);
            this.error.set('');
            return api.products(query, admin).pipe(
              catchError((error) => {
                this.error.set(apiError(error));
                return EMPTY;
              }),
              finalize(() => this.busy.set(false)),
            );
          }),
        ),
        takeUntilDestroyed(destroy),
      )
      .subscribe((result) => this.result.set(result));
  }
  private query(page: number): ProductQuery {
    const f = this.filters.getRawValue();
    return { ...f, q: f.q.trim(), page, size: this.pageSize };
  }
  load(page = this.page()): void {
    this.manual.next(this.query(page));
  }
  clear(): void {
    this.filters.reset({ q: '', categoryId: null, active: '', sort: 'id' });
    this.load(0);
  }
}
