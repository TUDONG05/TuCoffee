import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, timeout } from 'rxjs';

type HealthState = 'loading' | 'up' | 'down' | 'network-error';

@Component({
  selector: 'app-dev-status',
  templateUrl: './dev-status.html',
  styleUrl: './dev-status.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DevStatus implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private request?: Subscription;
  protected readonly state = signal<HealthState>('loading');

  ngOnInit(): void { this.check(); }

  protected check(): void {
    this.request?.unsubscribe();
    this.state.set('loading');
    this.request = this.http.get<{ status?: unknown }>('/api/v1/health')
      .pipe(timeout(8000), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (health) => this.state.set(health?.status === 'UP' ? 'up' : 'down'),
        error: (error: unknown) => this.state.set(
          error instanceof HttpErrorResponse && error.status === 503 ? 'down' : 'network-error',
        ),
      });
  }
}
