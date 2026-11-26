export interface OrderItemRequest {
  productId: number;
  quantity: number;
  expectedPriceVnd: number;
}

export interface CreateOrderRequest {
  items: OrderItemRequest[];
  customerName: string;
  customerPhone?: string | null;
  customerAddress?: string | null;
  note?: string | null;
  paymentMethod: 'CASH' | 'QR_TRANSFER' | 'VNPAY';
}

export interface VnPayPaymentUrlResponse {
  paymentUrl: string;
}

export interface VnPayReturnResponse {
  success: boolean;
  code: string;
  message: string;
  orderId?: number | null;
  publicCode: string;
}

export interface OrderItemResponse {
  id: number;
  productId: number;
  productName: string;
  unitPriceVnd: number;
  quantity: number;
  subtotalVnd: number;
}

export interface PaymentResponse {
  id: number;
  method: 'CASH' | 'QR_TRANSFER' | 'VNPAY';
  status: 'UNPAID' | 'PAID';
  amountVnd: number;
  bankCode?: string | null;
  bankAccount?: string | null;
  bankAccountName?: string | null;
  transferContent?: string | null;
  reference?: string | null;
  confirmedAt?: string | null;
}

export interface OrderResponse {
  id: number;
  publicCode: string;
  source: 'ONLINE' | 'POS';
  status: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
  totalVnd: number;
  customerName: string;
  customerPhone?: string | null;
  customerAddress?: string | null;
  note?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  cancelledAt?: string | null;
  items: OrderItemResponse[];
  payment?: PaymentResponse | null;
}

export interface PaymentInstructionsResponse {
  method: 'CASH' | 'QR_TRANSFER' | 'VNPAY';
  status: 'UNPAID' | 'PAID';
  amountVnd: number;
  bankCode?: string | null;
  bankAccount?: string | null;
  bankAccountName?: string | null;
  transferContent?: string | null;
  qrUrl?: string | null;
}

export interface OrderEventResponse {
  id: number;
  actorId: number;
  eventType: 'CREATED' | 'STATUS_CHANGED' | 'PAYMENT_CONFIRMED';
  fromStatus?: string | null;
  toStatus: string;
  orderVersion: number;
  paymentReference?: string | null;
  note?: string | null;
  createdAt: string;
}

export interface OrderDetailAdminResponse {
  order: OrderResponse;
  events: OrderEventResponse[];
}

export interface OrderPageResponse {
  items: OrderResponse[];
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
}

export interface CancelOrderRequest {
  version?: number | null;
  note?: string | null;
}

export interface AdminUpdateOrderStatusRequest {
  targetStatus: 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
  version: number;
  note?: string | null;
}

export interface AdminConfirmPaymentRequest {
  amountVnd: number;
  reference?: string | null;
  version: number;
  confirmationKey: string;
}
