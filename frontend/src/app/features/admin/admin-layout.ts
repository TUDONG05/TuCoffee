import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDropdownModule } from 'ng-zorro-antd/dropdown';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-admin-layout',
  imports: [NgTemplateOutlet, RouterLink, RouterLinkActive, RouterOutlet, NzButtonModule, NzDropdownModule, NzMenuModule],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.scss',
  host: { '(window:resize)': 'onViewportChange()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLayout {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly mobileMenu = viewChild<ElementRef<HTMLDialogElement>>('mobileMenu');
  readonly menuOpen = signal(false);
  readonly accountMenuOpen = signal(false);
  readonly loggingOut = signal(false);
  readonly links = [
    { path: '/admin', label: 'Tổng quan', icon: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z' },
    { path: '/admin/orders', label: 'Quản lý đơn hàng', icon: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
    { path: '/admin/users', label: 'Quản lý tài khoản', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z' },
    { path: '/admin/products', label: 'Quản lý sản phẩm', icon: 'm12 3 9 5-9 5-9-5 9-5Z M3 8v9l9 5 9-5V8 M12 13v9 M7.5 5.5l9 5' },
    { path: '/admin/categories', label: 'Quản lý danh mục', icon: 'M3 7h18 M3 12h18 M3 17h18 M7 4v16' },
  ];

  openMenu(): void {
    this.mobileMenu()?.nativeElement.showModal();
    this.menuOpen.set(true);
  }
  closeMenu(): void {
    this.mobileMenu()?.nativeElement.close();
    this.menuOpen.set(false);
  }
  closeBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closeMenu();
  }
  onViewportChange(): void {
    if (this.menuOpen() && window.matchMedia('(min-width: 901px)').matches) this.closeMenu();
  }
  async logout(): Promise<void> {
    if (this.loggingOut()) return;
    this.loggingOut.set(true);
    try { await this.auth.logout(); }
    catch { /* AuthService displays the server logout failure through its notice. */ }
    finally {
      this.loggingOut.set(false);
      await this.router.navigate(['/login']);
    }
  }
}
