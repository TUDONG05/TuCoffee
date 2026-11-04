import { DestroyRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { CatalogService } from './catalog.service';
import { ProductQuery } from './catalog.models';
import { ProductListState } from './product-list-state';

describe('product list pagination', () => {
  const products = vi.fn((query: ProductQuery, _admin: boolean) => of({
    items: [], page: query.page, size: query.size, totalItems: 23, totalPages: Math.ceil(23 / query.size),
  }));
  beforeEach(() => {
    products.mockClear();
    TestBed.configureTestingModule({});
  });

  function create(admin: boolean) {
    return new ProductListState({ products } as unknown as CatalogService, TestBed.inject(DestroyRef), admin);
  }

  it('requests ten admin products per page and retains filters when changing pages', () => {
    const state = create(true);
    expect(products.mock.lastCall?.[0].size).toBe(10);
    expect(state.result().size).toBe(10);
    state.filters.patchValue({ q: '  cà phê  ', categoryId: 3, active: 'true', sort: 'priceAsc' }, { emitEvent: false });
    state.load(1);
    expect(products.mock.lastCall).toEqual([{ q: 'cà phê', categoryId: 3, active: 'true', sort: 'priceAsc', page: 1, size: 10 }, true]);
  });

  it('preserves twelve products per page in the customer menu', () => {
    const state = create(false);
    state.load(1);
    expect(products.mock.lastCall?.[0].size).toBe(12);
    expect(products.mock.lastCall?.[1]).toBe(false);
    expect(state.result().size).toBe(12);
  });
});
