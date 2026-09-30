import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthResponse, Role, SessionUser } from './models';
import { ThemeService } from './theme.service';

interface Session { token: string; user: SessionUser; }
const KEY = 'nexo.session';

/**
 * A sessão vive em sessionStorage (some ao fechar a aba) e contém apenas o token e o perfil
 * da sessão. Nenhum dado de negócio é guardado no navegador: tudo vem da API a cada tela.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private theme = inject(ThemeService);
  private router: Router | null = null;
  private state = signal<Session | null>(null);

  readonly user = computed(() => this.state()?.user ?? null);
  readonly role = computed<Role | null>(() => this.state()?.user.role ?? null);

  constructor() {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw) as Session;
        if (s?.token && s?.user) this.state.set(s);
      }
    } catch { this.state.set(null); }
    const u = this.state()?.user;
    if (u?.theme) this.theme.apply(u.theme);
  }

  setRouter(r: Router) { this.router = r; }

  get isLoggedIn(): boolean { return !!this.state(); }

  setSession(r: AuthResponse) {
    this.state.set({ token: r.token, user: r.user });
    sessionStorage.setItem(KEY, JSON.stringify({ token: r.token, user: r.user }));
    // O tema salvo no banco vale; se o usuário nunca escolheu, mantém o do sistema/último uso.
    if (r.user.theme) this.theme.apply(r.user.theme);
  }

  updateUser(user: SessionUser) {
    const s = this.state();
    if (!s) return;
    this.setSession({ token: s.token, user });
  }

  logout(redirect = true) {
    this.state.set(null);
    sessionStorage.removeItem(KEY);
    if (redirect) this.router?.navigate(['/entrar']);
  }

  headers(): Record<string, string> {
    const s = this.state();
    return s ? { Authorization: `Bearer ${s.token}` } : {};
  }

  get home(): string { return this.role() === 'manager' ? '/app/visao-geral' : '/app/inicio'; }
  can(roles: Role[]): boolean { const r = this.role(); return !!r && roles.includes(r); }
}
