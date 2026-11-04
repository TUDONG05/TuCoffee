import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-admin-overview',
  imports: [RouterLink],
  template: `<section class="overview" aria-labelledby="overview-title">
    <h1 id="overview-title">Tổng quan</h1>
    <div class="overview-links">
      @for (item of sections; track item.path) {
        <a class="overview-card" [routerLink]="item.path">
          <span class="card-icon" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"><path [attr.d]="item.icon" /></svg></span>
          <h2>{{ item.title }}</h2><p>{{ item.description }}</p>
          <span class="card-action">{{ item.action }} <span aria-hidden="true">→</span></span>
        </a>
      }
    </div>
  </section>`,
  styles: `
    .overview { padding-block: 2.5rem; }
    h1 { font-size: clamp(1.75rem, 4vw, 2.6rem); margin-bottom: 2rem; }
    .overview-links { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.25rem; }
    .overview-card { display: flex; flex-direction: column; padding: 1.5rem; background: var(--surface); border: 1px solid var(--line); color: var(--text); text-decoration: none; }
    .overview-card:hover { border-color: var(--brand); }
    .card-icon { width: 52px; height: 52px; display: grid; place-items: center; color: var(--brand); background: var(--brand-soft); margin-bottom: 1.5rem; }
    h2 { font-size: 1.1rem; font-weight: 600; margin: 0; }
    .overview-card p { font-size: 0.875rem; color: var(--muted); margin: 0.75rem 0 1.5rem; }
    .card-action { display: flex; justify-content: space-between; gap: 1rem; margin-top: auto; font-size: 0.8rem; font-weight: 600; color: var(--brand); }
    @media (max-width: 1100px) { .overview-links { grid-template-columns: minmax(0, 1fr); } }
    @media (max-width: 600px) { .overview { padding-block: 1.75rem; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminOverview {
  readonly sections = [
    { path: '/admin/users', title: 'Tài khoản', description: 'Tra cứu khách hàng, kiểm tra trạng thái và quản lý quyền truy cập.', action: 'Quản lý tài khoản', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z' },
    { path: '/admin/products', title: 'Sản phẩm', description: 'Thêm món, cập nhật giá bán, hình ảnh và trạng thái trong thực đơn.', action: 'Quản lý sản phẩm', icon: 'm12 3 9 5-9 5-9-5 9-5Z M3 8v9l9 5 9-5V8 M12 13v9 M7.5 5.5l9 5' },
    { path: '/admin/categories', title: 'Danh mục', description: 'Sắp xếp các nhóm món và quản lý hiển thị danh mục trên cửa hàng.', action: 'Quản lý danh mục', icon: 'M3 7h18 M3 12h18 M3 17h18 M7 4v16' },
  ];
}
