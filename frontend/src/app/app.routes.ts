import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/auth/auth.guards';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Tu\'s Coffee',
    loadComponent: () => import('./home/home').then((m) => m.Home),
  },
  {
    path: 'dev/status',
    title: 'Kiểm tra kết nối | Tu\'s Coffee',
    loadComponent: () => import('./dev-status/dev-status').then((m) => m.DevStatus),
  },
  {
    path: 'login',
    title: 'Đăng nhập | Tu\'s Coffee',
    loadComponent: () => import('./features/auth/auth-page').then((m) => m.AuthPage),
  },
  {
    path: 'register',
    title: 'Tạo tài khoản | Tu\'s Coffee',
    data: { mode: 'register' },
    loadComponent: () => import('./features/auth/auth-page').then((m) => m.AuthPage),
  },
  {
    path: 'forgot-password',
    title: 'Khôi phục mật khẩu | Tu’s Coffee',
    loadComponent: () => import('./features/auth/recovery/recovery-page').then(m => m.RecoveryPage),
  },
  {
    path: 'profile',
    title: 'Thông tin cá nhân | Tu\'s Coffee',
    canActivate: [authGuard],
    loadComponent: () => import('./features/profile/profile-page').then((m) => m.ProfilePage),
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    canActivateChild: [adminGuard],
    loadComponent: () => import('./features/admin/admin-layout').then((m) => m.AdminLayout),
    children: [
      { path: 'dashboard', title: 'Thống kê doanh thu | Tu\'s Coffee', loadComponent: () => import('./features/admin/dashboard/dashboard-page').then(m => m.DashboardPage) },
      { path: 'pos', title: 'Bán tại quầy | Tu\'s Coffee', loadComponent: () => import('./features/admin/pos/pos-page').then(m => m.PosPage) },
      { path: 'pos/orders/:id/receipt', title: 'Hóa đơn | Tu\'s Coffee', loadComponent: () => import('./features/admin/pos/receipt-page').then(m => m.ReceiptPage) },
      { path: 'reviews', title: 'Quản lý đánh giá | Tu\'s Coffee', loadComponent: () => import('./features/admin/reviews/admin-reviews-page').then(m => m.AdminReviewsPage) },
      { path: 'knowledge', title: 'Tài liệu tri thức | Tu\'s Coffee', loadComponent: () => import('./features/admin/knowledge/knowledge-page').then(m => m.KnowledgePage) },
      { path: 'policies', title: 'Quản lý chính sách', loadComponent: () => import('./features/policies/store-policies').then(m => m.AdminPoliciesPage) },
      { path: '', pathMatch: 'full', title: 'Tổng quan quản trị | Tu\'s Coffee', loadComponent: () => import('./features/admin/admin-overview').then((m) => m.AdminOverview) },
      { path: 'orders', title: 'Quản lý đơn hàng | Tu\'s Coffee', loadComponent: () => import('./features/admin/orders/admin-orders-page').then((m) => m.AdminOrdersPage) },
      { path: 'orders/:id', title: 'Chi tiết đơn hàng | Tu\'s Coffee', loadComponent: () => import('./features/admin/orders/admin-order-detail-page').then((m) => m.AdminOrderDetailPage) },
      { path: 'users', title: 'Quản lý tài khoản | Tu\'s Coffee', loadComponent: () => import('./features/admin/users-page').then((m) => m.UsersPage) },
      { path: 'products', title: 'Quản lý sản phẩm | Tu\'s Coffee', loadComponent: () => import('./features/admin/catalog/products-page').then((m) => m.AdminProductsPage) },
      { path: 'categories', title: 'Quản lý danh mục | Tu\'s Coffee', loadComponent: () => import('./features/admin/catalog/categories-page').then((m) => m.AdminCategoriesPage) },
    ],
  },
  { path: 'menu', title: 'Thực đơn | Tu\'s Coffee', loadComponent: () => import('./features/menu/menu-page').then(m => m.MenuPage) },
  { path: 'chinh-sach', title: 'Chính sách TuCoffee', loadComponent: () => import('./features/policies/store-policies').then(m => m.StorePoliciesPage) },
  { path: 'chinh-sach/:slug', title: 'Chính sách TuCoffee', loadComponent: () => import('./features/policies/store-policies').then(m => m.StorePoliciesPage) },
  { path: 'products/:id', title: 'Chi tiết sản phẩm | Tu\'s Coffee', loadComponent: () => import('./features/menu/product-detail-page').then(m => m.ProductDetailPage) },
  { path: 'cart', title: 'Giỏ hàng | Tu\'s Coffee', loadComponent: () => import('./features/cart/cart-page').then(m => m.CartPage) },
  { path: 'checkout', title: 'Đặt hàng & Thanh toán | Tu\'s Coffee', canActivate: [authGuard], loadComponent: () => import('./features/checkout/checkout-page').then(m => m.CheckoutPage) },
  { path: 'orders', title: 'Đơn hàng của tôi | Tu\'s Coffee', canActivate: [authGuard], loadComponent: () => import('./features/orders/my-orders-page').then(m => m.MyOrdersPage) },
  { path: 'orders/vnpay-return', title: 'Kết quả thanh toán VNPAY | Tu\'s Coffee', canActivate: [authGuard], loadComponent: () => import('./features/orders/vnpay-return-page').then(m => m.VnPayReturnPage) },
  { path: 'orders/:id', title: 'Chi tiết đơn hàng | Tu\'s Coffee', canActivate: [authGuard], loadComponent: () => import('./features/orders/order-detail-page').then(m => m.OrderDetailPage) },
  { path: '**', redirectTo: '' },
];
