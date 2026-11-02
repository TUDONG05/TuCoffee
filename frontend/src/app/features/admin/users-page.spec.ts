import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { User, UserPage } from '../../core/auth/auth.models';
import { UsersPage } from './users-page';

const customer: User = {
  id: 7,
  name: 'Khách Kiểm Tra',
  email: 'customer@example.test',
  phone: null,
  address: null,
  role: 'USER',
  active: true,
};
const pageOf = (page = 0): UserPage => ({
  items: [customer],
  page,
  size: 12,
  totalItems: 25,
  totalPages: 3,
});
const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

describe('UsersPage request coordination', () => {
  let fixture: ComponentFixture<UsersPage>;
  let component: UsersPage;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [UsersPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: { user: signal({ ...customer, id: 1, role: 'ADMIN' }) },
        },
      ],
    });
    // Exercise the component's real streams without coupling request tests to widget rendering.
    TestBed.overrideComponent(UsersPage, { set: { template: '' } });
    fixture = TestBed.createComponent(UsersPage);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    fixture.destroy();
    http.verify({ ignoreCancelled: true });
    vi.useRealTimers();
  });

  const read = () =>
    http.expectOne((request) => request.url === '/api/v1/admin/users' && request.method === 'GET');
  const change = () => http.expectOne(`/api/v1/admin/users/${customer.id}/active`);

  it('cancels the previous read and keeps the replacement request loading', () => {
    const first = read();
    component.load(1);
    expect(first.cancelled).toBe(true);
    expect(component.busy()).toBe(true);
    const latest = read();
    expect(latest.request.params.get('page')).toBe('1');
    latest.flush(pageOf(1));
    expect(component.result()?.page).toBe(1);
    expect(component.busy()).toBe(false);
  });

  it('recovers from a failed read when the user retries', () => {
    read().flush({}, { status: 500, statusText: 'Server Error' });
    expect(component.error()).not.toBe('');
    expect(component.busy()).toBe(false);
    component.load();
    expect(component.error()).toBe('');
    read().flush(pageOf());
    expect(component.result()?.items[0].id).toBe(customer.id);
    expect(component.busy()).toBe(false);
  });

  it('debounces normalized filter changes and resets pagination', async () => {
    vi.useFakeTimers();
    read().flush(pageOf(2));
    component.filters.patchValue({ q: '  customer@example.test  ', active: 'false' });
    await vi.advanceTimersByTimeAsync(299);
    http.expectNone((request) => request.url === '/api/v1/admin/users');
    await vi.advanceTimersByTimeAsync(1);
    const request = read();
    expect(request.request.params.get('q')).toBe('customer@example.test');
    expect(request.request.params.get('active')).toBe('false');
    expect(request.request.params.get('page')).toBe('0');
    expect(component.result()).toBeNull();
    request.flush(pageOf());
    component.filters.controls.q.setValue('customer@example.test');
    await vi.advanceTimersByTimeAsync(300);
    http.expectNone((request) => request.url === '/api/v1/admin/users');
  });

  it('allows explicit search immediately and clears stale results while loading', () => {
    read().flush(pageOf());
    component.filters.patchValue({ q: '  another  ' }, { emitEvent: false });
    component.load();
    expect(component.result()).toBeNull();
    expect(component.busy()).toBe(true);
    const request = read();
    expect(request.request.params.get('q')).toBe('another');
    request.flush({ ...pageOf(), items: [], totalItems: 0, totalPages: 0 });
    expect(component.result()?.items).toEqual([]);
  });

  it('searches a previous automatic filter again after a different immediate search', async () => {
    vi.useFakeTimers();
    read().flush(pageOf());
    component.filters.controls.q.setValue('first');
    await vi.advanceTimersByTimeAsync(300);
    read().flush(pageOf());
    component.filters.controls.q.setValue('second');
    component.load();
    const manual = read();
    expect(manual.request.params.get('q')).toBe('second');
    manual.flush(pageOf());
    component.filters.controls.q.setValue('first');
    await vi.advanceTimersByTimeAsync(300);
    const returning = read();
    expect(returning.request.params.get('q')).toBe('first');
    returning.flush(pageOf());
  });

  it('sends one mutation for repeated confirmations and reloads the current page', async () => {
    read().flush(pageOf());
    component.load(1);
    read().flush(pageOf(1));
    component.pendingUser.set(customer);
    void component.toggle();
    void component.toggle();
    const request = change();
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ active: false });
    expect(component.changing()).toBe(customer.id);
    http.expectNone(`/api/v1/admin/users/${customer.id}/active`);
    request.flush({ ...customer, active: false });
    await settle();
    expect(component.pendingUser()).toBeNull();
    expect(component.message()).toContain(customer.email);
    expect(component.changing()).toBeNull();
    const refreshed = read();
    expect(refreshed.request.params.get('page')).toBe('1');
    refreshed.flush(pageOf(1));
  });

  it('keeps confirmation available after a mutation failure and permits retry', async () => {
    read().flush(pageOf());
    component.pendingUser.set(customer);
    void component.toggle();
    change().flush({}, { status: 500, statusText: 'Server Error' });
    await settle();
    expect(component.error()).not.toBe('');
    expect(component.changing()).toBeNull();
    expect(component.pendingUser()).toEqual(customer);
    void component.toggle();
    change().flush({ ...customer, active: false });
    await settle();
    read().flush(pageOf());
    expect(component.error()).toBe('');
    expect(component.pendingUser()).toBeNull();
  });

  it('does not cancel a mutation when a new read replaces the current filters', async () => {
    read().flush(pageOf());
    component.pendingUser.set(customer);
    void component.toggle();
    const mutation = change();
    component.filters.patchValue({ q: 'another' }, { emitEvent: false });
    component.load();
    read().flush({ ...pageOf(), items: [] });
    expect(mutation.cancelled).toBe(false);
    mutation.flush({ ...customer, active: false });
    await settle();
    const refreshed = read();
    expect(refreshed.request.params.get('q')).toBe('another');
    refreshed.flush({ ...pageOf(), items: [] });
  });

  it('resets pagination if filters change before an in-flight mutation completes', async () => {
    vi.useFakeTimers();
    read().flush(pageOf());
    component.load(2);
    read().flush(pageOf(2));
    component.pendingUser.set(customer);
    void component.toggle();
    const mutation = change();
    component.filters.controls.q.setValue('new customer');
    mutation.flush({ ...customer, active: false });
    await settle();
    const refreshed = read();
    expect(refreshed.request.params.get('q')).toBe('new customer');
    expect(refreshed.request.params.get('page')).toBe('0');
    refreshed.flush(pageOf());
    await vi.advanceTimersByTimeAsync(300);
    http.expectNone((request) => request.url === '/api/v1/admin/users');
  });

  it('does not automatically retry an ambiguous mutation timeout', async () => {
    vi.useFakeTimers();
    read().flush(pageOf());
    component.pendingUser.set(customer);
    void component.toggle();
    const mutation = change();
    await vi.advanceTimersByTimeAsync(12000);
    expect(mutation.cancelled).toBe(true);
    expect(component.changing()).toBeNull();
    expect(component.error()).not.toBe('');
    http.expectNone(`/api/v1/admin/users/${customer.id}/active`);
  });

  it('cancels outstanding reads and mutations when the page is destroyed', async () => {
    const request = read();
    component.pendingUser.set(customer);
    void component.toggle();
    const mutation = change();
    fixture.destroy();
    expect(request.cancelled).toBe(true);
    expect(mutation.cancelled).toBe(true);
    await settle();
    http.expectNone((request) => request.url === '/api/v1/admin/users');
  });
});
