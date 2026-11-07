export interface CartItem {
  productId: number;
  productName: string;
  unitPriceVnd: number;
  imageUrl?: string | null;
  categoryName?: string;
  quantity: number;
}
