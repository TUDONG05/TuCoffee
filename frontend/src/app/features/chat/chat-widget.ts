import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, effect, inject, signal, viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subject, finalize, takeUntil } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ChatAnswer, ChatService, ChatTurn } from '../../core/chat/chat.service';

interface Exchange {
  question: string;
  response: ChatAnswer;
}

@Component({
  selector: 'app-chat-widget',
  imports: [DecimalPipe, RouterLink],
  templateUrl: './chat-widget.html',
  styleUrl: './chat-widget.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatWidget {
  private readonly api = inject(ChatService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cancel = new Subject<void>();
  private readonly launcher = viewChild<ElementRef<HTMLButtonElement>>('launcher');
  private readonly composer = viewChild<ElementRef<HTMLTextAreaElement>>('composer');
  private readonly transcript = viewChild<ElementRef<HTMLElement>>('transcript');
  readonly enabled = signal(false);
  readonly open = signal(false);
  readonly pending = signal(false);
  readonly exchanges = signal<Exchange[]>([]);
  readonly draft = signal('');
  readonly sentQuestion = signal('');
  readonly error = signal('');
  readonly suggestions = ['Quán có món nào ít ngọt?', 'Gợi ý một món dưới 50.000 ₫', 'TuCoffee nhận thanh toán bằng cách nào?'];
  private previousUser = this.auth.user()?.id;

  constructor() {
    this.api.config().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: config => this.enabled.set(config.enabled),
      error: () => this.enabled.set(false),
    });
    effect(() => {
      const currentUser = this.auth.user()?.id;
      if (this.previousUser !== currentUser) {
        this.previousUser = currentUser;
        this.reset();
      }
    });
    afterNextRender(() => {
      const viewport = window.visualViewport;
      if (!viewport) return;
      const resize = () => this.keyboardOffset.set(Math.max(
        0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop),
      ));
      viewport.addEventListener('resize', resize);
      viewport.addEventListener('scroll', resize);
      this.destroyRef.onDestroy(() => {
        viewport.removeEventListener('resize', resize);
        viewport.removeEventListener('scroll', resize);
      });
    });
  }

  readonly keyboardOffset = signal(0);

  toggle(): void {
    if (this.open()) {
      this.close();
      return;
    }
    this.open.set(true);
    this.scrollToLatest();
    setTimeout(() => this.composer()?.nativeElement.focus());
  }

  close(): void {
    this.open.set(false);
    this.launcher()?.nativeElement.focus();
  }

  reset(): void {
    this.cancel.next();
    this.exchanges.set([]);
    this.draft.set('');
    this.sentQuestion.set('');
    this.error.set('');
  }

  onComposerKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.send();
    }
  }

  send(question = this.draft()): void {
    const text = question.trim();
    if (this.pending() || !text || text.length > 2000) return;
    const context: ChatTurn[] = this.exchanges().slice(-3).flatMap(exchange => [
      { role: 'user' as const, content: exchange.question },
      { role: 'assistant' as const, content: exchange.response.answer },
    ]);
    this.pending.set(true);
    this.sentQuestion.set(text);
    this.draft.set('');
    this.error.set('');
    this.scrollToLatest();
    this.api.send(text, context).pipe(
      takeUntil(this.cancel),
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.pending.set(false)),
    ).subscribe({
      next: response => {
        this.exchanges.update(items => [...items, { question: text, response }]);
        this.sentQuestion.set('');
        this.scrollToLatest();
      },
      error: error => {
        if (!this.draft()) this.draft.set(text);
        const code = error instanceof HttpErrorResponse ? error.error?.code : undefined;
        if (code === 'CHAT_DISABLED') {
          this.open.set(false);
          this.enabled.set(false);
        }
        this.error.set(error instanceof HttpErrorResponse && error.status === 429
          ? 'Đã đến giới hạn tư vấn. Vui lòng thử lại sau.'
          : 'Chưa nhận được phản hồi. Bạn có thể thử gửi lại câu hỏi.');
        this.scrollToLatest();
      },
    });
  }

  safeImage(url: string | null): string | null {
    return url && /^\/(?![/\\])/.test(url) && !url.includes('\\') ? url : null;
  }

  private scrollToLatest(): void {
    setTimeout(() => {
      const transcript = this.transcript()?.nativeElement;
      if (transcript) transcript.scrollTop = transcript.scrollHeight;
    });
  }
}
