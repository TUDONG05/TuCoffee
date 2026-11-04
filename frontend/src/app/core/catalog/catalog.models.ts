export interface Category {
  id: number;
  name: string;
  slug: string;
  active: boolean;
  version: number;
}
export interface Product {
  id: number;
  name: string;
  description: string | null;
  priceVnd: number;
  imageUrl: string | null;
  active: boolean;
  version: number;
  category: Category;
}
export interface ProductPage {
  items: Product[];
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
}
export type CatalogSort = 'id' | 'name' | 'priceAsc' | 'priceDesc';
export interface ProductQuery {
  q: string;
  categoryId: number | null;
  active: '' | 'true' | 'false';
  sort: CatalogSort;
  page: number;
  size: number;
}
export interface ProductInput {
  categoryId: number;
  name: string;
  description: string | null;
  priceVnd: number;
}
