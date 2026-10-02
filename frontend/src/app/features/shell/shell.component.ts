import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { LogoComponent } from '../../shared/logo.component';
import { AuthService } from '../../core/auth.service';
import { ApiService } from '../../core/api.service';
import { ThemeService } from '../../core/theme.service';
import { IconComponent, IconName } from '../../shared/icon.component';

interface NavItem { path: string; label: string; icon: IconName; }

const EMPLOYEE_NAV: NavItem[] = [
  { path: '/app/inicio', label: 'Início', icon: 'home' },
  { path: '/app/checkin', label: 'Check-in', icon: 'checkin' },
  { path: '/app/historico', label: 'Histórico', icon: 'history' },
  { path: '/app/privacidade', label: 'Privacidade', icon: 'privacy' },
];

const MANAGER_NAV: NavItem[] = [
  { path: '/app/visao-geral', label: 'Visão geral', icon: 'overview' },
  { path: '/app/colaboradores', label: 'Pessoas', icon: 'people' },
  { path: '/app/estrutura', label: 'Setores', icon: 'sectors' },
  { path: '/app/insights', label: 'Insights', icon: 'insights' },
  { path: '/app/intervencoes', label: 'Intervenções', icon: 'interventions' },
  { path: '/app/relatorios', label: 'Relatórios', icon: 'reports' },
  { path: '/app/privacidade', label: 'Privacidade', icon: 'privacy' },
];

