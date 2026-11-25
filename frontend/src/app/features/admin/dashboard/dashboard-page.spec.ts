import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { DashboardPage, getWeekMondayAndSunday, parseDateParts, formatDate } from './dashboard-page';
import { Dashboard, PosService } from '../../../core/pos/pos.service';

describe('dashboard date filtering', () => {
  let dashboard: ReturnType<typeof vi.fn>;
  let page: DashboardPage;
  const result: Dashboard = {
    from: '2026-11-09',
    to: '2026-11-15',
    timeZone: 'Asia/Ho_Chi_Minh',
    revenueVnd: 70000,
    completedPaidOrders: 2,
    totalOrders: 3,
    statusCounts: {},
    recentOrders: [],
    timeline: [
      { periodKey: '2026-11-09', label: '09/11', date: '2026-11-09', revenueVnd: 10000, orderCount: 1 },
      { periodKey: '2026-11-10', label: '10/11', date: '2026-11-10', revenueVnd: 0, orderCount: 0 },
      { periodKey: '2026-11-11', label: '11/11', date: '2026-11-11', revenueVnd: 0, orderCount: 0 },
      { periodKey: '2026-11-12', label: '12/11', date: '2026-11-12', revenueVnd: 0, orderCount: 0 },
      { periodKey: '2026-11-13', label: '13/11', date: '2026-11-13', revenueVnd: 0, orderCount: 0 },
      { periodKey: '2026-11-14', label: '14/11', date: '2026-11-14', revenueVnd: 60000, orderCount: 1 },
      { periodKey: '2026-11-15', label: '15/11', date: '2026-11-15', revenueVnd: 0, orderCount: 0 },
    ],
  };

  beforeEach(async () => {
    dashboard = vi.fn().mockReturnValue(of(result));
    TestBed.configureTestingModule({ providers: [{ provide: PosService, useValue: { dashboard } }] });
    page = TestBed.runInInjectionContext(() => new DashboardPage());
    await Promise.resolve();
    dashboard.mockClear();
  });

  it('rejects reversed and missing dates without sending requests', async () => {
    page.from = '2026-11-10'; page.to = '2026-11-01'; await page.load();
    expect(dashboard).not.toHaveBeenCalled(); expect(page.error()).toBeTruthy();
    page.from = ''; await page.load(); expect(dashboard).not.toHaveBeenCalled();
  });

  it('permits a single-day interval and blocks overlapping refreshes', async () => {
    const response = new Subject<Dashboard>(); dashboard.mockReturnValue(response);
    page.from = page.to = '2026-11-09';
    const pending = page.load(); await page.load();
    expect(dashboard).toHaveBeenCalledExactlyOnceWith('2026-11-09', '2026-11-09');
    response.next(result); await pending; expect(page.loading()).toBe(false);
  });

  it('clears stale data after a server failure and can retry', async () => {
    dashboard.mockReturnValue(throwError(() => new Error('offline'))); await page.load();
    expect(page.data()).toBeNull(); expect(page.error()).toBeTruthy(); expect(page.loading()).toBe(false);
    dashboard.mockReturnValue(of(result)); await page.load(); expect(page.data()).toEqual(result); expect(page.error()).toBe('');
  });

  it('computes week Monday and Sunday accurately', () => {
    // Saturday Nov 14, 2026 -> Mon Nov 09 to Sun Nov 15
    const sat = new Date(2026, 10, 14);
    const { monday, sunday } = getWeekMondayAndSunday(sat);
    expect(formatDate(monday)).toBe('2026-11-09');
    expect(formatDate(sunday)).toBe('2026-11-15');
  });

  it('renders 7 days of the week in WEEK mode', async () => {
    dashboard.mockReturnValue(of(result));
    page.setViewMode('WEEK');
    await Promise.resolve();
    const bars = page.chartBars();
    expect(bars.length).toBe(7);
    expect(bars[0].label).toContain('T2');
    expect(bars[5].label).toContain('T7');
    expect(bars[6].label).toContain('CN');
  });

  it('renders weeks of month in MONTH mode', async () => {
    const monthResult: Dashboard = {
      ...result,
      from: '2026-11-01',
      to: '2026-11-30',
      timeline: Array.from({ length: 30 }, (_, i) => {
        const day = String(i + 1).padStart(2, '0');
        return {
          periodKey: `2026-11-${day}`,
          label: `${day}/11`,
          date: `2026-11-${day}`,
          revenueVnd: i === 13 ? 50000 : 0,
          orderCount: i === 13 ? 1 : 0,
        };
      }),
    };
    dashboard.mockReturnValue(of(monthResult));
    page.setViewMode('MONTH');
    await Promise.resolve();
    const bars = page.chartBars();
    // 30 days chunked into 7-day weeks = 5 weeks
    expect(bars.length).toBe(5);
    expect(bars[0].label).toContain('Tuần 1');
    expect(bars[1].label).toContain('Tuần 2');
    expect(bars[4].label).toContain('Tuần 5');
  });

  it('shifts weeks back and forth', async () => {
    page.onWeekAnchorChange('2026-11-14');
    expect(page.from).toBe('2026-11-09');
    expect(page.to).toBe('2026-11-15');

    page.shiftWeek(-1);
    expect(page.from).toBe('2026-11-02');
    expect(page.to).toBe('2026-11-08');

    page.shiftWeek(1);
    expect(page.from).toBe('2026-11-09');
    expect(page.to).toBe('2026-11-15');
  });
});
