import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, Observable } from 'rxjs';
import { VndPipe } from '../../core/catalog/catalog-ui';
import { Voucher, VoucherCustomer, VoucherGroup, VoucherService, VoucherStats } from '../../core/vouchers/voucher.service';

@Component({
  imports: [DatePipe, ReactiveFormsModule, RouterLink, VndPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Quản lý voucher</h1>
    @if (message()) { <p role="status">{{ message() }}</p> }
    <div class="voucher-admin">
      <section>
        <div class="toolbar"><h2>Danh sách voucher</h2><button type="button" (click)="edit(null)" [disabled]="busy()">Tạo voucher</button></div>
        <div class="table-scroll">
          <table>
            <thead><tr><th>Mã và tên</th><th>Mức giảm</th><th>Hết hạn</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
            <tbody>
              @for (v of vouchers(); track v.id) {
                <tr>
                  <td><strong>{{ v.code }}</strong><br>{{ v.title }}</td>
                  <td>{{ v.kind === 'PERCENT' ? v.amount + '%' : (v.amount | vnd) }}</td>
                  <td>{{ v.endsAt | date:'dd/MM/yyyy HH:mm' }}</td>
                  <td>{{ v.enabled ? 'Đang bật' : 'Đã tắt' }}</td>
                  <td><button type="button" [disabled]="busy()" (click)="edit(v)">Quản lý</button></td>
                </tr>
              } @empty { <tr><td colspan="5">Chưa có voucher.</td></tr> }
            </tbody>
          </table>
        </div>
      </section>
      @if (editing()) {
        <section>
          <div class="toolbar"><h2>{{ selected() ? 'Chỉnh sửa voucher' : 'Tạo voucher' }}</h2><button type="button" [disabled]="busy()" (click)="editing.set(false)">Đóng</button></div>
          <form [formGroup]="form" (ngSubmit)="save()">
            <label>Tên chương trình <input formControlName="title" maxlength="160"></label>
            <label>Mô tả <textarea formControlName="description" rows="3" maxlength="4000"></textarea></label>
            <fieldset class="fields" [disabled]="selected() !== null && (!stats() || !!stats()?.usage?.length)">
              <label>Mã voucher <input formControlName="code" maxlength="40" placeholder="TUCOFFEE10"></label>
              <label>Loại giảm <select formControlName="kind"><option value="FIXED">Số tiền</option><option value="PERCENT">Phần trăm</option></select></label>
              <label>Mức giảm <input type="number" min="1" formControlName="amount"></label>
              <label>Đơn tối thiểu (₫) <input type="number" min="0" formControlName="minSubtotal"></label>
              <label>Giảm tối đa (₫) <input type="number" min="1" formControlName="maxDiscount"></label>
              <label>Bắt đầu <input type="datetime-local" formControlName="startsAt"></label>
              <label>Kết thúc <input type="datetime-local" formControlName="endsAt"></label>
              <label>Tổng lượt <input type="number" min="1" formControlName="totalLimit"></label>
              <label>Lượt mỗi khách <input type="number" min="1" formControlName="perUserLimit"></label>
            </fieldset>
            @if (stats()?.usage?.length) { <p>Điều kiện giảm đã được dùng trong đơn. Tạo voucher mới để đổi các điều kiện này.</p> }
            <div class="checks">
              <label><input type="checkbox" formControlName="enabled"> Cho phép sử dụng</label>
              <label><input type="checkbox" formControlName="advertised"> Hiện trên trang Khuyến mại</label>
              <label><input type="checkbox" formControlName="selfClaim"> Cho khách tự nhận trên trang Khuyến mại</label>
            </div>
            <button type="submit" [disabled]="form.invalid || busy()">Lưu voucher</button>
          </form>
        </section>
      }
      @if (selected(); as voucher) {
        <section>
          <h2>Cấp voucher {{ voucher.code }}</h2>
          <div class="fields">
            <label>Đối tượng <select #target [value]="grantTarget()" (change)="grantTarget.set(target.value); targetId.set(0)">
              <option value="ALL">Tất cả khách hiện có</option><option value="GROUP">Nhóm khách</option><option value="USER">Từng khách</option>
            </select></label>
            @if (grantTarget() === 'GROUP') {
              <label>Nhóm <select #group (change)="targetId.set(+group.value)">
                <option value="">Chọn nhóm</option>
                @for (g of groups(); track g.id) { <option [value]="g.id">{{ g.name }}</option> }
              </select></label>
            } @else if (grantTarget() === 'USER') {
              <label>Khách hàng <select #customer (change)="targetId.set(+customer.value)">
                <option value="">Chọn khách</option>
                @for (c of customers(); track c.id) { <option [value]="c.id">{{ c.name }} · {{ c.email }}</option> }
              </select></label>
            }
          </div>
          @if (grantTarget() === 'USER') {
            <form class="search" (submit)="$event.preventDefault(); search(searchUser.value)">
              <label>Tìm khách thêm vào danh sách <input #searchUser type="search" placeholder="Email hoặc tên"></label>
              <button type="submit" [disabled]="busy()">Tìm</button>
            </form>
          }
          <button type="button" [disabled]="busy() || !voucher.enabled || (grantTarget() !== 'ALL' && !targetId())" (click)="grant()">Xác nhận cấp voucher</button>
          @if (stats(); as info) {
            <h3>Lịch sử sử dụng</h3><p>Đã cấp cho {{ info.granted }} khách.</p>
            @for (entry of info.usage; track entry.orderId) {
              <p><a [routerLink]="['/admin/orders', entry.orderId]">#{{ entry.publicCode }}</a>
                · {{ entry.discountVnd | vnd }}
                · {{ entry.status === 'CANCELLED' ? 'Đã hủy' : entry.paymentStatus === 'PAID' || entry.status === 'COMPLETED' ? 'Đã dùng' : 'Đang giữ lượt' }}
              </p>
            } @empty { <p>Chưa có đơn áp dụng.</p> }
          }
        </section>
      }
      <section>
        <h2>Nhóm khách hàng</h2>
        <div class="fields">
          <label>Nhóm <select #groupToEdit [value]="groupId() ?? 0" [disabled]="busy()" (change)="editGroup(+groupToEdit.value)">
            <option value="0">Tạo nhóm mới</option>
            @for (g of groups(); track g.id) { <option [value]="g.id">{{ g.name }}</option> }
          </select></label>
          <label>Tên nhóm <input #groupNameInput [value]="groupName()" (input)="groupName.set(groupNameInput.value)" maxlength="100"></label>
        </div>
        <form class="search" (submit)="$event.preventDefault(); search(searchGroup.value)">
          <label>Tìm theo tên hoặc email <input #searchGroup type="search"></label>
          <button type="submit" [disabled]="busy()">Tìm khách</button>
        </form>
        <div class="members">
          @for (c of customers(); track c.id) {
            <label><input type="checkbox" [checked]="memberIds().includes(c.id)" [disabled]="busy()" (change)="toggleMember(c.id)"> {{ c.name }} ({{ c.email }})</label>
          }
        </div>
        <p>Đã chọn {{ memberIds().length }} thành viên.</p>
        <button type="button" [disabled]="busy() || !groupName().trim()" (click)="saveGroup()">Lưu nhóm</button>
      </section>
    </div>
  `,
  styles: `
    h1 { margin-bottom: 1rem; font-size: 1.8rem; }
    h2 { font-size: 1.2rem; margin: 0 0 .7rem; }
    h3 { font-size: 1rem; margin: .9rem 0 .4rem; }
    .voucher-admin { display: grid; gap: 1rem; }
    section { min-width: 0; padding: 1rem; background: white; border: 1px solid #eadfd6; }
    .toolbar, .checks, .search { display: flex; align-items: end; gap: .65rem; flex-wrap: wrap; margin-bottom: .7rem; }
    .toolbar { justify-content: space-between; align-items: center; }
    .table-scroll, .members { overflow: auto; }
    .members { max-height: 13rem; }
    table { width: 100%; min-width: 36rem; border-collapse: collapse; }
    th, td { padding: .6rem; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f7f6f5; }
    fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
    .fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr)); gap: .55rem; }
    label { display: block; margin-bottom: .45rem; }
    input:not([type=checkbox]), textarea, select { display: block; width: 100%; margin-top: .2rem; padding: .45rem; border: 1px solid #d8cbc1; }
    button { font-size: .85rem; }
  `,
})
export class AdminVouchersPage {
  private readonly api = inject(VoucherService);
  private readonly fb = inject(FormBuilder);
  readonly vouchers = signal<Voucher[]>([]);
  readonly groups = signal<VoucherGroup[]>([]);
  readonly customers = signal<VoucherCustomer[]>([]);
  readonly selected = signal<Voucher | null>(null);
  readonly editing = signal(false);
  readonly stats = signal<VoucherStats | null>(null);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly grantTarget = signal('ALL');
  readonly targetId = signal(0);
  readonly groupId = signal<number | null>(null);
  readonly groupName = signal('');
  readonly memberIds = signal<number[]>([]);
  readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^[A-Z0-9_-]{2,40}$/)]],
    title: ['', Validators.required], description: [''],
    kind: ['FIXED' as Voucher['kind']], amount: [10_000, Validators.min(1)],
    minSubtotal: [0, Validators.min(0)], maxDiscount: this.fb.control<number | null>(null),
    startsAt: ['', Validators.required], endsAt: ['', Validators.required],
    totalLimit: [100, Validators.min(1)], perUserLimit: [1, Validators.min(1)],
    enabled: [true], advertised: [false], selfClaim: [false], version: [0],
  });

  constructor() {
    this.refresh();
    this.search('');
  }

  edit(v: Voucher | null): void {
    this.selected.set(v);
    this.editing.set(true);
    this.grantTarget.set('ALL');
    this.targetId.set(0);
    this.stats.set(null);
    const local = (iso: string) => {
      const date = new Date(iso);
      return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    };
    this.form.reset(v ? { ...v, startsAt: local(v.startsAt), endsAt: local(v.endsAt) }
      : { startsAt: local(new Date().toISOString()), endsAt: local(new Date(Date.now() + 7 * 86400000).toISOString()) });
    if (v) this.api.stats(v.id).subscribe({ next: info => {
      if (this.selected()?.id === v.id) this.stats.set(info);
    }, error: error => this.showError(error) });
  }

  save(): void {
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    const id = this.selected()?.id ?? null;
    const payload = { ...value, startsAt: new Date(value.startsAt).toISOString(), endsAt: new Date(value.endsAt).toISOString() };
    this.run(this.api.save(id, payload), () => {
      this.editing.set(false);
      this.selected.set(null);
      this.message.set('Đã lưu voucher.');
      this.refresh();
    });
  }

  grant(): void {
    const v = this.selected();
    if (!v) return;
    const target = this.grantTarget();
    const id = target === 'ALL' ? null : this.targetId();
    this.run(this.api.grant(v.id, target, id), result => {
      this.message.set(`Đã cấp thêm cho ${result.granted} khách.`);
      this.api.stats(v.id).subscribe({ next: info => {
        if (this.selected()?.id === v.id) this.stats.set(info);
      }, error: error => this.showError(error) });
    });
  }

  editGroup(id: number): void {
    this.groupId.set(id || null);
    this.groupName.set(this.groups().find(g => g.id === id)?.name ?? '');
    this.memberIds.set([]);
    if (id) this.run(this.api.members(id), members => {
      if (this.groupId() === id) this.memberIds.set(members);
    });
  }

  toggleMember(id: number): void {
    this.memberIds.update(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  }

  saveGroup(): void {
    this.run(this.api.saveGroup(this.groupId(), this.groupName().trim(), this.memberIds()), () => {
      this.message.set('Đã lưu nhóm khách.');
      if (this.groupId() === null) this.editGroup(0);
      this.refresh();
    });
  }

  search(query: string): void {
    this.api.customers(query).subscribe({ next: customers => this.customers.set(customers), error: error => this.showError(error) });
  }

  private refresh(): void {
    this.run(forkJoin({ vouchers: this.api.vouchers(), groups: this.api.groups() }), result => {
      this.vouchers.set(result.vouchers);
      this.groups.set(result.groups);
    });
  }

  private run<T>(request: Observable<T>, done: (result: T) => void): void {
    if (this.busy()) return;
    this.busy.set(true);
    request.subscribe({
      next: result => { this.busy.set(false); done(result); },
      error: error => { this.busy.set(false); this.showError(error); },
    });
  }

  private showError(error: HttpErrorResponse): void {
    this.message.set(error.error?.detail ?? 'Thao tác chưa hoàn tất. Vui lòng thử lại.');
  }
}