@Component({
  selector: 'nx-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LogoComponent, IconComponent],
  template: `
    <div class="shell">
      <!-- Menu lateral (desktop) -->
      <aside class="sidebar">
        <div class="side-top"><nx-logo [size]="28" /></div>
        <nav aria-label="Principal">
          @for (item of nav(); track item.path) {
            <a [routerLink]="item.path" routerLinkActive="active"><span class="ico"><nx-icon [name]="item.icon" /></span> {{ item.label }}</a>
          }
          <a routerLink="/app/perfil" routerLinkActive="active"><span class="ico"><nx-icon name="profile" /></span> Meu perfil</a>
        </nav>
        <div class="side-foot">
          <button class="side-btn" type="button" (click)="toggleTheme()">
            <span class="ico"><nx-icon [name]="theme.mode() === 'dark' ? 'sun' : 'moon'" /></span> {{ theme.mode() === 'dark' ? 'Tema claro' : 'Tema escuro' }}
          </button>
          <button class="side-btn" type="button" (click)="logout()"><span class="ico"><nx-icon name="logout" /></span> Sair</button>
        </div>
      </aside>

      <div class="main">
        <header class="header">
          <div class="org">
            <span class="mobile-logo"><nx-logo [size]="26" [showWord]="false" /></span>
            <div class="org-txt">
              <strong>{{ companyName() }}</strong>
              <span>{{ roleLabel() }}</span>
            </div>
          </div>
          <div class="h-actions">
            <button class="icon-btn" type="button" (click)="toggleTheme()"
                    [attr.aria-label]="theme.mode() === 'dark' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'"
                    [title]="theme.mode() === 'dark' ? 'Tema claro' : 'Tema escuro'">
              <nx-icon [name]="theme.mode() === 'dark' ? 'sun' : 'moon'" />
            </button>
            <a class="avatar" routerLink="/app/perfil" aria-label="Meu perfil" title="Meu perfil">{{ initials() }}</a>
          </div>
        </header>

        <main class="content"><router-outlet /></main>
      </div>

      <!-- Barra inferior (celular) -->
      <nav class="tabbar" aria-label="Principal">
        @for (item of primary(); track item.path) {
          <a [routerLink]="item.path" routerLinkActive="active" class="tab">
            <span class="t-ico"><nx-icon [name]="item.icon" [size]="22" /></span><span class="t-lbl">{{ item.label }}</span>
          </a>
        }
        <button class="tab" type="button" [class.active]="moreOpen()" (click)="moreOpen.set(true)">
          <span class="t-ico"><nx-icon name="menu" [size]="22" /></span><span class="t-lbl">Mais</span>
        </button>
      </nav>
    </div>

    @if (moreOpen()) {
      <div class="scrim" (click)="moreOpen.set(false)">
        <div class="sheet" role="dialog" aria-label="Menu" (click)="$event.stopPropagation()">
          <div class="who">
            <span class="avatar big">{{ initials() }}</span>
            <div><strong>{{ auth.user()?.name }}</strong><div class="small muted">{{ auth.user()?.email }}</div></div>
          </div>
          <div class="more-list">
            @for (item of more(); track item.path) {
              <a class="more-item" [routerLink]="item.path" (click)="moreOpen.set(false)"><span class="ico"><nx-icon [name]="item.icon" /></span> {{ item.label }}</a>
            }
            <a class="more-item" routerLink="/app/perfil" (click)="moreOpen.set(false)"><span class="ico"><nx-icon name="profile" /></span> Meu perfil</a>
            <button class="more-item" type="button" (click)="toggleTheme()">
              <span class="ico"><nx-icon [name]="theme.mode() === 'dark' ? 'sun' : 'moon'" /></span> {{ theme.mode() === 'dark' ? 'Tema claro' : 'Tema escuro' }}
            </button>
            <button class="more-item danger" type="button" (click)="logout()"><span class="ico"><nx-icon name="logout" /></span> Sair da conta</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .shell { display: flex; min-height: 100dvh; }
    .sidebar { display: none; }
    .main { flex: 1; min-width: 0; display: flex; flex-direction: column; }

    .header {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: calc(10px + var(--safe-top)) 16px 10px; background: var(--header-bg);
      backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--line); position: sticky; top: 0; z-index: 40;
    }
    .org { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .org-txt { display: flex; flex-direction: column; line-height: 1.25; min-width: 0; }
    .org-txt strong { font-size: 14.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .org-txt span { font-size: 12px; color: var(--muted); }
    .h-actions { display: flex; align-items: center; gap: 10px; }
    .icon-btn { width: 44px; height: 44px; border-radius: 50%; border: 1px solid var(--line); background: var(--surface); color: var(--ink-2); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
    .icon-btn:hover { border-color: var(--faint); }
    a.avatar { cursor: pointer; }
    .avatar { width: 40px; height: 40px; border-radius: 50%; background: var(--grad-accent); color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex: none; }
    .avatar.big { width: 48px; height: 48px; font-size: 15px; }

    .content { flex: 1; padding: 18px 16px calc(96px + var(--safe-bottom)); width: 100%; max-width: 1120px; margin: 0 auto; }

    .tabbar {
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 50; display: flex;
      background: var(--surface); border-top: 1px solid var(--line); box-shadow: 0 -4px 20px rgba(0,0,0,.06);
      padding: 6px 6px calc(6px + var(--safe-bottom));
    }
    .tab {
      flex: 1; min-width: 0; min-height: 56px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
      border: none; background: none; border-radius: var(--r-md); color: var(--muted); cursor: pointer; font-family: inherit;
    }
    .t-ico { line-height: 0; }
    .t-lbl { font-size: 11px; font-weight: 600; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tab.active { color: var(--accent-ink); background: var(--accent-soft); }

    .who { display: flex; align-items: center; gap: 12px; padding-bottom: 14px; border-bottom: 1px solid var(--line); margin-bottom: 8px; }
    .more-list { display: flex; flex-direction: column; }
    .more-item { display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 0 6px; border: none; background: none; font: inherit; font-size: 15.5px; font-weight: 500; color: var(--ink); text-align: left; cursor: pointer; border-radius: var(--r-md); }
    .more-item:hover { background: var(--surface-2); }
    .more-item.danger { color: var(--at-alta); }
    .ico { width: 36px; height: 36px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; flex: none; background: var(--accent-soft); color: var(--accent-ink); }

    @media (min-width: 960px) {
      .sidebar {
        display: flex; flex-direction: column; width: 244px; flex: none; background: var(--surface);
        border-right: 1px solid var(--line); position: sticky; top: 0; height: 100dvh; padding: 22px 14px;
      }
      .side-top { padding: 4px 10px 22px; }
      nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
      nav a { display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 0 10px; border-radius: var(--r-sm); font-size: 14px; font-weight: 500; color: var(--muted); transition: background .15s, color .15s; }
      nav a:hover { background: var(--surface-2); color: var(--ink); }
      nav a.active { background: var(--accent-soft); color: var(--accent-ink); font-weight: 600; }
      .side-foot { display: flex; flex-direction: column; gap: 2px; border-top: 1px solid var(--line); padding-top: 10px; }
      .side-btn { display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 0 10px; border: none; background: none; font: inherit; font-size: 14px; color: var(--muted); border-radius: var(--r-sm); cursor: pointer; text-align: left; }
      .side-btn:hover { background: var(--surface-2); color: var(--ink); }
      .tabbar, .mobile-logo { display: none; }
      .header { padding: 12px 32px; }
      .content { padding: 28px 32px 56px; }
    }
  `],
})
export class ShellComponent {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  private api = inject(ApiService);
  private router = inject(Router);

  moreOpen = signal(false);

  nav = computed<NavItem[]>(() => (this.auth.role() === 'manager' ? MANAGER_NAV : EMPLOYEE_NAV));
  /** No celular: até 4 atalhos + "Mais". */
  primary = computed(() => this.nav().slice(0, this.nav().length > 5 ? 4 : 3));
  more = computed(() => this.nav().slice(this.primary().length));

  companyName = computed(() => this.auth.user()?.company.name ?? 'NEXO');
  roleLabel = computed(() => (this.auth.role() === 'manager' ? 'Gestor' : this.auth.user()?.teamName ?? 'Colaborador'));
  initials = computed(() => {
    const parts = (this.auth.user()?.name ?? '').split(' ').filter(Boolean);
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  });

  constructor() {
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => this.moreOpen.set(false));
  }

  /** Alterna o tema na hora e salva a preferência no banco (por usuário). */
  toggleTheme() {
    const next = this.theme.next();
    this.theme.apply(next);
    this.api.put('/me/theme', { theme: next }).catch(() => undefined);
    const u = this.auth.user();
    if (u) this.auth.updateUser({ ...u, theme: next });
  }

  logout() { this.moreOpen.set(false); this.auth.logout(); }
}
