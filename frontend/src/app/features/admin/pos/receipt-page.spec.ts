import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ReceiptPage } from './receipt-page';
import { PosService } from '../../../core/pos/pos.service';
import { OrderService } from '../../../core/order/order.service';
import { OrderResponse } from '../../../core/order/order.models';

const snapshot: OrderResponse = {
  id: 9, publicCode: 'POS-SNAPSHOT', source: 'POS', status: 'PENDING', totalVnd: 60000,
  customerName: 'Guest', version: 0, createdAt: '2026-11-09T01:00:00Z', updatedAt: '2026-11-09T01:00:00Z',
  items: [{ id: 3, productId: 1, productName: 'Historical coffee name', quantity: 2, unitPriceVnd: 30000, subtotalVnd: 60000 }],
  payment: { id: 4, method: 'CASH', status: 'UNPAID', amountVnd: 60000 },
};

describe('receipt rendering and printing', () => {
  let receipt: ReturnType<typeof vi.fn>;
  let instructions: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    receipt = vi.fn().mockReturnValue(of(snapshot)); instructions = vi.fn().mockReturnValue(of({ qrUrl: 'https://example.com/qr.png', transferContent: 'POS-SNAPSHOT' }));
    TestBed.configureTestingModule({ imports: [ReceiptPage], providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map([['id', '9']]) } } },
      { provide: PosService, useValue: { receipt } }, { provide: OrderService, useValue: { getPaymentInstructions: instructions } },
    ] });
  });
  it('prints server snapshot names and totals and invokes the native print dialog', async () => {
    const fixture = TestBed.createComponent(ReceiptPage); await fixture.whenStable(); fixture.detectChanges();
    expect(receipt).toHaveBeenCalledWith(9);
    expect(fixture.nativeElement.textContent).toContain('Historical coffee name');
    expect(fixture.nativeElement.textContent).toContain('60.000');
    expect(instructions).not.toHaveBeenCalled();
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    (fixture.nativeElement.querySelector('.controls button') as HTMLButtonElement).click();
    expect(print).toHaveBeenCalledOnce(); print.mockRestore(); fixture.destroy();
  });
  it('requests a QR only for an unpaid, non-cancelled transfer', async () => {
    receipt.mockReturnValue(of({ ...snapshot, payment: { ...snapshot.payment!, method: 'QR_TRANSFER' } }));
    const page = TestBed.runInInjectionContext(() => new ReceiptPage()); await Promise.resolve(); await Promise.resolve();
    expect(instructions).toHaveBeenCalledWith(9); expect(page.instructions()?.transferContent).toBe('POS-SNAPSHOT');
  });
  it.each(['paid', 'cancelled'])('does not request a QR for %s orders', async (state) => {
    receipt.mockReturnValue(of({ ...snapshot, status: state === 'cancelled' ? 'CANCELLED' : 'COMPLETED', payment: { ...snapshot.payment!, method: 'QR_TRANSFER', status: state === 'paid' ? 'PAID' : 'UNPAID' } }));
    TestBed.runInInjectionContext(() => new ReceiptPage()); await Promise.resolve();
    expect(instructions).not.toHaveBeenCalled();
  });
  it('keeps the receipt available if QR lookup fails', async () => {
    receipt.mockReturnValue(of({ ...snapshot, payment: { ...snapshot.payment!, method: 'QR_TRANSFER' } }));
    instructions.mockReturnValue(throwError(() => new Error('offline')));
    const page = TestBed.runInInjectionContext(() => new ReceiptPage()); await Promise.resolve(); await Promise.resolve();
    expect(page.order()?.publicCode).toBe('POS-SNAPSHOT'); expect(page.error()).toBeTruthy(); expect(page.loading()).toBe(false);
  });
});
