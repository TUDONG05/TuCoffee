import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PosService } from './pos.service';

describe('POS API contract', () => {
  let service: PosService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(PosService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('preserves the request key and server price expectation for retries', () => {
    const body = { items: [{ productId: 8, quantity: 2, expectedPriceVnd: 30000 }], customerName: 'Khách lẻ', paymentMethod: 'CASH' as const };
    service.create(body, 'same-request').subscribe();
    const req = http.expectOne('/api/v1/admin/pos/orders');
    expect(req.request.headers.get('Idempotency-Key')).toBe('same-request');
    expect(req.request.body).toEqual(body);
    req.flush({ id: 1 });
  });
  it('loads receipts from the admin endpoint without credentials in the URL', () => {
    service.receipt(12).subscribe();
    http.expectOne('/api/v1/admin/pos/orders/12/receipt').flush({ id: 12 });
  });
  it('sends both local calendar dates for the dashboard', () => {
    service.dashboard('2026-11-01', '2026-11-09').subscribe();
    const req = http.expectOne(r => r.url === '/api/v1/admin/dashboard');
    expect(req.request.params.get('from')).toBe('2026-11-01');
    expect(req.request.params.get('to')).toBe('2026-11-09');
    req.flush({ revenueVnd: 0 });
  });
});
