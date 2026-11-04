import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/auth/auth.guards';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Tu’s Coffee',
    loadComponent: () => import('./home/home').then((m) => m.Home),
  },
  {
    path: 'dev/status',
    title: 'Kiểm tra kết nối | Tu’s Coffee',
    loadComponent: () => import('./dev-status/dev-status').then((m) => m.DevStatus),
  },
  {
    path: 'login',
    title: 'Đăng nhập | Tu’s Coffee',
    loadComponent: () => import('./features/auth/auth-page').then((m) => m.AuthPage),
  },
  {
    path: 'register',
    title: 'Tạo tài khoản | Tu’s Coffee',
    data: { mode: 'register' },
    loadComponent: () => import('./features/auth/auth-page').then((m) => m.AuthPage),
  },
  {
    path: 'profile',
    title: 'Thông tin cá nhân | Tu’s Coffee',
    canActivate: [authGuard],
    loadComponent: () => import('./features/profile/profile-page').then((m) => m.ProfilePage),
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    canActivateChild: [adminGuard],
    loadComponent: () => import('./features/admin/admin-layout').then((m) => m.AdminLayout),
    children: [
      { path: '', pathMatch: 'full', title: 'Tổng quan quản trị | Tu’s Coffee', loadComponent: () => import('./features/admin/admin-overview').then((m) => m.AdminOverview) },
      { path: 'users', title: 'Quản lý tài khoản | Tu’s Coffee', loadComponent: () => import('./features/admin/users-page').then((m) => m.UsersPage) },
      { path: 'products', title: 'Quản lý sản phẩm | Tu’s Coffee', loadComponent: () => import('./features/admin/catalog/products-page').then((m) => m.AdminProductsPage) },
      { path: 'categories', title: 'Quản lý danh mục | Tu’s Coffee', loadComponent: () => import('./features/admin/catalog/categories-page').then((m) => m.AdminCategoriesPage) },
    ],
  },
  { path: 'menu', title: 'Thực đơn | Tu’s Coffee', loadComponent: () => import('./features/menu/menu-page').then(m => m.MenuPage) },
  { path: 'products/:id', title: 'Chi tiết sản phẩm | Tu’s Coffee', loadComponent: () => import('./features/menu/product-detail-page').then(m => m.ProductDetailPage) },
  { path: '**', redirectTo: '' },
];
