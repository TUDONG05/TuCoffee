import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { timeout } from 'rxjs';

export interface KnowledgeVersion {
  id: number;
  revision: number;
  status: 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED';
  originalFilename: string;
  errorCode: string | null;
}

export interface KnowledgeDocument {
  id: number;
  title: string;
  enabled: boolean;
  version: number;
  activeVersionId: number | null;
  chunkCount: number;
  createdAt: string;
  latestVersion: KnowledgeVersion;
  updatedAt: string;
}

export interface KnowledgeDetail extends KnowledgeDocument {
  versions: KnowledgeVersion[];
}

export interface KnowledgePreview {
  excerpts: string[];
  truncated: boolean;
}

export interface KnowledgePageResult {
  items: KnowledgeDocument[];
  total: number;
  page: number;
  size: number;
}

interface QueuedIngestion {
  documentId: number;
  versionId: number;
  jobId: number;
}

const documentsUrl = '/api/v1/admin/knowledge/documents';

@Injectable({ providedIn: 'root' })
export class KnowledgeService {
  private readonly http = inject(HttpClient);

  list(q: string, page: number, size: number, enabled: string, format: string) {
    const params = { q, page, size, ...(enabled ? { enabled } : {}), ...(format ? { format } : {}) };
    return this.http.get<KnowledgePageResult>(documentsUrl, { params }).pipe(timeout(12_000));
  }

  detail(id: number) {
    return this.http.get<KnowledgeDetail>(`${documentsUrl}/${id}`).pipe(timeout(12_000));
  }

  preview(id: number) {
    return this.http.get<KnowledgePreview>(`${documentsUrl}/${id}/preview`).pipe(timeout(12_000));
  }

  upload(file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<QueuedIngestion>(documentsUrl, form).pipe(timeout(60_000));
  }

  replace(doc: KnowledgeDocument, file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<QueuedIngestion>(`${documentsUrl}/${doc.id}/versions`, form,
      { params: { version: doc.version } }).pipe(timeout(60_000));
  }

  reindex(doc: KnowledgeDocument) {
    return this.http.post(`${documentsUrl}/${doc.id}/reindex`, null,
      { params: { version: doc.version } }).pipe(timeout(12_000));
  }

  retry(doc: KnowledgeDocument, versionId: number) {
    return this.http.post(`${documentsUrl}/${doc.id}/versions/${versionId}/retry`, null,
      { params: { version: doc.version } }).pipe(timeout(12_000));
  }

  setEnabled(doc: KnowledgeDocument, enabled: boolean) {
    return this.http.patch<void>(`${documentsUrl}/${doc.id}/enabled`,
      { version: doc.version, enabled }).pipe(timeout(12_000));
  }

  remove(doc: KnowledgeDocument) {
    return this.http.delete<void>(`${documentsUrl}/${doc.id}`,
      { params: { version: doc.version } }).pipe(timeout(12_000));
  }
}
