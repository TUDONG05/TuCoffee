import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
export interface Review {
  id: number; productId: number; productName: string; authorName: string; stars: number;
  comment: string | null; visible: boolean; version: number; createdAt: string; updatedAt: string;
}
export interface ReviewPage {
  items: Review[]; page: number; size: number; totalItems: number; totalPages: number;
  summary: { count: number; average: number };
}
export interface ReviewDetail {
  review: Review;
  events: { id: number; actorName: string; visible: boolean; reason: string; reviewVersion: number; createdAt: string }[];
}
@Injectable({ providedIn: 'root' })
export class ReviewService {
  private readonly http = inject(HttpClient);
  list(productId: number, page = 0) { return this.http.get<ReviewPage>(`/api/v1/products/${productId}/reviews`, { params: { page } }); }
  mine(productId: number) { return this.http.get<{ eligible: boolean; review: Review | null }>(`/api/v1/products/${productId}/reviews/mine`); }
  write(productId: number, stars: number, comment: string, version: number | null) { return this.http.put<Review>(`/api/v1/products/${productId}/reviews/mine`, { stars, comment, version }); }
  admin(filters: { productId?: number; stars?: number; visible?: boolean; page: number }) {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) if (value !== undefined) params = params.set(key, value);
    return this.http.get<ReviewPage>('/api/v1/admin/reviews', { params });
  }
  detail(id: number) { return this.http.get<ReviewDetail>(`/api/v1/admin/reviews/${id}`); }
  moderate(review: Review, visible: boolean, reason: string) { return this.http.patch<Review>(`/api/v1/admin/reviews/${review.id}/visibility`, { visible, reason, version: review.version }); }
}
