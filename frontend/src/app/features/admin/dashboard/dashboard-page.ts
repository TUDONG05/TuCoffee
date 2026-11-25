import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { VndPipe } from '../../../core/catalog/catalog-ui';
import { Dashboard, PosService } from '../../../core/pos/pos.service';
import { apiError } from '../../../core/auth/api-error';

export interface ChartBar {
  key: string;
  label: string;
  fullDate: string;
  revenueVnd: number;
  orderCount: number;
  heightPercent: number;
}

export const VIETNAMESE_DAYS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
export const VIETNAMESE_DAYS_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export function parseDateParts(str: string): { year: number; month: number; day: number } {
  const parts = str.split('-').map(s => parseInt(s, 10));
  return { year: parts[0] || 2026, month: parts[1] || 1, day: parts[2] || 1 };
}

export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getWeekMondayAndSunday(refDate: Date): { monday: Date; sunday: Date } {
  const d = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
  const dayOfWeek = d.getDay(); // 0 is Sun, 1 is Mon, ..., 6 is Sat
  const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMon);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return { monday, sunday };
}

export function getTodayParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (name: string) => parts.find(p => p.type === name)?.value || '';
  const year = parseInt(part('year'), 10);
  const month = parseInt(part('month'), 10);
  const day = parseInt(part('day'), 10);
  return { year, month, day, str: `${part('year')}-${part('month')}-${part('day')}` };
}

