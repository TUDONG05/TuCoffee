import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, timeout } from 'rxjs';
import { OrderResponse } from '../order/order.models';

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
  dashboard(from: string, to: string): Observable<Dashboard> {
    return this.http.get<Dashboard>('/api/v1/admin/dashboard', { params: { from, to } }).pipe(timeout(12000));
  }
}
