import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { authGuard, guestGuard, roleGuard } from './core/guards';
import { AuthService } from './core/auth.service';

const manager = roleGuard(['manager']);
const employee = roleGuard(['employee']);

/**
 * O sistema abre direto no fluxo EMPRESA → USUÁRIO → SISTEMA (sem site institucional).
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'entrar' },
  { path: 'entrar', canActivate: [guestGuard], loadComponent: () => import('./features/auth/auth.component').then(m => m.AuthComponent) },
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () => import('./features/shell/shell.component').then(m => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: () => inject(AuthService).home.replace('/app/', '') },
      // colaborador
      { path: 'inicio', canActivate: [employee], loadComponent: () => import('./features/employee/home.component').then(m => m.HomeComponent) },
      { path: 'checkin', canActivate: [employee], loadComponent: () => import('./features/employee/checkin.component').then(m => m.CheckinComponent) },
      { path: 'historico', canActivate: [employee], loadComponent: () => import('./features/employee/history.component').then(m => m.HistoryComponent) },
      // gestor
      { path: 'visao-geral', canActivate: [manager], loadComponent: () => import('./features/manager/overview.component').then(m => m.OverviewComponent) },
      { path: 'colaboradores', canActivate: [manager], loadComponent: () => import('./features/manager/employees.component').then(m => m.EmployeesComponent) },
      { path: 'estrutura', canActivate: [manager], loadComponent: () => import('./features/manager/structure.component').then(m => m.StructureComponent) },
      { path: 'insights', canActivate: [manager], loadComponent: () => import('./features/manager/insights.component').then(m => m.InsightsComponent) },
      { path: 'intervencoes', canActivate: [manager], loadComponent: () => import('./features/manager/interventions.component').then(m => m.InterventionsComponent) },
      { path: 'relatorios', canActivate: [manager], loadComponent: () => import('./features/manager/reports.component').then(m => m.ReportsComponent) },
      // ambos
      { path: 'privacidade', loadComponent: () => import('./features/privacy/privacy.component').then(m => m.PrivacyComponent) },
    ],
  },
  { path: '**', redirectTo: 'entrar' },
];
