import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  AdminConfirmPaymentRequest,
  AdminUpdateOrderStatusRequest,
  CancelOrderRequest,
  CreateOrderRequest,
  OrderDetailAdminResponse,
  OrderPageResponse,
  OrderResponse,
  PaymentInstructionsResponse,
  VnPayPaymentUrlResponse,
  VnPayReturnResponse,
} from './order.models';

@Injectable({
  providedIn: 'root',
})
export class OrderService {
  private readonly http = inject(HttpClient);

  createOrder(request: CreateOrderRequest, idempotencyKey: string): Observable<OrderResponse> {
    const headers = new HttpHeaders({
      'Idempotency-Key': idempotencyKey,
    });
    return this.http.post<OrderResponse>('/api/v1/orders', request, { headers });
  }

  getMyOrders(page = 0, size = 12): Observable<OrderPageResponse> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<OrderPageResponse>('/api/v1/orders/mine', { params });
  }

  getOrder(id: number): Observable<OrderResponse> {
    return this.http.get<OrderResponse>(`/api/v1/orders/${id}`);
  }

  getPaymentInstructions(id: number): Observable<PaymentInstructionsResponse> {
    return this.http.get<PaymentInstructionsResponse>(`/api/v1/orders/${id}/payment-instructions`);
  }

  getVnPayUrl(id: number): Observable<VnPayPaymentUrlResponse> {
    return this.http.get<VnPayPaymentUrlResponse>(`/api/v1/orders/${id}/vnpay-url`);
  }

  processVnPayReturn(params: Record<string, string>): Observable<VnPayReturnResponse> {
    let httpParams = new HttpParams();
    for (const key of Object.keys(params)) {
      if (params[key] !== undefined && params[key] !== null) {
        httpParams = httpParams.set(key, params[key]);
      }
    }
    return this.http.get<VnPayReturnResponse>('/api/v1/orders/vnpay-return', { params: httpParams });
  }

  cancelOrder(id: number, request: CancelOrderRequest): Observable<OrderResponse> {
    return this.http.patch<OrderResponse>(`/api/v1/orders/${id}/cancel`, request);
  }

  getAdminOrders(filter: {
    status?: string;
    source?: string;
    paymentStatus?: string;
    q?: string;
    page?: number;
    size?: number;
  }): Observable<OrderPageResponse> {
    let params = new HttpParams();
    if (filter.status) params = params.set('status', filter.status);
    if (filter.source) params = params.set('source', filter.source);
    if (filter.paymentStatus) params = params.set('paymentStatus', filter.paymentStatus);
    if (filter.q) params = params.set('q', filter.q);
    if (filter.page !== undefined) params = params.set('page', filter.page);
    if (filter.size !== undefined) params = params.set('size', filter.size);

    return this.http.get<OrderPageResponse>('/api/v1/admin/orders', { params });
  }

  getAdminOrder(id: number): Observable<OrderDetailAdminResponse> {
    return this.http.get<OrderDetailAdminResponse>(`/api/v1/admin/orders/${id}`);
  }

  adminUpdateStatus(id: number, request: AdminUpdateOrderStatusRequest): Observable<OrderResponse> {
    return this.http.patch<OrderResponse>(`/api/v1/admin/orders/${id}/status`, request);
  }

  adminConfirmPayment(id: number, request: AdminConfirmPaymentRequest): Observable<OrderResponse> {
    return this.http.post<OrderResponse>(
      `/api/v1/admin/orders/${id}/payment-confirmations`,
      request
    );
  }
}
