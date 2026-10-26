import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { apiError } from '../../core/auth/api-error';
import { optionalPhone, passwordPolicy, trimmedLength } from '../../core/auth/form-validators';

@Component({
  selector: 'app-profile-page', imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './profile-page.html', styleUrl: './profile-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePage {
  readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly destroy = inject(DestroyRef);
  readonly denied = inject(ActivatedRoute).snapshot.queryParamMap.get('denied') === '1';
  readonly profileBusy = signal(false);
  readonly passwordBusy = signal(false);
  readonly profileError = signal('');
  readonly passwordError = signal('');
  readonly profileSuccess = signal('');
  readonly passwordSuccess = signal('');
  readonly showPassword = signal(false);
  readonly form = this.fb.nonNullable.group({
    name: [this.auth.user()?.name ?? '', [trimmedLength(2, 100)]],
    phone: [this.auth.user()?.phone ?? '', [optionalPhone]],
    address: [this.auth.user()?.address ?? '', [Validators.maxLength(300)]],
  });
  readonly passwordForm = this.fb.nonNullable.group({
    currentPassword: ['', Validators.required], newPassword: ['', passwordPolicy], confirmPassword: ['', Validators.required],
  });

  invalid(field: 'name' | 'phone' | 'address'): boolean { const c = this.form.controls[field]; return c.touched && c.invalid; }
  passwordInvalid(field: 'currentPassword' | 'newPassword' | 'confirmPassword'): boolean { const c = this.passwordForm.controls[field]; return c.touched && c.invalid; }

  async saveProfile(): Promise<void> {
    if (this.profileBusy()) return;
    const value = this.form.getRawValue();
    this.form.patchValue({ name: value.name.trim(), phone: value.phone.trim(), address: value.address.trim() });
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.profileBusy.set(true); this.profileError.set(''); this.profileSuccess.set('');
    try {
      const { name, phone, address } = this.form.getRawValue();
      await this.auth.updateProfile({ name, phone: phone || null, address: address || null });
      if (!this.destroy.destroyed) this.profileSuccess.set('Đã lưu thông tin cá nhân.');
    } catch (error) { if (!this.destroy.destroyed) this.profileError.set(apiError(error)); }
    finally { if (!this.destroy.destroyed) this.profileBusy.set(false); }
  }

  async savePassword(): Promise<void> {
    if (this.passwordBusy()) return;
    this.passwordForm.markAllAsTouched();
    const { currentPassword, newPassword, confirmPassword } = this.passwordForm.getRawValue();
    if (this.passwordForm.invalid) return;
    if (newPassword !== confirmPassword) { this.passwordError.set('Mật khẩu xác nhận chưa khớp.'); return; }
    this.passwordBusy.set(true); this.passwordError.set(''); this.passwordSuccess.set('');
    try {
      await this.auth.changePassword({ currentPassword, newPassword });
      if (!this.destroy.destroyed) this.passwordSuccess.set('Đã đổi mật khẩu. Các phiên đăng nhập khác đã kết thúc.');
    } catch (error) { if (!this.destroy.destroyed) this.passwordError.set(apiError(error)); }
    finally { this.passwordForm.reset(); if (!this.destroy.destroyed) this.passwordBusy.set(false); }
  }
}
