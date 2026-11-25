import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AdminReviewsPage } from './admin-reviews-page';

describe('AdminReviewsPage', () => {
  it('keeps content read only and sends reason and expected version for moderation', async () => {
    TestBed.configureTestingModule({ imports: [AdminReviewsPage], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(AdminReviewsPage);
    const http = TestBed.inject(HttpTestingController);
    const review = { id: 3, productId: 10, productName: 'Latte', authorName: 'Buyer', stars: 1, comment: 'Original', visible: true, version: 4, createdAt: '2026-11-09T00:00:00Z', updatedAt: '2026-11-09T00:00:00Z' };
    http.expectOne('/api/v1/admin/reviews?page=0').flush({ items: [review], page: 0, totalItems: 1, totalPages: 1 });
    const opening = fixture.componentInstance.open(3);
    http.expectOne('/api/v1/admin/reviews/3').flush({ review, events: [] }); await opening;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('textarea[name=comment]')).toBeNull();
    expect(fixture.nativeElement.querySelector('input[name=stars]')).toBeNull();
    fixture.componentInstance.reason = 'Spam';
    const saving = fixture.componentInstance.moderate(review);
    const mutation = http.expectOne('/api/v1/admin/reviews/3/visibility');
    expect(mutation.request.method).toBe('PATCH');
    expect(mutation.request.body).toEqual({ visible: false, reason: 'Spam', version: 4 });
    mutation.flush({ ...review, visible: false, version: 5 });
    await Promise.resolve(); await Promise.resolve();
    http.expectOne('/api/v1/admin/reviews/3').flush({ review: { ...review, visible: false, version: 5 }, events: [] });
    await Promise.resolve(); await Promise.resolve();
    http.expectOne('/api/v1/admin/reviews?page=0').flush({ items: [], page: 0, totalItems: 0, totalPages: 0 });
    await saving; fixture.destroy(); http.verify();
  });
});
