import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { Role } from './models';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isLoggedIn ? true : inject(Router).createUrlTree(['/entrar']);
};

/** Se já está logado, a tela de entrada leva direto ao sistema. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isLoggedIn ? inject(Router).createUrlTree([auth.home]) : true;
};

/** Barreira de navegação. A barreira REAL é o backend (requireRole): esta só evita telas vazias. */
export const roleGuard = (roles: Role[]): CanActivateFn => () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn) return router.createUrlTree(['/entrar']);
  return auth.can(roles) ? true : router.createUrlTree([auth.home]);
};
