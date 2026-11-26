import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { OrderItemRequest } from '../order/order.models';

export interface Promotion {
  id: number; title: string; description: string; kind: 'FIXED' | 'PERCENT';
  amount: number; minSubtotal: number; maxDiscount: number | null; endsAt: string;
  selfClaim?: boolean;
}
export interface Voucher extends Promotion {
  code: string; startsAt: string; totalLimit: number; perUserLimit: number;
  enabled: boolean; advertised: boolean; selfClaim: boolean; version: number;
}
export interface WalletVoucher extends Promotion {
  code: string; startsAt: string; enabled: boolean; remaining: number;
}
export interface VoucherQuote {
  voucherId: number; code: string; subtotalVnd: number; discountVnd: number; totalVnd: number;
}
export interface VoucherGroup { id: number; name: string }
export interface VoucherCustomer { id: number; name: string; email: string }
export interface VoucherStats {
  granted: number;
  usage: { orderId: number; publicCode: string; status: string; paymentStatus: string; discountVnd: number }[];
}

@Injectable({ providedIn: 'root' })
export class VoucherService {
  private readonly http = inject(HttpClient);
  private readonly admin = '/api/v1/admin';
  private readonly walletUrl = '/api/v1/users/me/vouchers';

  promotions(signedIn = false) {
    return this.http.get<Promotion[]>(signedIn ? '/api/v1/users/me/promotions' : '/api/v1/promotions');
  }
  wallet() { return this.http.get<WalletVoucher[]>(this.walletUrl); }
  claim(id: number) { return this.http.post<void>(this.walletUrl + '/' + id + '/claim', {}); }
  quote(voucherId: number, items: OrderItemRequest[]) {
    return this.http.post<VoucherQuote>(this.walletUrl + '/quote', { voucherId, items });
  }
  vouchers() { return this.http.get<Voucher[]>(this.admin + '/vouchers'); }
  save(id: number | null, data: Omit<Voucher, 'id'>) {
    const url = this.admin + '/vouchers';
    return id === null ? this.http.post<void>(url, data) : this.http.put<void>(url + '/' + id, data);
  }
  stats(id: number) { return this.http.get<VoucherStats>(this.admin + '/vouchers/' + id + '/stats'); }
  grant(id: number, target: string, targetId: number | null) {
    return this.http.post<{ granted: number }>(this.admin + '/vouchers/' + id + '/grants', { target, targetId });
  }
  groups() { return this.http.get<VoucherGroup[]>(this.admin + '/voucher-groups'); }
  members(id: number) { return this.http.get<number[]>(this.admin + '/voucher-groups/' + id + '/members'); }
  customers(q: string) {
    return this.http.get<VoucherCustomer[]>(this.admin + '/voucher-customers', { params: { q } });
  }
  saveGroup(id: number | null, name: string, userIds: number[]) {
    const url = this.admin + '/voucher-groups';
    return id === null ? this.http.post<void>(url, { name, userIds }) : this.http.put<void>(url + '/' + id, { name, userIds });
  }
}
