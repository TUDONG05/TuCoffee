import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { OrderService } from './order.service';
import { CreateOrderRequest } from './order.models';

describe('OrderService', () => {
  let service: OrderService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(OrderService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('sends POST /api/v1/orders with Idempotency-Key header', () => {
    const req: CreateOrderRequest = {
      items: [{ productId: 1, quantity: 2, expectedPriceVnd: 25000 }],
      customerName: 'Nguyen Van A',
      customerPhone: '0901234567',
      paymentMethod: 'QR_TRANSFER',
    };

    service.createOrder(req, 'uuid-key-123').subscribe((res) => {
      expect(res.id).toBe(10);
      expect(res.publicCode).toBe('TC123');
    });

    const call = httpTesting.expectOne('/api/v1/orders');
    expect(call.request.method).toBe('POST');
    expect(call.request.headers.get('Idempotency-Key')).toBe('uuid-key-123');
    expect(call.request.body).toEqual(req);

    call.flush({ id: 10, publicCode: 'TC123', totalVnd: 50000 });
  });

  it('fetches customer orders via GET /api/v1/orders/mine', () => {
    service.getMyOrders(1, 10).subscribe((res) => {
      expect(res.items.length).toBe(1);
    });

    const call = httpTesting.expectOne('/api/v1/orders/mine?page=1&size=10');
    expect(call.request.method).toBe('GET');

    call.flush({ items: [{ id: 1 }], page: 1, size: 10, totalItems: 1, totalPages: 1 });
  });

  it('cancels an unpaid pending order via PATCH /api/v1/orders/:id/cancel', () => {
    service.cancelOrder(5, { version: 0, note: 'Khách đổi ý' }).subscribe((res) => {
      expect(res.status).toBe('CANCELLED');
    });

    const call = httpTesting.expectOne('/api/v1/orders/5/cancel');
    expect(call.request.method).toBe('PATCH');
    expect(call.request.body).toEqual({ version: 0, note: 'Khách đổi ý' });

    call.flush({ id: 5, status: 'CANCELLED' });
  });

  it('admin updates status via PATCH /api/v1/admin/orders/:id/status', () => {
    service.adminUpdateStatus(8, { targetStatus: 'CONFIRMED', version: 1 }).subscribe((res) => {
      expect(res.status).toBe('CONFIRMED');
    });

    const call = httpTesting.expectOne('/api/v1/admin/orders/8/status');
    expect(call.request.method).toBe('PATCH');
    call.flush({ id: 8, status: 'CONFIRMED' });
  });
});
