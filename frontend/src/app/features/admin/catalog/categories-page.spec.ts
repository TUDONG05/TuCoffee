import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminCategoriesPage } from './categories-page';
import { Category } from '../../../core/catalog/catalog.models';
import { vi } from 'vitest';

const categories: Category[] = Array.from({ length: 23 }, (_, index) => ({
  id: index + 1,
  name: `Category ${index + 1}`,
  slug: `${index % 2 ? 'tea' : 'coffee'}-${index + 1}`,
  active: index % 3 !== 0,
  version: index + 5,
}));

describe('admin category list', () => {
  let fixture: ComponentFixture<AdminCategoriesPage>;
  let component: AdminCategoriesPage;
  let http: HttpTestingController;
  const read = () => http.expectOne('/api/v1/admin/categories');

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AdminCategoriesPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(AdminCategoriesPage);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    read().flush(categories);
  });

  afterEach(() => {
    fixture.destroy();
    http.verify({ ignoreCancelled: true });
    vi.useRealTimers();
  });

  it('renders only ten of the 23 loaded categories', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr strong').length).toBe(10);
    expect(fixture.nativeElement.querySelector('.count').textContent).toContain('23');
    expect(component.items().length).toBe(23);
  });

  it('slices after filtering and displays 10, 10, 3 categories across pages', () => {
    expect(component.pageItems().map((item) => item.id)).toEqual(
      categories.slice(0, 10).map((item) => item.id),
    );
    component.setPage(1);
    expect(component.pageItems().map((item) => item.id)).toEqual(
      categories.slice(10, 20).map((item) => item.id),
    );
    component.setPage(2);
    expect(component.pageItems().map((item) => item.id)).toEqual([21, 22, 23]);
    expect(component.total()).toBe(23);
  });

  it('matches normalized name or slug together with the active status', async () => {
    component.setPage(2);
    component.filters.setValue({ q: '  COFFEE-  ', active: 'true' });
    component.search();
    expect(component.page()).toBe(0);
    expect(component.pageItems()).toEqual(
      categories.filter((item) => item.slug.includes('coffee-') && item.active),
    );
    expect(component.total()).toBe(8);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.count').textContent).toContain('8 danh mục');
    expect(fixture.nativeElement.querySelector('nz-pagination')).toBeNull();

    component.filters.setValue({ q: 'category 1', active: 'false' });
    component.search();
    expect(component.pageItems().map((item) => item.id)).toEqual([1, 10, 13, 16, 19]);
    component.filters.setValue({ q: '', active: 'true' });
    component.search();
    expect(component.total()).toBe(15);
    expect(component.pageItems().length).toBe(10);
    component.setPage(1);
    expect(component.pageItems().length).toBe(5);
  });

  it('debounces filter changes for 300 ms and resets to the first page', async () => {
    vi.useFakeTimers();
    component.setPage(2);
    component.filters.controls.q.setValue('tea-');
    await vi.advanceTimersByTimeAsync(299);
    expect(component.page()).toBe(2);
    expect(component.total()).toBe(23);
    await vi.advanceTimersByTimeAsync(1);
    expect(component.page()).toBe(0);
    expect(component.total()).toBe(11);
    component.setPage(1);
    component.filters.controls.q.setValue('  TEA- ');
    await vi.advanceTimersByTimeAsync(300);
    expect(component.page()).toBe(1);
  });

  it('searches immediately without a delayed duplicate resetting subsequent pagination', async () => {
    vi.useFakeTimers();
    component.filters.controls.active.setValue('true');
    component.search();
    expect(component.total()).toBe(15);
    component.setPage(1);
    await vi.advanceTimersByTimeAsync(300);
    expect(component.page()).toBe(1);
    expect(component.pageItems().length).toBe(5);
  });

  it('shows a clear empty state and filtered zero count', async () => {
    component.filters.controls.q.setValue('missing-category');
    component.search();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.pageItems()).toEqual([]);
    expect(component.page()).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('Không có danh mục phù hợp.');
    expect(fixture.nativeElement.querySelector('.count').textContent).toContain('0 danh mục');
  });

  it('keeps filters on reload and clamps to the last valid filtered page', () => {
    component.filters.controls.active.setValue('true');
    component.search();
    component.setPage(1);
    component.load();
    read().flush(categories.slice(0, 12));
    expect(component.total()).toBe(8);
    expect(component.page()).toBe(0);
    expect(component.pageItems().length).toBe(8);
    component.load();
    read().flush([]);
    expect(component.page()).toBe(0);
    expect(component.total()).toBe(0);
  });

  it('retains confirmation and versioned mutation then clamps the refreshed active list', async () => {
    component.filters.controls.active.setValue('true');
    component.search();
    component.setPage(1);
    const selected = categories[22];
    component.pending.set(selected);
    const changing = component.toggle();
    void component.toggle();
    const mutation = http.expectOne(`/api/v1/admin/categories/${selected.id}/active`);
    expect(mutation.request.body).toEqual({ active: false, version: selected.version });
    expect(component.pending()).toBe(selected);
    mutation.flush({ ...selected, active: false });
    await changing;
    expect(component.pending()).toBeNull();
    expect(component.changing()).toBe(false);
    read().flush(categories.slice(0, 12));
    expect(component.page()).toBe(0);
    expect(component.total()).toBe(8);
  });

  it('preserves the edit form, trims input, and reloads after versioned save', async () => {
    const selected = categories[0];
    component.setPage(2);
    component.edit(selected);
    component.form.setValue({ name: '  Updated category  ', slug: '  updated-category  ' });
    const saving = component.save();
    const mutation = http.expectOne(`/api/v1/admin/categories/${selected.id}`);
    expect(mutation.request.body).toEqual({
      name: 'Updated category',
      slug: 'updated-category',
      version: selected.version,
    });
    mutation.flush({ ...selected, name: 'Updated category', slug: 'updated-category' });
    await saving;
    expect(component.open()).toBe(false);
    read().flush(categories.slice(0, 20));
    expect(component.page()).toBe(1);
    expect(component.pageItems().length).toBe(10);
  });

  it('cancels automatic filtering when the component is destroyed', async () => {
    vi.useFakeTimers();
    component.filters.controls.q.setValue('missing');
    fixture.destroy();
    await vi.advanceTimersByTimeAsync(300);
    expect(component.total()).toBe(23);
  });
});
