import { TestBed } from '@angular/core/testing';
import { CartService } from './cart.service';

describe('CartService', () => {
  let service: CartService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(CartService);
    service.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('starts with an empty cart', () => {
    expect(service.items().length).toBe(0);
    expect(service.totalCount()).toBe(0);
    expect(service.totalAmountVnd()).toBe(0);
    expect(service.isEmpty()).toBe(true);
  });

  it('adds items and calculates totals accurately', () => {
    service.addItem({
      id: 1,
      name: 'Cà phê đen',
      priceVnd: 25000,
      imageUrl: '/images/black.png',
      category: { name: 'Cà phê' },
    }, 2);

    expect(service.items().length).toBe(1);
    expect(service.totalCount()).toBe(2);
    expect(service.totalAmountVnd()).toBe(50000);
    expect(service.isEmpty()).toBe(false);

    // Adding same product again increments quantity
    service.addItem({
      id: 1,
      name: 'Cà phê đen',
      priceVnd: 25000,
    }, 1);

    expect(service.items().length).toBe(1);
    expect(service.totalCount()).toBe(3);
    expect(service.totalAmountVnd()).toBe(75000);
  });

  it('updates quantity and removes item when quantity reaches zero', () => {
    service.addItem({ id: 2, name: 'Bạc xỉu', priceVnd: 35000 }, 3);

    service.updateQuantity(2, 5);
    expect(service.items()[0].quantity).toBe(5);
    expect(service.totalAmountVnd()).toBe(175000);

    service.updateQuantity(2, 0);
    expect(service.items().length).toBe(0);
    expect(service.isEmpty()).toBe(true);
  });

  it('enforces maximum 99 quantity per item', () => {
    service.addItem({ id: 3, name: 'Trà đào', priceVnd: 40000 }, 90);
    service.addItem({ id: 3, name: 'Trà đào', priceVnd: 40000 }, 20);

    expect(service.items()[0].quantity).toBe(99);
  });

  it('removes specific items and clears cart', () => {
    service.addItem({ id: 1, name: 'Món 1', priceVnd: 10000 });
    service.addItem({ id: 2, name: 'Món 2', priceVnd: 20000 });

    service.removeItem(1);
    expect(service.items().length).toBe(1);
    expect(service.items()[0].productId).toBe(2);

    service.clear();
    expect(service.items().length).toBe(0);
  });
});
