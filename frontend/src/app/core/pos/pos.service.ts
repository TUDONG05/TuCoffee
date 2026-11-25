import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, timeout } from 'rxjs';
import { CreateOrderRequest, OrderResponse } from '../order/order.models';

export interface TimelinePoint {
  periodKey: string;
  label: string;
  date: string;
  revenueVnd: number;
  orderCount: number;
}

export interface Dashboard {
  from: string;
  to: string;
  timeZone: string;
  revenueVnd: number;
  completedPaidOrders: number;
  totalOrders: number;
  statusCounts: Record<string, number>;
  recentOrders: OrderResponse[];
  timeline?: TimelinePoint[];
}

@Injectable({ providedIn: 'root' })
export class PosService {
  private readonly http = inject(HttpClient);
  create(body: CreateOrderRequest, key: string, autoComplete: boolean = false) {
    let params = new HttpParams();
    if (autoComplete) {
      params = params.set('autoComplete', 'true');
    }
    return this.http.post<OrderResponse>('/api/v1/admin/pos/orders', body,
      { headers: { 'Idempotency-Key': key }, params }).pipe(timeout(15000));
  }
  receipt(id: number) {
    return this.http.get<OrderResponse>(`/api/v1/admin/pos/orders/${id}/receipt`).pipe(timeout(12000));
  }
  dashboard(from: string, to: string): Observable<Dashboard> {
    return this.http.get<Dashboard>('/api/v1/admin/dashboard', { params: { from, to } }).pipe(timeout(12000));
  }
}
