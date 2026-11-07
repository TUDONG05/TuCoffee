import { computed, effect, Injectable, signal } from '@angular/core';
import { CartItem } from './cart.models';

const CART_STORAGE_KEY = 'tu_coffee_cart';

@Injectable({
  providedIn: 'root',
})
export class CartService {
  readonly items = signal<CartItem[]>(this.loadFromStorage());

  readonly totalCount = computed(() =>
    this.items().reduce((sum, item) => sum + item.quantity, 0)
  );

  readonly totalAmountVnd = computed(() =>
    this.items().reduce((sum, item) => sum + item.unitPriceVnd * item.quantity, 0)
  );

  readonly isEmpty = computed(() => this.items().length === 0);

  constructor() {
    effect(() => {
      this.saveToStorage(this.items());
    });
  }

  addItem(
    product: {
      id: number;
      name: string;
      priceVnd: number;
      imageUrl?: string | null;
      category?: { name: string };
    },
    quantity = 1
  ): void {
    if (quantity < 1) return;
    this.items.update((current) => {
      const existingIndex = current.findIndex((item) => item.productId === product.id);
      if (existingIndex > -1) {
        const updated = [...current];
        const existing = updated[existingIndex];
        const newQty = Math.min(99, existing.quantity + quantity);
        updated[existingIndex] = { ...existing, quantity: newQty };
        return updated;
      }

      if (current.length >= 50) {
        return current;
      }

      return [
        ...current,
        {
          productId: product.id,
          productName: product.name,
          unitPriceVnd: product.priceVnd,
          imageUrl: product.imageUrl,
          categoryName: product.category?.name,
          quantity: Math.min(99, quantity),
        },
      ];
    });
  }

  updateQuantity(productId: number, quantity: number): void {
    if (quantity <= 0) {
      this.removeItem(productId);
      return;
    }
    const safeQty = Math.min(99, quantity);
    this.items.update((current) =>
      current.map((item) =>
        item.productId === productId ? { ...item, quantity: safeQty } : item
      )
    );
  }

  removeItem(productId: number): void {
    this.items.update((current) => current.filter((item) => item.productId !== productId));
  }

  clear(): void {
    this.items.set([]);
  }

  private loadFromStorage(): CartItem[] {
    try {
      const data = localStorage.getItem(CART_STORAGE_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (item) =>
            typeof item?.productId === 'number' &&
            typeof item?.productName === 'string' &&
            typeof item?.unitPriceVnd === 'number' &&
            typeof item?.quantity === 'number' &&
            item.quantity >= 1
        )
        .slice(0, 50)
        .map((item) => ({
          productId: item.productId,
          productName: item.productName,
          unitPriceVnd: item.unitPriceVnd,
          imageUrl: item.imageUrl || null,
          categoryName: item.categoryName || undefined,
          quantity: Math.min(99, Math.max(1, Math.floor(item.quantity))),
        }));
    } catch {
      return [];
    }
  }

  private saveToStorage(items: CartItem[]): void {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // ignore storage quota errors
    }
  }
}
