import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, effect, inject, output, signal, viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { EMPTY, Subject, catchError, exhaustMap, finalize, takeUntil, takeWhile, timer } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { CartService } from '../../core/cart/cart.service';
import { CatalogService } from '../../core/catalog/catalog.service';
import { ChatAnswer, ChatService, ChatTurn } from '../../core/chat/chat.service';
import { CheckoutPage } from '../checkout/checkout-page';
import { OrderResponse, PaymentInstructionsResponse } from '../../core/order/order.models';
import { OrderService } from '../../core/order/order.service';

interface Exchange {
  question: string;
  response: ChatAnswer;
}

@Component({
  selector: 'app-chat-widget',
  imports: [DecimalPipe, RouterLink, CheckoutPage],
  templateUrl: './chat-widget.html',
  styleUrl: './chat-widget.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatWidget {
  private readonly api = inject(ChatService);
  readonly auth = inject(AuthService);
  readonly cart = inject(CartService);
  private readonly catalog = inject(CatalogService);
  readonly loginRequested = output<void>();
  readonly checkout = signal(false);
  readonly placedOrder = signal<OrderResponse | null>(null);
  readonly payment = signal<PaymentInstructionsResponse | null>(null);
  readonly paymentLoading = signal(false);
  readonly paymentError = signal(false);
  private readonly orders = inject(OrderService);
  readonly checkoutPage = viewChild(CheckoutPage);
  readonly cartNotice = signal<{ text: string; kind: 'success' | 'warning' } | null>(null);
  readonly adding = signal(false);
  private readonly applied = signal(new Map<Exchange, Set<number>>());
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

  finishCheckout(order: OrderResponse): void {
    this.placedOrder.set(order);
    if (order.payment?.method !== 'QR_TRANSFER' || this.paymentFinished(order)) return;
    this.loadPayment(order.id);
    timer(3000, 3000).pipe(
      exhaustMap(() => this.orders.getOrder(order.id).pipe(catchError(() => EMPTY))),
      takeWhile(updated => !this.paymentFinished(updated), true),
      takeUntil(this.cancel),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(updated => this.placedOrder.set(updated));
  }

  private paymentFinished(order: OrderResponse): boolean {
    return order.status === 'CANCELLED' || order.payment?.status === 'PAID';
  }

  loadPayment(id: number): void {
    if (this.paymentLoading()) return;
    this.paymentError.set(false);
    this.paymentLoading.set(true);
    this.orders.getPaymentInstructions(id).pipe(
      takeUntil(this.cancel),
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.paymentLoading.set(false)),
    ).subscribe({
      next: payment => {
        if (this.placedOrder()?.id === id) this.payment.set(payment);
      },
      error: () => this.paymentError.set(true),
    });
  }

  backToChat(): void {
    if (this.checkoutPage()?.submitting()) return;
    if (this.placedOrder()) this.cancel.next();
    this.checkout.set(false);
    this.placedOrder.set(null);
    this.payment.set(null);
    setTimeout(() => this.composer()?.nativeElement.focus());
  }

  wasAdded(exchange: Exchange, productId: number): boolean {
    return this.applied().get(exchange)?.has(productId) ?? false;
  }

  addProduct(exchange: Exchange, productId: number, quantity = 1): void {
    if (this.adding() || this.wasAdded(exchange, productId)) return;
    this.adding.set(true);
    this.cartNotice.set(null);
    this.catalog.product(productId).pipe(
      takeUntil(this.cancel),
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.adding.set(false)),
    ).subscribe({
      next: product => {
        const existing = this.cart.items().find(item => item.productId === productId);
        if ((existing?.quantity ?? 0) + quantity > 99 || (!existing && this.cart.items().length >= 50)) {
          this.cartNotice.set({ kind: 'warning', text: 'Giỏ hàng đã đạt giới hạn cho món này.' });
          return;
        }
        if (existing && existing.unitPriceVnd !== product.priceVnd) {
          this.cartNotice.set({ kind: 'warning', text: 'Giá món đã đổi. Hãy kiểm tra món trong giỏ rồi thử lại.' });
          return;
        }
        this.cart.addItem(product, quantity);
        this.applied.update(items => new Map(items).set(exchange, new Set(items.get(exchange)).add(productId)));
        this.cartNotice.set({ kind: 'success', text: `Đã thêm ${quantity} × ${product.name} vào giỏ.` });
      },
      error: () => this.cartNotice.set({ kind: 'warning', text: 'Không thể thêm món. Bạn hãy kiểm tra lại thực đơn.' }),
    });
  }

  reset(): void {
    this.cancel.next();
    this.placedOrder.set(null);
    this.payment.set(null);
    this.exchanges.set([]);
    this.draft.set('');
    this.sentQuestion.set('');
    this.error.set('');
    this.applied.set(new Map());
    this.cartNotice.set(null);
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
    if (/^(?:đặt (?:đơn|hàng)|thanh toán|chốt đơn)(?: giúp (?:tôi|mình))?[.!]?$/iu.test(text)) {
      this.draft.set('');
      this.checkout.set(true);
      return;
    }
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
