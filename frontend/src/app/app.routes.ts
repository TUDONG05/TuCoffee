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
    path: 'admin/users',
    title: 'Quản lý tài khoản | Tu’s Coffee',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/users-page').then((m) => m.UsersPage),
  },
  { path: '**', redirectTo: '' },
];
