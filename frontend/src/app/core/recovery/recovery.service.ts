import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { AuthService } from '../auth/auth.service';

export interface RecoveryChallenge { challengeId: string; expiresIn: number; resendAfter: number; message: string; }
@Injectable({ providedIn: 'root' })
export class RecoveryService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  async request(email: string): Promise<RecoveryChallenge> {
    await this.auth.csrf();
    return firstValueFrom(this.http.post<RecoveryChallenge>('/api/v1/auth/forgot-password', { email }).pipe(timeout(12000)));
  }
  async reset(challengeId: string, code: string, newPassword: string): Promise<void> {
    await this.auth.csrf();
    await firstValueFrom(this.http.post<void>('/api/v1/auth/reset-password', { challengeId, code, newPassword }).pipe(timeout(12000)));
    this.auth.endSession();
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel('tucoffee-session'); channel.postMessage('password'); channel.close();
    }
  }
}
