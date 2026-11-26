import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzPaginationModule } from 'ng-zorro-antd/pagination';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { Observable, Subject, catchError, concatMap, filter, finalize, from, interval, map, merge, of, switchMap, toArray } from 'rxjs';
import {
  KnowledgeDocument, KnowledgePageResult, KnowledgePreview, KnowledgeService, KnowledgeVersion,
} from '../../../core/knowledge/knowledge.service';

@Component({
  selector: 'app-admin-knowledge',
  imports: [DatePipe, FormsModule, NzButtonModule, NzInputModule, NzTableModule, NzTagModule, NzModalModule, NzPaginationModule],
  templateUrl: './knowledge-page.html',
  styleUrl: './knowledge-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KnowledgePage {
  private readonly api = inject(KnowledgeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly listRequests = new Subject<void>();
  private readonly previewRequests = new Subject<KnowledgeDocument | null>();
  private readonly q = signal('');
  private readonly appliedEnabled = signal('');
  private readonly appliedFormat = signal('');
  readonly result = signal<KnowledgePageResult | null>(null);
  readonly preview = signal<KnowledgePreview | null>(null);
  readonly previewTarget = signal<KnowledgeDocument | null>(null);
  readonly loading = signal(false);
  readonly previewLoading = signal(false);
  readonly saving = signal(false);
  readonly uploadOpen = signal(false);
  readonly uploadFiles = signal<File[]>([]);
  readonly dragOverUpload = signal(false);
  readonly listError = signal('');
  readonly previewError = signal('');
  readonly actionError = signal('');
  readonly notice = signal('');
  readonly page = signal(0);
  readonly pageSize = signal(20);
  readonly pageSizes = [5, 10, 20, 50];
  readonly pageCount = computed(() => Math.max(1, Math.ceil((this.result()?.total ?? 0) / this.pageSize())));
  readonly deleteTarget = signal<KnowledgeDocument | null>(null);
  readonly publishTarget = signal<KnowledgeDocument | null>(null);
  query = '';
  enabled = '';
  format = '';

  constructor() {
    const activeJobs = interval(4000).pipe(filter(() => !this.saving() && this.hasPendingWork()));
    merge(this.listRequests, activeJobs.pipe(filter(() => !this.loading()))).pipe(
      switchMap(() => {
        this.loading.set(true);
        this.listError.set('');
        return this.api.list(this.q(), this.page(), this.pageSize(), this.appliedEnabled(), this.appliedFormat()).pipe(
          catchError(() => { this.listError.set('Không tải được danh sách tài liệu.'); return of(null); }),
          finalize(() => this.loading.set(false)),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(result => {
      if (!result) return;
      this.result.set(result);
      if (this.page() >= this.pageCount()) this.goTo(this.pageCount() - 1);
    });
    this.previewRequests.pipe(
      switchMap(doc => {
        if (!doc) return of(null);
        this.previewLoading.set(true);
        return this.api.preview(doc.id).pipe(
          catchError(() => { this.previewError.set('Không tải được nội dung xem trước.'); return of(null); }),
          finalize(() => this.previewLoading.set(false)),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(preview => this.preview.set(preview));
    this.reload();
  }

  search(): void {
    this.q.set(this.query.trim());
    this.appliedEnabled.set(this.enabled);
    this.appliedFormat.set(this.format);
    this.goTo(0);
  }

  goTo(page: number): void {
    this.page.set(page);
    this.reload();
  }

  changePageSize(size: number): void {
    if (size === this.pageSize()) return;
    this.pageSize.set(size);
    this.goTo(Math.min(this.page(), this.pageCount() - 1));
  }

  reload(): void {
    this.listRequests.next();
  }

  openPreview(doc: KnowledgeDocument | null): void {
    this.previewTarget.set(doc);
    this.preview.set(null);
    this.previewError.set('');
    this.previewRequests.next(doc);
  }

  isPending(version: KnowledgeVersion | null): boolean {
    return version?.status === 'UPLOADED' || version?.status === 'PROCESSING';
  }

  statusLabel(status: KnowledgeVersion['status']): string {
    return { UPLOADED: 'Chờ xử lý', PROCESSING: 'Đang xử lý', READY: 'Sẵn sàng', FAILED: 'Lỗi' }[status];
  }

  formatLabel(filename: string): string {
    switch (filename.split('.').at(-1)?.toLowerCase()) {
      case 'txt': return 'TXT';
      case 'md':
      case 'markdown': return 'Markdown';
      case 'pdf': return 'PDF';
      case 'docx': return 'Word';
      default: return '—';
    }
  }

  chooseUploadFiles(input: HTMLInputElement): void {
    this.addUploadFiles(input.files);
    input.value = '';
  }

  dragUpload(event: DragEvent, over: boolean): void {
    event.preventDefault();
    this.dragOverUpload.set(over);
  }

  dropUpload(event: DragEvent): void {
    this.dragUpload(event, false);
    this.addUploadFiles(event.dataTransfer?.files);
  }

  private addUploadFiles(files: FileList | null | undefined): void {
    if (files?.length) this.uploadFiles.update(current => [...current, ...Array.from(files)]);
  }

  removeUploadFile(index: number): void {
    this.uploadFiles.update(files => files.filter((_, position) => position !== index));
  }

  closeUpload(): void {
    this.uploadOpen.set(false);
    this.uploadFiles.set([]);
    this.dragOverUpload.set(false);
  }

  upload(): void {
    const files = this.uploadFiles();
    if (!files.length || this.saving()) return;
    this.saving.set(true);
    this.closeUpload();
    this.notice.set('');
    this.actionError.set('');
    from(files).pipe(
      concatMap(file => {
        const error = this.fileError(file);
        if (error) return of({ id: null, message: `${file.name}: ${error}` });
        return this.api.upload(file).pipe(
          map(result => ({ id: result.documentId, message: '' })),
          catchError(() => of({ id: null, message: `${file.name}: Không xác nhận được tải lên. Hãy kiểm tra danh sách trước khi thử lại.` })),
        );
      }),
      toArray(),
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.saving.set(false)),
    ).subscribe(results => {
      const successful = results.filter(result => result.id !== null);
      if (successful.length) {
        this.notice.set(files.length === 1
          ? 'Đã tải lên và xếp hàng xử lý tài liệu.'
          : `Đã tải lên và xếp hàng xử lý ${successful.length}/${files.length} tệp.`);
      }
      this.actionError.set(results.map(result => result.message).filter(Boolean).join(' '));
      this.reload();
    });
  }

  retry(doc: KnowledgeDocument): void {
    this.run(this.api.retry(doc, doc.latestVersion.id), 'Đã xếp hàng xử lý lại tài liệu.');
  }

  toggleSource(doc: KnowledgeDocument): void {
    if (this.saving()) return;
    if (doc.enabled) {
      this.run(this.api.setEnabled(doc, false), 'Đã tắt nguồn cho chatbot.');
    } else if (doc.activeVersionId !== null) {
      this.publishTarget.set(doc);
    }
  }

  confirmPublish(): void {
    const doc = this.publishTarget();
    if (!doc || this.saving()) return;
    this.publishTarget.set(null);
    this.run(this.api.setEnabled(doc, true), 'Đã bật nguồn cho chatbot.');
  }

  confirmDelete(): void {
    const doc = this.deleteTarget();
    if (!doc || this.saving()) return;
    this.deleteTarget.set(null);
    this.run(this.api.remove(doc), 'Đã xóa tài liệu.');
  }

  private hasPendingWork(): boolean {
    return !!this.result()?.items.some(doc => this.isPending(doc.latestVersion));
  }

  private fileError(file: File): string {
    if (!/\.(txt|md|markdown|pdf|docx)$/i.test(file.name)) return 'Chọn tệp TXT, Markdown, PDF hoặc Word (.docx).';
    if (!file.size || file.size > 10 * 1024 * 1024) return 'Tệp phải có nội dung và không vượt quá 10 MiB.';
    return '';
  }

  private run(request: Observable<unknown>, message: string): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.notice.set('');
    this.actionError.set('');
    request.pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.saving.set(false)),
    ).subscribe({
      next: () => { this.notice.set(message); this.reload(); },
      error: error => {
        const messages: Record<number, string> = {
          400: 'Dữ liệu hoặc nội dung tài liệu không hợp lệ.',
          403: 'Bạn không có quyền thực hiện thao tác này.',
          404: 'Tài liệu không còn tồn tại.',
          409: 'Tài liệu đã thay đổi hoặc thao tác chưa thể thực hiện. Danh sách đã được yêu cầu tải lại.',
          413: 'Tệp vượt quá dung lượng cho phép.',
          415: 'Định dạng tệp không được hỗ trợ.',
          503: 'Dịch vụ xử lý tài liệu chưa sẵn sàng.',
        };
        this.actionError.set(messages[error.status] ?? 'Không thể xác nhận kết quả. Hãy kiểm tra trạng thái trước khi thử lại.');
        this.reload();
      },
    });
  }
}