@Component({
  selector: 'app-dashboard-page',
  imports: [FormsModule, DatePipe, NzButtonModule, NzAlertModule, VndPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header><h1>Thống kê doanh thu</h1></header>

    <!-- Thanh công cụ lọc thống kê gọn 1 dòng -->
    <div class="filter-toolbar">
      <!-- Nhóm chế độ xem -->
      <div class="mode-tabs">
        <button nz-button [nzType]="viewMode() === 'WEEK' ? 'primary' : 'default'" (click)="setViewMode('WEEK')">
          Theo tuần
        </button>
        <button nz-button [nzType]="viewMode() === 'MONTH' ? 'primary' : 'default'" (click)="setViewMode('MONTH')">
          Theo tháng
        </button>
        <button nz-button [nzType]="viewMode() === 'YEAR' ? 'primary' : 'default'" (click)="setViewMode('YEAR')">
          Theo năm
        </button>
        <button nz-button [nzType]="viewMode() === 'DAY' ? 'primary' : 'default'" (click)="setViewMode('DAY')">
          Theo ngày
        </button>
        <button nz-button [nzType]="viewMode() === 'CUSTOM' ? 'primary' : 'default'" (click)="setViewMode('CUSTOM')">
          Tùy chọn khoảng ngày
        </button>
      </div>

      <div class="divider"></div>

      <!-- Nhóm điều khiển thời gian tương ứng -->
      <div class="period-controls">
        @if (viewMode() === 'WEEK') {
          <div class="nav-buttons">
            <button nz-button (click)="shiftWeek(-1)">Trước</button>
            <button nz-button nzType="primary" (click)="resetToCurrentWeek()">Tuần này</button>
            <button nz-button (click)="shiftWeek(1)">Sau</button>
          </div>
          <span class="period-label"><strong>{{ weekRangeLabel() }}</strong></span>
          <label class="ant-btn ant-btn-default week-picker-btn">
            <span>Chọn tuần khác</span>
            <input id="week-picker" type="date" [ngModel]="weekAnchorDateStr()" (ngModelChange)="onWeekAnchorChange($event)" />
          </label>
        }

        @if (viewMode() === 'MONTH') {
          <div class="nav-buttons">
            <button nz-button (click)="shiftMonth(-1)">Trước</button>
            <button nz-button nzType="primary" (click)="resetToCurrentMonth()">Tháng này</button>
            <button nz-button (click)="shiftMonth(1)">Sau</button>
          </div>
          <div class="picker-wrap">
            <input id="month-picker" type="month" [ngModel]="monthInputVal()" (ngModelChange)="onMonthInputChange($event)" />
          </div>
        }

        @if (viewMode() === 'YEAR') {
          <div class="nav-buttons">
            <button nz-button (click)="shiftYear(-1)">Trước</button>
            <button nz-button nzType="primary" (click)="resetToCurrentYear()">Năm nay</button>
            <button nz-button (click)="shiftYear(1)">Sau</button>
          </div>
          <div class="picker-wrap">
            <span class="prefix-label">Năm</span>
            <input id="year-picker" type="number" min="2000" max="2100" [ngModel]="selectedYear()" (ngModelChange)="onYearChange($event)" />
          </div>
        }

        @if (viewMode() === 'DAY') {
          <div class="nav-buttons">
            <button nz-button (click)="shiftDay(-1)">Trước</button>
            <button nz-button nzType="primary" (click)="resetToToday()">Hôm nay</button>
            <button nz-button (click)="shiftDay(1)">Sau</button>
          </div>
          <div class="picker-wrap">
            <input id="day-picker" type="date" [ngModel]="dayInputVal()" (ngModelChange)="onDayChange($event)" />
            <span class="day-badge">({{ dayOfWeekName() }})</span>
          </div>
        }

        @if (viewMode() === 'CUSTOM') {
          <form (ngSubmit)="onCustomSubmit()" class="custom-range-inline">
            <label>
              <span>Từ</span>
              <input type="date" name="from" [(ngModel)]="customFrom" required [disabled]="loading()" />
            </label>
            <label>
              <span>Đến</span>
              <input type="date" name="to" [(ngModel)]="customTo" required [disabled]="loading()" />
            </label>
            <button nz-button nzType="primary" [nzLoading]="loading()" [disabled]="loading() || !customFrom || !customTo">
              Xem
            </button>
          </form>
        }
      </div>
    </div>

    @if (error()) { <nz-alert nzType="error" [nzMessage]="error()" nzShowIcon style="margin-bottom: 1.5rem;" /> }
    @if (loading()) { <p role="status" class="loading-status">Đang tổng hợp số liệu…</p> }

    @if (data(); as d) {
      <!-- 4 Thẻ chỉ số tổng hợp -->
      <div class="metrics">
        <article>
          <small>Doanh thu thực nhận</small>
          <strong>{{ d.revenueVnd | vnd }}</strong>
        </article>
        <article>
          <small>Đơn đóng góp doanh thu</small>
          <strong>{{ d.completedPaidOrders }}</strong>
        </article>
        <article>
          <small>Giá trị trung bình / đơn</small>
          <strong>{{ aov() | vnd }}</strong>
        </article>
        <article>
          <small>Đơn được tạo trong kỳ</small>
          <strong>{{ d.totalOrders }}</strong>
        </article>
      </div>

      <!-- Biểu đồ doanh thu trực quan -->
      <section class="chart-card" aria-labelledby="revenue-chart-title">
        <div class="chart-header">
          <div>
            <h2 id="revenue-chart-title">Biểu đồ doanh thu</h2>
            <p class="chart-period-info">
              Khoảng thời gian: <strong>{{ d.from | date:'dd/MM/yyyy' }}</strong> đến <strong>{{ d.to | date:'dd/MM/yyyy' }}</strong>
            </p>
          </div>

          @if (viewMode() === 'MONTH') {
            <div class="chart-controls">
              <span class="group-label">Hiển thị theo:</span>
              <div class="group-buttons">
                <button nz-button nzSize="small" [nzType]="monthDisplayMode() === 'WEEKS' ? 'primary' : 'default'" (click)="monthDisplayMode.set('WEEKS')">Các tuần</button>
                <button nz-button nzSize="small" [nzType]="monthDisplayMode() === 'DAYS' ? 'primary' : 'default'" (click)="monthDisplayMode.set('DAYS')">Từng ngày</button>
              </div>
            </div>
          }

          @if (viewMode() === 'CUSTOM') {
            <div class="chart-controls">
              <span class="group-label">Gom nhóm:</span>
              <div class="group-buttons">
                <button nz-button nzSize="small" [nzType]="customGroupBy() === 'DAY' ? 'primary' : 'default'" (click)="customGroupBy.set('DAY')">Ngày</button>
                <button nz-button nzSize="small" [nzType]="customGroupBy() === 'WEEK' ? 'primary' : 'default'" (click)="customGroupBy.set('WEEK')">Tuần</button>
                <button nz-button nzSize="small" [nzType]="customGroupBy() === 'MONTH' ? 'primary' : 'default'" (click)="customGroupBy.set('MONTH')">Tháng</button>
                <button nz-button nzSize="small" [nzType]="customGroupBy() === 'QUARTER' ? 'primary' : 'default'" (click)="customGroupBy.set('QUARTER')">Quý</button>
              </div>
            </div>
          }
        </div>

        @if (chartBars(); as bars) {
          @if (bars.length > 0) {
            <div class="chart-container">
              <!-- Cột mốc trục Y -->
              <div class="chart-y-axis">
                <span>{{ maxRevenue() | vnd }}</span>
                <span>{{ halfMaxRevenue() | vnd }}</span>
                <span>0 đ</span>
              </div>

              <!-- Vùng vẽ cột -->
              <div class="chart-plot-area">
                <div class="grid-line line-100"></div>
                <div class="grid-line line-50"></div>
                <div class="grid-line line-0"></div>

                <div class="bars-flex">
                  @for (bar of bars; track bar.key) {
                    <div class="bar-item"
                      (mouseenter)="activeBar.set(bar)"
                      (mouseleave)="activeBar.set(null)">
                      <div class="bar-track">
                        <div class="bar-fill" [style.height.%]="bar.heightPercent" [class.has-data]="bar.revenueVnd > 0">
                          @if (bar.revenueVnd > 0 && bars.length <= 15) {
                            <span class="bar-val-pop">{{ bar.revenueVnd | vnd }}</span>
                          }
                        </div>
                      </div>
                      <span class="bar-lbl" [title]="bar.fullDate">{{ bar.label }}</span>
                    </div>
                  }
                </div>
              </div>
            </div>

            <!-- Toast chi tiết mốc thời gian khi hover -->
            @if (activeBar(); as b) {
              <div class="bar-tooltip">
                <strong>{{ b.fullDate }}</strong>:
                <span class="tooltip-amount">{{ b.revenueVnd | vnd }}</span>
                <span class="tooltip-orders">({{ b.orderCount }} đơn hoàn tất)</span>
              </div>
            } @else {
              <div class="bar-tooltip placeholder">
                <span>Rê chuột vào từng cột để xem chi tiết doanh thu theo mốc thời gian</span>
              </div>
            }
          } @else {
            <p class="empty-chart">Chưa có dữ liệu giao dịch trong khoảng thời gian này.</p>
          }
        }
      </section>

      <!-- Trạng thái đơn -->
      <section class="section-card">
        <h2>Trạng thái đơn tạo trong kỳ</h2>
        <div class="statuses">
          @for (status of statuses; track status.key) {
            <p>
              <span>{{ status.label }}</span>
              <strong>{{ d.statusCounts[status.key] || 0 }}</strong>
            </p>
          }
        </div>
      </section>
    }
  `,
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {
  private readonly pos = inject(PosService);

  readonly data = signal<Dashboard | null>(null);
  readonly error = signal('');
  readonly loading = signal(false);

  readonly viewMode = signal<'WEEK' | 'MONTH' | 'YEAR' | 'DAY' | 'CUSTOM'>('WEEK');

  private readonly today = getTodayParts();
  readonly weekAnchorDate = signal<Date>(new Date(this.today.year, this.today.month - 1, this.today.day));
  readonly selectedMonth = signal<number>(this.today.month);
  readonly selectedYear = signal<number>(this.today.year);
  readonly selectedDay = signal<Date>(new Date(this.today.year, this.today.month - 1, this.today.day));

  readonly monthDisplayMode = signal<'WEEKS' | 'DAYS'>('WEEKS');
  readonly customGroupBy = signal<'DAY' | 'WEEK' | 'MONTH' | 'QUARTER'>('DAY');
  readonly activeBar = signal<ChartBar | null>(null);

  from = '';
  to = '';
  customFrom = `${this.today.str.slice(0, 8)}01`;
  customTo = this.today.str;

  readonly statuses = [
    { key: 'PENDING', label: 'Chờ xác nhận' },
    { key: 'CONFIRMED', label: 'Đang chuẩn bị' },
    { key: 'COMPLETED', label: 'Hoàn tất' },
    { key: 'CANCELLED', label: 'Đã hủy' },
  ];

  readonly weekAnchorDateStr = computed(() => formatDate(this.weekAnchorDate()));

  readonly weekRangeLabel = computed(() => {
    const { monday, sunday } = getWeekMondayAndSunday(this.weekAnchorDate());
    const mDay = String(monday.getDate()).padStart(2, '0');
    const mMonth = String(monday.getMonth() + 1).padStart(2, '0');
    const mYear = monday.getFullYear();
    const sDay = String(sunday.getDate()).padStart(2, '0');
    const sMonth = String(sunday.getMonth() + 1).padStart(2, '0');
    const sYear = sunday.getFullYear();
    return `${mDay}/${mMonth}/${mYear} — ${sDay}/${sMonth}/${sYear}`;
  });

  readonly monthInputVal = computed(() => {
    return `${this.selectedYear()}-${String(this.selectedMonth()).padStart(2, '0')}`;
  });

  readonly dayInputVal = computed(() => formatDate(this.selectedDay()));

  readonly dayOfWeekName = computed(() => {
    const d = this.selectedDay();
    return VIETNAMESE_DAYS[d.getDay()];
  });

  readonly dayLabel = computed(() => {
    const d = this.selectedDay();
    const dow = d.getDay();
    const dayName = VIETNAMESE_DAYS[dow];
    const dayStr = String(d.getDate()).padStart(2, '0');
    const monthStr = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${dayName}, ngày ${dayStr}/${monthStr}/${year}`;
  });

  readonly aov = computed(() => {
    const d = this.data();
    if (!d || d.completedPaidOrders <= 0) return 0;
    return Math.round(d.revenueVnd / d.completedPaidOrders);
  });

  readonly maxRevenue = computed(() => {
    const bars = this.chartBars();
    if (!bars || bars.length === 0) return 0;
    return Math.max(...bars.map(b => b.revenueVnd), 0);
  });

  readonly halfMaxRevenue = computed(() => {
    return Math.round(this.maxRevenue() / 2);
  });

  readonly chartBars = computed<ChartBar[]>(() => {
    const d = this.data();
    if (!d || !d.timeline || d.timeline.length === 0) return [];
    const mode = this.viewMode();
    const timeline = d.timeline;

    if (mode === 'WEEK') {
      const maxRev = Math.max(...timeline.map(p => p.revenueVnd), 1);
      return timeline.map(p => {
        const parts = parseDateParts(p.date);
        const dt = new Date(parts.year, parts.month - 1, parts.day);
        const dow = dt.getDay();
        const shortName = VIETNAMESE_DAYS_SHORT[dow];
        const fullName = VIETNAMESE_DAYS[dow];
        return {
          key: p.date,
          label: `${shortName} (${p.label})`,
          fullDate: `${fullName}, ngày ${p.label}/${parts.year}`,
          revenueVnd: p.revenueVnd,
          orderCount: p.orderCount,
          heightPercent: Math.round((p.revenueVnd / maxRev) * 100),
        };
      });
    }

    if (mode === 'MONTH') {
      if (this.monthDisplayMode() === 'WEEKS') {
        const list: ChartBar[] = [];
        const chunkSize = 7;
        for (let i = 0; i < timeline.length; i += chunkSize) {
          const slice = timeline.slice(i, i + chunkSize);
          const first = slice[0];
          const last = slice[slice.length - 1];
          const rev = slice.reduce((sum, item) => sum + item.revenueVnd, 0);
          const count = slice.reduce((sum, item) => sum + item.orderCount, 0);
          const weekIndex = Math.floor(i / chunkSize) + 1;
          const firstDayNum = first.label.slice(0, 2);
          const lastDayNum = last.label.slice(0, 2);
          list.push({
            key: `W${weekIndex}`,
            label: `Tuần ${weekIndex} (${firstDayNum}-${lastDayNum})`,
            fullDate: `Tuần ${weekIndex} (Từ ${first.label} đến ${last.label}/${this.selectedYear()})`,
            revenueVnd: rev,
            orderCount: count,
            heightPercent: 0,
          });
        }
        const maxRev = Math.max(...list.map(e => e.revenueVnd), 1);
        return list.map(b => ({
          ...b,
          heightPercent: Math.round((b.revenueVnd / maxRev) * 100),
        }));
      } else {
        const maxRev = Math.max(...timeline.map(p => p.revenueVnd), 1);
        return timeline.map(p => ({
          key: p.date,
          label: p.label.slice(0, 2),
          fullDate: `Ngày ${p.label}/${p.date.slice(0, 4)}`,
          revenueVnd: p.revenueVnd,
          orderCount: p.orderCount,
          heightPercent: Math.round((p.revenueVnd / maxRev) * 100),
        }));
      }
    }

    if (mode === 'YEAR') {
      const map = new Map<number, { revenue: number; count: number }>();
      for (let m = 1; m <= 12; m++) {
        map.set(m, { revenue: 0, count: 0 });
      }
      for (const p of timeline) {
        const m = parseInt(p.date.slice(5, 7), 10);
        const entry = map.get(m);
        if (entry) {
          entry.revenue += p.revenueVnd;
          entry.count += p.orderCount;
        }
      }
      const maxRev = Math.max(...Array.from(map.values()).map(e => e.revenue), 1);
      const list: ChartBar[] = [];
      for (let m = 1; m <= 12; m++) {
        const entry = map.get(m)!;
        list.push({
          key: `M${m}`,
          label: `T${m}`,
          fullDate: `Tháng ${m}/${this.selectedYear()}`,
          revenueVnd: entry.revenue,
          orderCount: entry.count,
          heightPercent: Math.round((entry.revenue / maxRev) * 100),
        });
      }
      return list;
    }

    if (mode === 'DAY') {
      const p = timeline[0];
      if (!p) return [];
      const parts = parseDateParts(p.date);
      const dt = new Date(parts.year, parts.month - 1, parts.day);
      const dow = dt.getDay();
      return [{
        key: p.date,
        label: `${VIETNAMESE_DAYS_SHORT[dow]} (${p.label})`,
        fullDate: `${VIETNAMESE_DAYS[dow]}, ngày ${p.label}/${parts.year}`,
        revenueVnd: p.revenueVnd,
        orderCount: p.orderCount,
        heightPercent: 100,
      }];
    }

    // CUSTOM mode
    const group = this.customGroupBy();
    if (group === 'MONTH') {
      const map = new Map<string, { label: string; fullDate: string; revenue: number; count: number }>();
      for (const p of timeline) {
        const ym = p.date.slice(0, 7);
        const m = parseInt(ym.slice(5), 10);
        const y = ym.slice(0, 4);
        if (!map.has(ym)) {
          map.set(ym, { label: `T${m}`, fullDate: `Tháng ${m}/${y}`, revenue: 0, count: 0 });
        }
        const entry = map.get(ym)!;
        entry.revenue += p.revenueVnd;
        entry.count += p.orderCount;
      }
      const maxRev = Math.max(...Array.from(map.values()).map(e => e.revenue), 1);
      return Array.from(map.entries()).map(([key, val]) => ({
        key,
        label: val.label,
        fullDate: val.fullDate,
        revenueVnd: val.revenue,
        orderCount: val.count,
        heightPercent: Math.round((val.revenue / maxRev) * 100),
      }));
    }

    if (group === 'QUARTER') {
      const map = new Map<string, { label: string; fullDate: string; revenue: number; count: number }>();
      for (const p of timeline) {
        const y = p.date.slice(0, 4);
        const m = parseInt(p.date.slice(5, 7), 10);
        const q = Math.floor((m - 1) / 3) + 1;
        const qKey = `${y}-Q${q}`;
        if (!map.has(qKey)) {
          map.set(qKey, { label: `Quý ${q}`, fullDate: `Quý ${q} - Năm ${y}`, revenue: 0, count: 0 });
        }
        const entry = map.get(qKey)!;
        entry.revenue += p.revenueVnd;
        entry.count += p.orderCount;
      }
      const maxRev = Math.max(...Array.from(map.values()).map(e => e.revenue), 1);
      return Array.from(map.entries()).map(([key, val]) => ({
        key,
        label: val.label,
        fullDate: val.fullDate,
        revenueVnd: val.revenue,
        orderCount: val.count,
        heightPercent: Math.round((val.revenue / maxRev) * 100),
      }));
    }

    if (group === 'WEEK') {
      const list: ChartBar[] = [];
      const chunkSize = 7;
      for (let i = 0; i < timeline.length; i += chunkSize) {
        const slice = timeline.slice(i, i + chunkSize);
        const first = slice[0];
        const last = slice[slice.length - 1];
        const rev = slice.reduce((sum, item) => sum + item.revenueVnd, 0);
        const count = slice.reduce((sum, item) => sum + item.orderCount, 0);
        const weekIndex = Math.floor(i / chunkSize) + 1;
        list.push({
          key: `W${weekIndex}`,
          label: `Tuần ${weekIndex}`,
          fullDate: `Tuần ${weekIndex} (${first.label} - ${last.label})`,
          revenueVnd: rev,
          orderCount: count,
          heightPercent: 0,
        });
      }
      const maxRev = Math.max(...list.map(e => e.revenueVnd), 1);
      return list.map(b => ({
        ...b,
        heightPercent: Math.round((b.revenueVnd / maxRev) * 100),
      }));
    }

    // Default: DAY
    const maxRev = Math.max(...timeline.map(p => p.revenueVnd), 1);
    return timeline.map(p => ({
      key: p.date,
      label: p.label,
      fullDate: `Ngày ${p.label}/${p.date.slice(0, 4)}`,
      revenueVnd: p.revenueVnd,
      orderCount: p.orderCount,
      heightPercent: Math.round((p.revenueVnd / maxRev) * 100),
    }));
  });

  constructor() {
    this.applyWeekRange();
  }

  setViewMode(mode: 'WEEK' | 'MONTH' | 'YEAR' | 'DAY' | 'CUSTOM') {
    this.viewMode.set(mode);
    if (mode === 'WEEK') this.applyWeekRange();
    else if (mode === 'MONTH') this.applyMonthRange();
    else if (mode === 'YEAR') this.applyYearRange();
    else if (mode === 'DAY') this.applyDayRange();
    else if (mode === 'CUSTOM') this.applyCustomRange();
  }

  // Chế độ xem theo tuần
  shiftWeek(delta: number) {
    const curr = this.weekAnchorDate();
    this.weekAnchorDate.set(new Date(curr.getFullYear(), curr.getMonth(), curr.getDate() + delta * 7));
    this.applyWeekRange();
  }

  resetToCurrentWeek() {
    this.weekAnchorDate.set(new Date(this.today.year, this.today.month - 1, this.today.day));
    this.applyWeekRange();
  }

  onWeekAnchorChange(dateStr: string) {
    if (!dateStr) return;
    const parts = parseDateParts(dateStr);
    this.weekAnchorDate.set(new Date(parts.year, parts.month - 1, parts.day));
    this.applyWeekRange();
  }

  private applyWeekRange() {
    const { monday, sunday } = getWeekMondayAndSunday(this.weekAnchorDate());
    this.from = formatDate(monday);
    this.to = formatDate(sunday);
    void this.load();
  }

  // Chế độ xem theo tháng
  shiftMonth(delta: number) {
    let m = this.selectedMonth() + delta;
    let y = this.selectedYear();
    while (m < 1) { m += 12; y--; }
    while (m > 12) { m -= 12; y++; }
    this.selectedMonth.set(m);
    this.selectedYear.set(y);
    this.applyMonthRange();
  }

  resetToCurrentMonth() {
    this.selectedMonth.set(this.today.month);
    this.selectedYear.set(this.today.year);
    this.applyMonthRange();
  }

  onMonthInputChange(val: string) {
    if (!val) return;
    const [y, m] = val.split('-').map(Number);
    if (y && m) {
      this.selectedYear.set(y);
      this.selectedMonth.set(m);
      this.applyMonthRange();
    }
  }

  private applyMonthRange() {
    const y = this.selectedYear();
    const m = this.selectedMonth();
    const mStr = String(m).padStart(2, '0');
    const lastDay = new Date(y, m, 0).getDate();
    this.from = `${y}-${mStr}-01`;
    this.to = `${y}-${mStr}-${String(lastDay).padStart(2, '0')}`;
    void this.load();
  }

  // Chế độ xem theo năm
  shiftYear(delta: number) {
    this.selectedYear.update(y => y + delta);
    this.applyYearRange();
  }

  resetToCurrentYear() {
    this.selectedYear.set(this.today.year);
    this.applyYearRange();
  }

  onYearChange(val: number) {
    if (!val || val < 2000 || val > 2100) return;
    this.selectedYear.set(val);
    this.applyYearRange();
  }

  private applyYearRange() {
    const y = this.selectedYear();
    this.from = `${y}-01-01`;
    this.to = `${y}-12-31`;
    void this.load();
  }

  // Chế độ xem theo ngày
  shiftDay(delta: number) {
    const curr = this.selectedDay();
    this.selectedDay.set(new Date(curr.getFullYear(), curr.getMonth(), curr.getDate() + delta));
    this.applyDayRange();
  }

  resetToToday() {
    this.selectedDay.set(new Date(this.today.year, this.today.month - 1, this.today.day));
    this.applyDayRange();
  }

  onDayChange(dateStr: string) {
    if (!dateStr) return;
    const parts = parseDateParts(dateStr);
    this.selectedDay.set(new Date(parts.year, parts.month - 1, parts.day));
    this.applyDayRange();
  }

  private applyDayRange() {
    const str = formatDate(this.selectedDay());
    this.from = str;
    this.to = str;
    void this.load();
  }

  // Chế độ tùy chỉnh khoảng ngày
  private applyCustomRange() {
    this.from = this.customFrom;
    this.to = this.customTo;
    void this.load();
  }

  onCustomSubmit() {
    this.from = this.customFrom;
    this.to = this.customTo;
    void this.load();
  }

  async load() {
    if (this.loading()) return;
    this.error.set('');
    if (!this.from || !this.to || this.from > this.to) {
      this.error.set('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
      return;
    }
    this.loading.set(true);
    try {
      this.data.set(await firstValueFrom(this.pos.dashboard(this.from, this.to)));
    } catch (e) {
      this.error.set(apiError(e));
      this.data.set(null);
    } finally {
      this.loading.set(false);
    }
  }
}
