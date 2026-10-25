import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', title: 'Tu’s Coffee', loadComponent: () => import('./home/home').then((m) => m.Home) },
  { path: 'dev/status', title: 'Kiểm tra kết nối | Tu’s Coffee', loadComponent: () => import('./dev-status/dev-status').then((m) => m.DevStatus) },
  { path: '**', redirectTo: '' },
];
