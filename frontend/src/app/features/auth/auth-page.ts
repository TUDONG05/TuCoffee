import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
  Input,
  OnChanges,
  output,
  effect,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { apiError } from '../../core/auth/api-error';
import { AuthService } from '../../core/auth/auth.service';
import { passwordPolicy, trimmedLength } from '../../core/auth/form-validators';
import { safeReturnUrl } from '../../core/auth/auth.guards';
import { HttpErrorResponse } from '@angular/common/http';
import { GoogleSignIn } from './google-sign-in';
import { TurnstileWidget } from './turnstile-widget';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzTabsModule } from 'ng-zorro-antd/tabs';

@Component({
  selector: 'app-auth-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NzAlertModule,
    NzButtonModule,
    NzFormModule,
    NzInputModule,
    GoogleSignIn,
    TurnstileWidget,
    NzTabsModule,
  ],
  templateUrl: './auth-page.html',
  styleUrl: './auth-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthPage implements OnChanges {
  @Input() mode?: 'login' | 'register';
  @Input() registered = false;
  readonly completed = output<void>();
  readonly registeredAccount = output<void>();
  readonly modeChange = output<'login' | 'register'>();
  readonly busyChange = output<boolean>();
  private readonly reportBusy = effect(() => this.busyChange.emit(this.busy()));
  private readonly redirectIfLoggedIn = effect(() => {
    const user = typeof this.auth.user === 'function' ? this.auth.user() : null;
    if (!this.embedded && user) {
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      void this.router.navigateByUrl(safeReturnUrl(returnUrl));
    }
  });
  get embedded(): boolean {
    return this.mode !== undefined;
  }
  get register(): boolean {
    return this.mode ? this.mode === 'register' : this.route.snapshot.data['mode'] === 'register';
  }
  ngOnChanges(): void {
    this.form.controls.name.setValidators(this.register ? [trimmedLength(2, 100)] : []);
    this.form.controls.password.setValidators(
      this.register ? [passwordPolicy] : [Validators.required],
    );
    this.form.controls.name.updateValueAndValidity();
    this.form.controls.password.updateValueAndValidity();
    if (this.registered) this.success.set('Tạo tài khoản thành công. Bạn có thể đăng nhập ngay.');
  }

  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy = inject(DestroyRef);
  readonly auth = inject(AuthService);
  readonly challenge = viewChild(TurnstileWidget);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly visible = signal(false);
  readonly googleLink = signal(false);
  readonly googleLinkForm = this.fb.nonNullable.group({
    currentPassword: ['', [Validators.required]],
  });
  readonly googlePassword = this.googleLinkForm.controls.currentPassword;
  private googleCredential = '';
  readonly success = signal(
    this.route.snapshot.queryParamMap.get('registered') === '1'
      ? 'Tạo tài khoản thành công. Bạn có thể đăng nhập ngay.'
      : '',
  );
  readonly passwordType = computed(() => (this.visible() ? 'text' : 'password'));
  readonly form = this.fb.nonNullable.group({
    name: ['', this.register ? [trimmedLength(2, 100)] : []],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(150)]],
    password: ['', this.register ? [passwordPolicy] : [Validators.required]],
  });

  switchTab(index: number): void {
    const mode = index === 1 ? 'register' : 'login';
    if (this.busy() || (mode === 'register') === this.register) return;
    if (this.embedded) this.modeChange.emit(mode);
    else void this.router.navigate([mode === 'register' ? '/register' : '/login']);
  }

  invalid(field: 'name' | 'email' | 'password'): boolean {
    const control = this.form.controls[field];
    return control.touched && control.invalid;
  }

  async submit(): Promise<void> {
    if (this.busy()) return;
    this.cancelGoogleLink();
    this.form.controls.name.setValue(this.form.controls.name.value.trim());
    this.form.controls.email.setValue(this.form.controls.email.value.trim());
    this.form.markAllAsTouched();
    if (this.form.invalid || !this.challenge()?.canSubmit()) return;
    this.error.set('');
    this.busy.set(true);
    const { name, email, password } = this.form.getRawValue();
    try {
      if (this.register) {
        await this.auth.register({ name, email, password }, this.challenge()?.token() || undefined);
        if (!this.destroy.destroyed) {
          if (this.embedded) this.registeredAccount.emit();
          else await this.router.navigate(['/login'], { queryParams: { registered: '1' } });
        }
      } else {
        await this.auth.login({ email, password }, this.challenge()?.token() || undefined);
        if (!this.destroy.destroyed) {
          if (this.embedded) this.completed.emit();
          else
            await this.router.navigateByUrl(
              safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')),
            );
        }
      }
    } catch (error) {
      if (!this.destroy.destroyed) this.error.set(apiError(error));
    } finally {
      if (!this.destroy.destroyed) this.challenge()?.reset();
      this.form.controls.password.reset();
      if (!this.destroy.destroyed) this.busy.set(false);
    }
  }

  async signInWithGoogle(credential: string): Promise<void> {
    if (this.busy()) return;
    this.googleCredential = credential;
    this.googlePassword.reset();
    this.googleLink.set(false);
    await this.completeGoogle();
  }

  async confirmGoogleLink(): Promise<void> {
    this.googlePassword.markAsTouched();
    if (this.busy() || this.googlePassword.invalid) return;
    await this.completeGoogle(this.googlePassword.value);
  }

  cancelGoogleLink(): void {
    this.googleCredential = '';
    this.googleLink.set(false);
    this.googlePassword.reset();
  }

  private async completeGoogle(password?: string): Promise<void> {
    if (!this.googleCredential) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.googleLogin(this.googleCredential, password);
      this.cancelGoogleLink();
      if (!this.destroy.destroyed) {
        if (this.embedded) this.completed.emit();
        else
          await this.router.navigateByUrl(
            safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')),
          );
      }
    } catch (error) {
      if (this.destroy.destroyed) return;
      const code = error instanceof HttpErrorResponse ? error.error?.code : undefined;
      if (code === 'GOOGLE_LINK_REQUIRED') {
        this.googleLink.set(true);
      } else {
        this.error.set(apiError(error));
        if (code !== 'INVALID_CREDENTIALS') this.cancelGoogleLink();
      }
    } finally {
      this.googlePassword.reset();
      if (!this.destroy.destroyed) this.busy.set(false);
    }
  }
}
