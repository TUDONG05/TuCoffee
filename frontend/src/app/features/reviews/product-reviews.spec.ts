import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { ProductReviews } from './product-reviews';

describe('ProductReviews', () => {
  it('renders hostile review text safely and preserves the hidden review version when editing', async () => {
    TestBed.configureTestingModule({ imports: [ProductReviews], providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: AuthService, useValue: { user: signal({ id: 2 }) } }] });
    const fixture = TestBed.createComponent(ProductReviews);
    fixture.componentRef.setInput('productId', 10);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const review = { id: 3, productId: 10, productName: 'Latte', authorName: 'Buyer', stars: 4, comment: '<img src=x onerror=alert(1)>', visible: false, version: 8, createdAt: '2026-11-09T00:00:00Z', updatedAt: '2026-11-09T00:00:00Z' };
    http.expectOne('/api/v1/products/10/reviews?page=0').flush({ items: [{ ...review, visible: true }], page: 0, totalPages: 1, summary: { count: 1, average: 4 } });
    http.expectOne('/api/v1/products/10/reviews/mine').flush({ eligible: true, review });
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(fixture.nativeElement.textContent).toContain('không tự khôi phục');
    fixture.componentInstance.stars = 2;
    const saving = fixture.componentInstance.save();
    const write = http.expectOne('/api/v1/products/10/reviews/mine');
    expect(write.request.body).toEqual({ stars: 2, comment: review.comment, version: 8 });
    write.flush({ ...review, stars: 2, version: 9 });
    await Promise.resolve(); await Promise.resolve();
    http.expectOne('/api/v1/products/10/reviews?page=0').flush({ items: [], page: 0, totalPages: 0, summary: { count: 0, average: 0 } });
    await saving;
    expect(fixture.componentInstance.own()?.visible).toBe(false);
    fixture.destroy(); http.verify();
  });
});
