import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { timeout } from 'rxjs';
import { Category, Product, ProductInput, ProductPage, ProductQuery } from './catalog.models';
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly http = inject(HttpClient);
  categories(admin = false) {
    return this.http
      .get<Category[]>(`/api/v1/${admin ? 'admin/' : ''}categories`)
      .pipe(timeout(12000));
  }
  products(query: ProductQuery, admin = false) {
    let params = new HttpParams()
      .set('q', query.q.trim())
      .set('page', query.page)
      .set('size', query.size)
      .set('sort', query.sort);
    if (query.categoryId !== null) params = params.set('categoryId', query.categoryId);
    if (admin && query.active) params = params.set('active', query.active);
    return this.http
      .get<ProductPage>(`/api/v1/${admin ? 'admin/' : ''}products`, { params })
      .pipe(timeout(12000));
  }
  product(id: number) {
    return this.http.get<Product>(`/api/v1/products/${id}`).pipe(timeout(12000));
  }
  createCategory(value: { name: string; slug: string }) {
    return this.http.post<Category>('/api/v1/admin/categories', value).pipe(timeout(12000));
  }
  updateCategory(category: Category, value: { name: string; slug: string }) {
    return this.http
      .put<Category>(`/api/v1/admin/categories/${category.id}`, {
        ...value,
        version: category.version,
      })
      .pipe(timeout(12000));
  }
  toggleCategory(category: Category) {
    return this.http
      .patch<Category>(`/api/v1/admin/categories/${category.id}/active`, {
        active: !category.active,
        version: category.version,
      })
      .pipe(timeout(12000));
  }
  createProduct(value: ProductInput) {
    return this.http.post<Product>('/api/v1/admin/products', value).pipe(timeout(12000));
  }
  updateProduct(product: Product, value: ProductInput) {
    return this.http
      .put<Product>(`/api/v1/admin/products/${product.id}`, { ...value, version: product.version })
      .pipe(timeout(12000));
  }
  toggleProduct(product: Product) {
    return this.http
      .patch<Product>(`/api/v1/admin/products/${product.id}/active`, {
        active: !product.active,
        version: product.version,
      })
      .pipe(timeout(12000));
  }
  uploadImage(product: Product, file: File) {
    const body = new FormData();
    body.append('file', file);
    return this.http
      .post<Product>(`/api/v1/admin/products/${product.id}/image`, body, {
        params: { version: product.version },
      })
      .pipe(timeout(20000));
  }
}
