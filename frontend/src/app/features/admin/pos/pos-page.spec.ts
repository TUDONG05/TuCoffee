import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { PosPage } from './pos-page';
import { PosService } from '../../../core/pos/pos.service';
import { CatalogService } from '../../../core/catalog/catalog.service';
import { Product } from '../../../core/catalog/catalog.models';
import { OrderResponse } from '../../../core/order/order.models';

const product: Product = { id: 1, name: 'Coffee', description: null, priceVnd: 30000, imageUrl: null, active: true, version: 0, category: { id: 1, name: 'Coffee', slug: 'coffee', active: true, version: 0 } };

describe('POS submission safety', () => {
  let page: PosPage;
  let create: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;
  let products: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    create = vi.fn(); navigate = vi.fn().mockResolvedValue(true);
    products = vi.fn().mockReturnValue(of({ items: [product], page: 0, totalPages: 1 }));
    TestBed.configureTestingModule({ providers: [
      { provide: CatalogService, useValue: { products } },
      { provide: PosService, useValue: { create } }, { provide: Router, useValue: { navigate } },
    ] });
    page = TestBed.runInInjectionContext(() => new PosPage());
    page.add(product);
  });

  it('loads all matching products across API pages', () => {
    const second = { ...product, id: 2, name: 'Tea' };
    products.mockImplementation(({ page: index }) => of({
      items: index === 0 ? [product] : [second], page: index, totalPages: 2,
    }));
    page.search();
    expect(page.products()).toEqual([product, second]);
    expect(products.mock.calls.at(-1)![0]).toMatchObject({ page: 1 });
  });

  it('searches the latest typed query after 300ms', () => {
    vi.useFakeTimers();
    try {
      page.queueSearch('c');
      vi.advanceTimersByTime(150);
      page.queueSearch('coffee');
      vi.advanceTimersByTime(299);
      expect(products).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1);
      expect(products).toHaveBeenCalledTimes(2);
      expect(products.mock.calls[1][0]).toMatchObject({ q: 'coffee', page: 0 });
    } finally { vi.useRealTimers(); }
  });

  it('cancels the previous result when typing and clears the query without Enter', () => {
    vi.useFakeTimers();
    try {
      const oldResponse = new Subject<any>();
      products.mockReturnValueOnce(oldResponse);
      page.search();
      page.queueSearch('');
      expect(oldResponse.observed).toBe(false);
      oldResponse.next({ items: [], page: 8, totalPages: 9 });
      vi.advanceTimersByTime(300);
      expect(products.mock.calls.at(-1)![0]).toMatchObject({ q: '', page: 0 });
      expect(page.products()).toEqual([product]);
      expect(page.loading()).toBe(false);
    } finally { vi.useRealTimers(); }
  });

  it('allows only one in-flight submission and navigates to the returned order', async () => {
    const response = new Subject<OrderResponse>(); create.mockReturnValue(response);
    const pending = page.submit(); await page.submit();
    page.add({ ...product, id: 2 }); page.quantity(1, 1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(page.lines()).toHaveLength(1); expect(page.lines()[0].quantity).toBe(1);
    response.next({ id: 9 } as OrderResponse); await pending;
    expect(navigate).toHaveBeenCalledWith(['/admin/orders', 9]);
    expect(page.busy()).toBe(false);
  });

  it('retries an ambiguous failure with the same key and immutable body', async () => {
    create.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    await page.submit();
    const [body, key] = create.mock.calls[0];
    page.customerName = 'Changed'; page.note = 'Changed'; page.paymentMethod = 'QR_TRANSFER';
    page.add({ ...product, id: 2 }); page.quantity(1, 1);
    expect(page.uncertain()).toBe(true);
    await page.submit();
    expect(create.mock.calls[1]).toEqual([body, key]);
    expect(body.customerName).not.toBe('Changed'); expect(body.paymentMethod).toBe('CASH');
    expect(page.lines()[0].quantity).toBe(1);
  });

  it('releases a rejected request so corrections use a fresh key and body', async () => {
    create.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    await page.submit(); const key = create.mock.calls[0][1];
    expect(page.uncertain()).toBe(false);
    page.quantity(1, 1); await page.submit();
    expect(create.mock.calls[1][1]).not.toBe(key);
    expect(create.mock.calls[1][0].items[0].quantity).toBe(2);
  });

  it('enforces quantity and total boundaries before sending an order', async () => {
    for (let i = 0; i < 110; i++) page.add(product);
    expect(page.lines()[0].quantity).toBe(99);
    page.lines.set([{ product: { ...product, priceVnd: 100000001 }, quantity: 1 }]);
    await page.submit(); expect(create).not.toHaveBeenCalled(); expect(page.error()).toBeTruthy();
  });
});
