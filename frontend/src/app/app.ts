import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { AuthService } from './core/auth/auth.service';
import { AuthPage } from './features/auth/auth-page';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzDropdownModule } from 'ng-zorro-antd/dropdown';
import { NzMenuModule } from 'ng-zorro-antd/menu';

@Component({
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    AuthPage,
    NzAlertModule,
    NzButtonModule,
    NzModalModule,
    NzDropdownModule,
    NzMenuModule,
  ],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  readonly accountMenuOpen = signal(false);
  readonly currentYear = new Date().getFullYear();
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly isAdminArea = toSignal(this.router.events.pipe(
    filter((event): event is NavigationEnd => event instanceof NavigationEnd),
    map(event => /^\/admin(?:[/?#]|$)/.test(event.urlAfterRedirects)),
  ), { initialValue: /^\/admin(?:[/?#]|$)/.test(this.router.url) });
  readonly authMode = signal<'login' | 'register' | null>(null);
  readonly modalBusy = signal(false);
  readonly registered = signal(false);
  openAuth(mode: 'login' | 'register'): void {
    if (this.modalBusy()) return;
    this.registered.set(false);
    this.authMode.set(mode);
  }
  closeAuth(): void {
    if (this.modalBusy()) return;
    this.authMode.set(null);
  }
  authCompleted(): void {
    this.modalBusy.set(false);
    this.closeAuth();
  }
  accountRegistered(): void {
    this.modalBusy.set(false);
    this.registered.set(true);
    this.authMode.set('login');
  }
  readonly loggingOut = signal(false);
  readonly logoutFailed = this.auth.logoutFailed;
  async logout(): Promise<void> {
    if (this.loggingOut()) return;
    this.loggingOut.set(true);
    try {
      await this.auth.logout();
    } catch {
      // The shared auth state keeps the retry action available across layouts.
    } finally {
      this.loggingOut.set(false);
      await this.router.navigate(['/login']);
    }
  }
}
