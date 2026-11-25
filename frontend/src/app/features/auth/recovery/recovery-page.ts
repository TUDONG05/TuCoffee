import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { RecoveryService } from '../../../core/recovery/recovery.service';
import { passwordPolicy } from '../../../core/auth/form-validators';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { apiError } from '../../../core/auth/api-error';

@Component({
  selector: 'app-recovery-page',
  imports: [ReactiveFormsModule, RouterLink, NzButtonModule, NzInputModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`:host{display:block;max-width:520px;margin:3rem auto;padding:2rem;background:#fffaf4;border:1px solid #dbcbb9}form{display:grid;gap:12px}input,button{padding:12px;border:1px solid #b9a28c}button{cursor:pointer;background:#6b4226;color:white}button:disabled{opacity:.5}a{display:inline-block;margin-top:20px}label{font-weight:600}.error{color:#a52121}`],
  template: `
    <h1>Quên mật khẩu</h1>
    <p>Nhập email đã đăng ký để yêu cầu mã đặt lại mật khẩu.</p>
    @if (error()) { <p role="alert" class="error">{{ error() }}</p> }
    @if (notice()) { <p role="status">{{ notice() }}</p> }
    @if (!done()) {
      <form [formGroup]="emailForm" (ngSubmit)="request()">
        <label for="recovery-email">Email</label>
        <input nz-input nzSize="large" id="recovery-email" type="email" autocomplete="email" formControlName="email" [readOnly]="busy()" required>
        <button nz-button nzType="primary" nzSize="large" type="submit" [disabled]="busy() || emailForm.invalid || !canResend()">{{ challengeId() ? 'Yêu cầu mã mới (sau 60 giây)' : 'Yêu cầu mã' }}</button>
      </form>
      @if (challengeId()) {
        <p>Mã có hiệu lực 10 phút và tối đa 5 lần thử. Kiểm tra cả thư rác. Yêu cầu mã mới sẽ thay thế mã cũ.</p>
        <form [formGroup]="resetForm" (ngSubmit)="reset()">
          <label for="recovery-code">Mã gồm 6 chữ số</label>
          <input nz-input nzSize="large" id="recovery-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" formControlName="code" required>
          <label for="recovery-password">Mật khẩu mới</label>
          <input nz-input nzSize="large" id="recovery-password" type="password" autocomplete="new-password" formControlName="password" required>
          <small>Ít nhất 10 ký tự, tối đa 72 byte UTF-8.</small>
          <label for="recovery-confirm">Nhập lại mật khẩu</label>
          <input nz-input nzSize="large" id="recovery-confirm" type="password" autocomplete="new-password" formControlName="confirm" required>
          <button nz-button nzType="primary" nzSize="large" type="submit" [disabled]="busy() || resetForm.invalid">Đặt lại mật khẩu</button>
        </form>
      }
    }
    <a routerLink="/login">Về đăng nhập</a>
  `,
})
export class RecoveryPage {
  private readonly recovery = inject(RecoveryService);
  private readonly destroy = inject(DestroyRef);
  private resendTimer?: ReturnType<typeof setTimeout>;
  constructor() { this.destroy.onDestroy(() => clearTimeout(this.resendTimer)); }
  private readonly fb = inject(FormBuilder);
  readonly busy = signal(false);
  readonly done = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly challengeId = signal('');
  readonly canResend = signal(true);
  readonly emailForm = this.fb.nonNullable.group({ email: ['', [Validators.required, Validators.email, Validators.maxLength(150)]] });
  readonly resetForm = this.fb.nonNullable.group({ code: ['', [Validators.required, Validators.pattern(/^[0-9]{6}$/)]], password: ['', [passwordPolicy]], confirm: ['', [Validators.required]] });
  async request(): Promise<void> {
    if (this.busy() || this.emailForm.invalid || !this.canResend()) return;
    this.busy.set(true); this.error.set('');
    try {
      const result = await this.recovery.request(this.emailForm.controls.email.value.trim());
      this.challengeId.set(result.challengeId); this.notice.set(result.message); this.canResend.set(false);
      this.resetForm.reset();
      this.resendTimer = setTimeout(() => this.canResend.set(true), result.resendAfter * 1000);
    } catch (e) { this.error.set(apiError(e)); }
    finally { this.busy.set(false); }
  }
  async reset(): Promise<void> {
    if (this.busy() || this.resetForm.invalid) return;
    const { code, password, confirm } = this.resetForm.getRawValue();
    if (password !== confirm) { this.error.set('Mật khẩu nhập lại chưa khớp.'); return; }
    this.busy.set(true); this.error.set('');
    try {
      await this.recovery.reset(this.challengeId(), code, password);
      this.done.set(true); this.notice.set('Đã đặt lại mật khẩu và kết thúc các phiên cũ. Vui lòng đăng nhập bằng mật khẩu mới.');
    } catch (e) { this.error.set(apiError(e)); }
    finally { this.resetForm.controls.password.reset(); this.resetForm.controls.confirm.reset(); this.busy.set(false); }
  }
}
