import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DevStatus } from './dev-status';

describe('DevStatus', () => {
  let fixture: ComponentFixture<DevStatus>;
  let http: HttpTestingController;
  const content = () => fixture.nativeElement.textContent as string;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DevStatus],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(DevStatus);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('waits for actual health and reports UP', () => {
    expect(content()).toContain('Đang kiểm tra');
    expect(fixture.nativeElement.querySelector('button').disabled).toBe(true);
    http.expectOne({ method: 'GET', url: '/api/v1/health' }).flush({ status: 'UP' });
    fixture.detectChanges();
    expect(content()).toContain('Kết nối thành công');
    expect(fixture.nativeElement.querySelector('button').disabled).toBe(false);
  });

  it('reports database unavailability from HTTP 503 and supports recovery', () => {
    http.expectOne('/api/v1/health').flush({ status: 'DOWN' }, { status: 503, statusText: 'Service Unavailable' });
    fixture.detectChanges();
    expect(content()).toContain('Hệ thống chưa sẵn sàng');
    fixture.nativeElement.querySelector('button').click();
    fixture.detectChanges();
    http.expectOne('/api/v1/health').flush({ status: 'UP' });
    fixture.detectChanges();
    expect(content()).toContain('Kết nối thành công');
  });

  it('shows network failure without claiming success', () => {
    http.expectOne('/api/v1/health').error(new ProgressEvent('error'));
    fixture.detectChanges();
    expect(content()).toContain('Không thể kiểm tra kết nối');
    expect(content()).not.toContain('Kết nối thành công');
  });

  it('does not treat an unexpected successful response as healthy', () => {
    http.expectOne('/api/v1/health').flush({ status: 'UNKNOWN' });
    fixture.detectChanges();
    expect(content()).toContain('Hệ thống chưa sẵn sàng');
  });

  it('cancels an unfinished request when leaving the page', () => {
    const request = http.expectOne('/api/v1/health');
    fixture.destroy();
    expect(request.cancelled).toBe(true);
  });

  it('times out after eight seconds and enables retry', async () => {
    http.expectOne('/api/v1/health').flush({ status: 'UP' });
    vi.useFakeTimers();
    try {
      fixture.detectChanges();
      fixture.nativeElement.querySelector('button').click();
      const request = http.expectOne('/api/v1/health');
      await vi.advanceTimersByTimeAsync(8000);
      fixture.detectChanges();
      expect(request.cancelled).toBe(true);
      expect(content()).toContain('Không thể kiểm tra kết nối');
      expect(fixture.nativeElement.querySelector('button').disabled).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
