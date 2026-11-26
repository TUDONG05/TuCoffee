import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { switchMap, timeout } from 'rxjs';
import { AuthService } from '../auth/auth.service';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatCitation {
  documentId: number;
  title: string;
  page: number | null;
  section: string | null;
}

export interface ChatProduct {
  id: number;
  name: string;
  priceVnd: number;
  imageUrl: string | null;
}

export interface ChatAnswer {
  answer: string;
  citations: ChatCitation[];
  products: ChatProduct[];
  insufficientData: boolean;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  config() {
    return this.http.get<{ enabled: boolean }>('/api/v1/chat/config').pipe(timeout(8000));
  }

  send(question: string, context: ChatTurn[]) {
    return this.http.get('/api/v1/auth/csrf').pipe(
      timeout(8000),
      switchMap(() => {
        const token = this.auth.token();
        return this.http.post<ChatAnswer>('/api/v1/chat/messages', { question, context }, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }).pipe(timeout(35_000));
      }),
    );
  }
}
