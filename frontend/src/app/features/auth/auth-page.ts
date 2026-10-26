import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { apiError } from '../../core/auth/api-error';
import { AuthService } from '../../core/auth/auth.service';
import { passwordPolicy, trimmedLength } from '../../core/auth/form-validators';
import { safeReturnUrl } from '../../core/auth/auth.guards';

@Component({
  selector: 'app-auth-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './auth-page.html',
  styleUrl: './auth-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthPage {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy = inject(DestroyRef);
  readonly auth = inject(AuthService);
  readonly register = this.route.snapshot.data['mode'] === 'register';
  readonly busy = signal(false);
  readonly error = signal('');
  readonly visible = signal(false);
  readonly success = signal(this.route.snapshot.queryParamMap.get('registered') === '1' ? 'Tạo tài khoản thành công. Bạn có thể đăng nhập ngay.' : '');
  readonly passwordType = computed(() => this.visible() ? 'text' : 'password');
  readonly form = this.fb.nonNullable.group({
    name: ['', this.register ? [trimmedLength(2, 100)] : []],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(150)]],
    password: ['', this.register ? [passwordPolicy] : [Validators.required]],
  });

  invalid(field: 'name' | 'email' | 'password'): boolean {
    const control = this.form.controls[field];
    return control.touched && control.invalid;
  }

  async submit(): Promise<void> {
    if (this.busy()) return;
    this.form.controls.name.setValue(this.form.controls.name.value.trim());
    this.form.controls.email.setValue(this.form.controls.email.value.trim());
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.error.set(''); this.busy.set(true);
    const { name, email, password } = this.form.getRawValue();
    try {
      if (this.register) {
        await this.auth.register({ name, email, password });
        if (!this.destroy.destroyed) await this.router.navigate(['/login'], { queryParams: { registered: '1' } });
      } else {
        await this.auth.login({ email, password });
        if (!this.destroy.destroyed) await this.router.navigateByUrl(safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')));
      }
    } catch (error) {
      if (!this.destroy.destroyed) this.error.set(apiError(error));
    } finally {
      this.form.controls.password.reset();
      if (!this.destroy.destroyed) this.busy.set(false);
    }
  }
}
