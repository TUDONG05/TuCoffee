import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable, catchError, map, of, startWith, switchMap } from 'rxjs';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzTableModule } from 'ng-zorro-antd/table';

interface Summary { slug: string; title: string; imageUrl?: string | null }
interface PolicyInput extends Summary { content: string }
interface Policy extends PolicyInput { id: number; version: number; published: boolean; updatedAt: string }
interface PublicState { policy?: PolicyInput; items?: Summary[]; message?: string }

@Component({
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="policy-page">
      @if (state(); as view) {
        @if (view.policy; as policy) {
          <a routerLink="/chinh-sach">← Tất cả chính sách</a>
          <h1>{{ policy.title }}</h1>
          <div class="policy-content">{{ policy.content }}</div>
        } @else {
          <h1>Chính sách TuCoffee</h1>
          @if (view.items?.length) {
            <div class="policy-grid">
              @for (item of view.items; track item.slug) {
                <a class="policy-card" [routerLink]="['/chinh-sach', item.slug]" [attr.data-topic]="item.slug">
                  <img [src]="item.imageUrl || '/banner.png'" alt="" width="640" height="260">
                  <div class="card-body">
                    <h2>{{ item.title }}</h2>
                    <span class="card-link" aria-hidden="true">Xem chi tiết</span>
                  </div>
                </a>
              }
            </div>
          } @else if (view.items) {
            <p>Chưa có chính sách được công bố.</p>
          }
        }
        @if (view.message) { <p role="status">{{ view.message }}</p> }
      }
    </section>
  `,
  styles: `
    .policy-page { max-width: 72rem; margin: auto; padding: 2rem 1rem 3rem; }
    h1 { margin: .5rem 0 1.5rem; font-size: clamp(1.9rem, 4vw, 3rem); }
    .policy-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr)); gap: 1rem; }
    .policy-card { display: flex; flex-direction: column; overflow: hidden; border: 1px solid #e8dbd0; background: #fff; color: #302017; text-decoration: none; }
    .policy-card:hover { color: #302017; border-color: #a98168; box-shadow: 0 .35rem 1rem #30201712; }
    .policy-card img { display: block; width: 100%; height: 9rem; object-fit: cover; object-position: 50% 50%; background: #f2e7db; }
    .policy-card[data-topic="dat-hang-va-giao-nhan"] img { object-position: 22% 40%; }
    .policy-card[data-topic="huy-don-va-su-co"] img { object-position: 72% 65%; }
    .policy-card[data-topic="thanh-toan"] img { object-position: 48% 75%; }
    .card-body { display: grid; flex: 1; align-content: space-between; gap: .55rem; padding: .9rem 1rem; }
    .card-body h2 { margin: 0; font-size: 1.1rem; line-height: 1.4; }
    .card-link { color: var(--brand); font-weight: 600; }
    .policy-content { max-width: 50rem; padding: 1.2rem; background: white; border: 1px solid #e8dbd0; border-radius: .85rem; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.7; }
  `,
})
export class StorePoliciesPage {
  private readonly http = inject(HttpClient);
  readonly state = toSignal<PublicState>(inject(ActivatedRoute).paramMap.pipe(
    switchMap(params => {
      const slug = params.get('slug');
      const request: Observable<PublicState> = slug
        ? this.http.get<PolicyInput>('/api/v1/policies/' + encodeURIComponent(slug)).pipe(map(policy => ({ policy })))
        : this.http.get<Summary[]>('/api/v1/policies').pipe(map(items => ({ items })));
      return request.pipe(
          startWith({ message: 'Đang tải chính sách…' }),
          catchError((error: HttpErrorResponse) => of({
            message: error.status === 404 ? 'Không tìm thấy chính sách.' : 'Chưa tải được chính sách. Vui lòng thử lại.',
          })),
        );
    }),
  ));
}

@Component({
  imports: [ReactiveFormsModule, DatePipe, NzButtonModule, NzModalModule, NzTableModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="policy-admin" aria-labelledby="policies-heading">
      <h1 id="policies-heading">Danh sách chính sách</h1>
      <form class="toolbar" (submit)="$event.preventDefault(); filter(query.value, status.value)">
        <label>Tìm theo tiêu đề <input #query type="search"></label>
        <label>Trạng thái
          <select #status>
            <option value="">Tất cả</option>
            <option value="published">Đang công khai</option>
            <option value="draft">Bản nháp</option>
          </select>
        </label>
        <button nz-button type="submit">Tìm kiếm</button>
        <button nz-button type="button" (click)="query.value = ''; status.value = ''; filter('', ''); refresh()">Làm mới</button>
        <button nz-button nzType="primary" class="create" type="button" (click)="edit(null)" [disabled]="busy()">Tạo chính sách</button>
      </form>
      @if (message() && !editorOpen()) { <p role="status">{{ message() }}</p> }
      <nz-table #table [nzData]="filtered()" [nzLoading]="busy() && !editorOpen()" [nzPageSize]="20"
        [nzPageIndex]="page()" (nzPageIndexChange)="page.set($event)" [nzScroll]="{ x: '42rem' }"
        nzNoResult="Không tìm thấy chính sách">
        <thead><tr><th>Tiêu đề</th><th>Đường dẫn</th><th>Trạng thái</th><th>Cập nhật</th><th>Thao tác</th></tr></thead>
        <tbody>
          @for (policy of table.data; track policy.id) {
            <tr>
              <td>{{ policy.title }}</td>
              <td>{{ policy.slug }}</td>
              <td><span class="badge" [class.published]="policy.published">{{ policy.published ? 'Đang công khai' : 'Bản nháp' }}</span></td>
              <td>{{ policy.updatedAt | date:'dd/MM/yyyy HH:mm' }}</td>
              <td><button nz-button nzType="link" type="button" (click)="edit(policy)" [disabled]="busy()">Sửa</button></td>
            </tr>
          }
        </tbody>
      </nz-table>
      <p class="count">{{ filtered().length }} chính sách</p>
    </section>
    <nz-modal [nzVisible]="editorOpen()" [nzTitle]="selected() ? 'Chỉnh sửa chính sách' : 'Tạo chính sách'"
      [nzFooter]="null" [nzMaskClosable]="false" [nzClosable]="!busy()" (nzOnCancel)="closeEditor()">
      <ng-container *nzModalContent>
      <form [formGroup]="form" (ngSubmit)="save(selected()?.published ?? false)">
        <label>Tiêu đề <input formControlName="title" maxlength="160"></label>
        <label>Đường dẫn <input formControlName="slug" maxlength="100" placeholder="vi-du-giao-hang"></label>
        <small>Dùng chữ thường không dấu, số và dấu gạch ngang.</small>
        <label>Nội dung <textarea rows="10" formControlName="content" maxlength="12000"></textarea></label>
        @if (selected()) {
          <div class="cover-editor">
            <img [src]="selected()?.imageUrl || '/banner.png'" alt="Ảnh bìa hiện tại" width="140" height="76">
            <label>Ảnh bìa
              <input type="file" accept="image/png,image/jpeg,image/webp" [disabled]="busy()" (change)="uploadCover($event)">
              <small>JPEG, PNG hoặc WebP, tối đa 5 MB. Ảnh được lưu khi tải lên.</small>
            </label>
          </div>
        } @else {
          <p>Lưu nháp trước để tải ảnh bìa riêng.</p>
        }
        <div class="actions">
          <button nz-button type="button" [disabled]="busy()" (click)="closeEditor()">Đóng</button>
          @if (selected(); as policy) {
            <button nz-button type="button" [disabled]="form.invalid || busy()" (click)="save(!policy.published)">{{ policy.published ? 'Ẩn chính sách' : 'Đăng chính sách' }}</button>
          }
          <button nz-button nzType="primary" type="submit" [disabled]="form.invalid || busy()">{{ selected()?.published ? 'Lưu cập nhật' : 'Lưu nháp' }}</button>
        </div>
        @if (message()) { <p role="status">{{ message() }}</p> }
      </form>
      </ng-container>
    </nz-modal>
  `,
  styles: `
    .policy-admin { background: white; padding: 1rem; border: 1px solid #eadfd6; border-radius: .75rem; }
    h1 { margin: 0 0 1rem; font-size: 1.4rem; }
    .toolbar { display: flex; flex-wrap: wrap; gap: .65rem; align-items: end; margin-bottom: 1rem; }
    .toolbar label { margin: 0; font-weight: 400; }
    .create { margin-inline-start: auto; }
    label { display: grid; gap: .3rem; margin: .65rem 0; font-weight: 600; }
    input, textarea, select { width: 100%; min-width: 0; padding: .5rem; border: 1px solid #d9d9d9; background: white; color: inherit; }
    .badge { display: inline-block; padding: .05rem .4rem; background: #f5f5f5; border: 1px solid #ddd; white-space: nowrap; font-size: .8rem; }
    .badge.published { background: #eaf3e7; color: #30522b; border-color: #c6dcbf; }
    .count { margin: .5rem 0 0; }
    .actions { display: flex; flex-wrap: wrap; justify-content: end; gap: .5rem; }
    .cover-editor { display: flex; flex-wrap: wrap; align-items: center; gap: .65rem; margin-bottom: 1rem; }
    .cover-editor img { object-fit: cover; border-radius: .4rem; }
    .cover-editor label { flex: 1 1 12rem; }
  `,
})
export class AdminPoliciesPage {
  private readonly http = inject(HttpClient);
  private readonly endpoint = '/api/v1/admin/policies';
  readonly policies = signal<Policy[]>([]);
  readonly editorOpen = signal(false);
  readonly page = signal(1);
  private readonly filters = signal({ query: '', status: '' });
  readonly filtered = computed(() => {
    const { query, status } = this.filters();
    return this.policies().filter(policy =>
      policy.title.toLocaleLowerCase('vi').includes(query)
      && (!status || policy.published === (status === 'published')));
  });
  readonly selected = signal<Policy | null>(null);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly form = inject(FormBuilder).nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(160)]],
    slug: ['', [Validators.required, Validators.maxLength(100), Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)]],
    content: ['', [Validators.required, Validators.maxLength(12000)]],
  });

  constructor() { this.refresh(); }

  filter(query: string, status: string): void {
    this.filters.set({ query: query.trim().toLocaleLowerCase('vi'), status });
    this.page.set(1);
  }

  closeEditor(): void {
    if (!this.busy()) this.editorOpen.set(false);
  }

  uploadCover(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const policy = this.selected();
    if (!file || !policy || this.busy()) return;
    if (file.size > 5 * 1024 * 1024) {
      this.message.set('Ảnh bìa tối đa 5 MB.');
      return;
    }
    const data = new FormData();
    data.set('file', file);
    this.busy.set(true);
    this.message.set('');
    this.http.put<void>(`${this.endpoint}/${policy.id}/image`, data, {
      params: { version: policy.version },
    }).subscribe({
      next: () => {
        this.message.set('Đã cập nhật ảnh bìa.');
        this.refresh(policy.slug);
      },
      error: (error: HttpErrorResponse) => {
        this.busy.set(false);
        this.message.set(error.error?.detail ?? 'Chưa tải được ảnh bìa.');
      },
    });
  }

  edit(policy: Policy | null): void {
    this.selected.set(policy);
    this.form.reset({ title: policy?.title ?? '', slug: policy?.slug ?? '', content: policy?.content ?? '' });
    this.message.set('');
    this.editorOpen.set(true);
  }

  save(published: boolean): void {
    if (this.busy() || this.form.invalid) return;
    const selected = this.selected();
    const policy = this.form.getRawValue();
    const request = selected
      ? this.http.put<void>(this.endpoint + '/' + selected.id, { policy, published, version: selected.version })
      : this.http.post<void>(this.endpoint, policy);
    this.busy.set(true);
    this.message.set('');
    request.subscribe({
      next: () => {
        this.message.set('Đã lưu chính sách.');
        this.editorOpen.set(false);
        this.refresh(policy.slug);
      },
      error: (error: HttpErrorResponse) => {
        this.busy.set(false);
        this.message.set(error.error?.detail ?? 'Chưa lưu được chính sách. Vui lòng thử lại.');
      },
    });
  }

  refresh(slug?: string): void {
    this.busy.set(true);
    this.http.get<Policy[]>(this.endpoint).subscribe({
      next: items => {
        this.policies.set(items);
        if (slug) this.selected.set(items.find(item => item.slug === slug) ?? null);
        this.busy.set(false);
      },
      error: () => {
        this.busy.set(false);
        this.message.set('Chưa tải được danh sách. Vui lòng tải lại trang.');
      },
    });
  }
}
