import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { CompanyInfo, SessionUser } from '../../core/models';
import { IconComponent } from '../../shared/icon.component';

/**
 * Meu perfil. Todos editam nome, cargo, telefone e senha. O gestor tem mais: e-mail de acesso e
 * dados da empresa (nome e cadastro aberto), além de atalhos para Pessoas e Setores.
 */
@Component({
  selector: 'nx-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, IconComponent],
  template: `
    <h1>Meu perfil</h1>
    <p class="sub">{{ isManager() ? 'Você é gestor: pode editar também os dados de acesso e da empresa.' : 'Mantenha seus dados atualizados.' }}</p>

    <div class="stack">
      <section class="card card-pad">
        <div class="who">
          <span class="avatar">{{ initials() }}</span>
          <div><strong>{{ user()?.name }}</strong><div class="small muted">{{ user()?.email }}</div></div>
          <span class="tag tag-none">{{ isManager() ? 'Gestor' : 'Colaborador' }}</span>
        </div>
        @if (!isManager() && (user()?.sectorName || user()?.teamName)) {
          <p class="small muted place">{{ user()?.sectorName }}{{ user()?.teamName ? ' · ' + user()?.teamName : '' }} — setor e equipe são definidos pelo gestor.</p>
        }
      </section>

      <section class="card card-pad">
        <h2>Dados pessoais</h2>
        <form class="form" (ngSubmit)="saveProfile()">
          <label class="field"><span>Nome completo</span>
            <input class="input" name="name" [(ngModel)]="name" autocomplete="name" required /></label>
          <label class="field"><span>Cargo</span>
            <input class="input" name="job" [(ngModel)]="jobTitle" autocomplete="organization-title" /></label>
          <label class="field"><span>Telefone (opcional)</span>
            <input class="input" name="phone" type="tel" inputmode="tel" [(ngModel)]="phone" autocomplete="tel" /></label>
          @if (isManager()) {
            <label class="field"><span>E-mail de acesso</span>
              <input class="input" name="email" type="email" inputmode="email" [(ngModel)]="email" autocomplete="username" required />
              <small>Será usado para entrar no NEXO.</small></label>
          }
          @if (profileError()) { <div class="notice notice-error" role="alert">{{ profileError() }}</div> }
          <button class="btn btn-primary" type="submit" [disabled]="savingProfile()">{{ savingProfile() ? 'Salvando…' : 'Salvar alterações' }}</button>
        </form>
      </section>

      <section class="card card-pad">
        <h2>Senha</h2>
        <form class="form" (ngSubmit)="savePassword()">
          <label class="field"><span>Senha atual</span>
            <input class="input" type="password" name="cur" [(ngModel)]="currentPassword" autocomplete="current-password" required /></label>
          <label class="field"><span>Nova senha</span>
            <input class="input" type="password" name="new" [(ngModel)]="newPassword" autocomplete="new-password" minlength="8" required />
            <small>Mínimo de 8 caracteres; não pode ser só números.</small></label>
          @if (passwordError()) { <div class="notice notice-error" role="alert">{{ passwordError() }}</div> }
          <button class="btn btn-ghost" type="submit" [disabled]="savingPassword()">{{ savingPassword() ? 'Alterando…' : 'Alterar senha' }}</button>
        </form>
      </section>

      @if (isManager()) {
        <section class="card card-pad">
          <h2>Empresa</h2>
          <form class="form" (ngSubmit)="saveCompany()">
            <label class="field"><span>Nome da empresa</span>
              <input class="input" name="company" [(ngModel)]="companyName" autocomplete="organization" required /></label>
            @if (user()?.company?.code) {
              <div class="code">
                <div><span class="small muted">Código da empresa (para convidar pessoas)</span><strong>{{ user()?.company?.code }}</strong></div>
                <button class="btn btn-ghost btn-sm" type="button" (click)="copyCode()">Copiar</button>
              </div>
            }
            <label class="check">
              <input type="checkbox" name="self" [(ngModel)]="selfSignup" />
              <span><strong>Permitir cadastro aberto</strong><small>Colaboradores criam a própria conta usando o código. Desativado: só entram os pré-cadastrados.</small></span>
            </label>
            @if (companyError()) { <div class="notice notice-error" role="alert">{{ companyError() }}</div> }
            <button class="btn btn-primary" type="submit" [disabled]="savingCompany()">{{ savingCompany() ? 'Salvando…' : 'Salvar empresa' }}</button>
          </form>
          <div class="shortcuts">
            <a class="short" routerLink="/app/colaboradores"><span class="ico"><nx-icon name="people" /></span> Gerenciar pessoas</a>
            <a class="short" routerLink="/app/estrutura"><span class="ico"><nx-icon name="sectors" /></span> Setores e equipes</a>
          </div>
        </section>
      }
    </div>
  `,
  styles: [`
    h1 { font-size: 22px; }
    h2 { font-size: 16px; margin-bottom: 12px; }
    .sub { color: var(--muted); margin: 6px 0 18px; font-size: 13.5px; }
    .stack { display: flex; flex-direction: column; gap: 14px; max-width: 640px; }
    .who { display: flex; align-items: center; gap: 12px; }
    .who .tag { margin-left: auto; }
    .avatar { width: 48px; height: 48px; border-radius: 50%; background: var(--grad-accent); color: #fff; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; flex: none; }
    .place { margin-top: 12px; }
    .code { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border-radius: var(--r-md); background: var(--ink-soft); }
    .code div { display: flex; flex-direction: column; gap: 2px; }
    .code strong { font-size: 16px; letter-spacing: .04em; }
    .check { display: flex; align-items: flex-start; gap: 12px; cursor: pointer; }
    .check input { flex: none; width: 22px; height: 22px; margin-top: 2px; accent-color: var(--accent); }
    .check span { display: flex; flex-direction: column; gap: 2px; font-size: 14px; }
    .check small { color: var(--muted); font-size: 12.5px; line-height: 1.5; }
    .shortcuts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--line); }
    .short { display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 8px 10px; border: 1px solid var(--line); border-radius: var(--r-md); font-weight: 600; font-size: 14px; }
    .short:hover { background: var(--surface-2); }
    .ico { width: 36px; height: 36px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; background: var(--accent-soft); color: var(--accent-ink); flex: none; }
    @media (max-width: 520px) { .shortcuts { grid-template-columns: 1fr; } }
  `],
})
export class ProfileComponent {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);

  user = this.auth.user;
  isManager = computed(() => this.auth.role() === 'manager');
  initials = computed(() => {
    const parts = (this.user()?.name ?? '').split(' ').filter(Boolean);
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  });

  name = this.user()?.name ?? '';
  jobTitle = this.user()?.jobTitle ?? '';
  phone = this.user()?.phone ?? '';
  email = this.user()?.email ?? '';
  currentPassword = '';
  newPassword = '';
  companyName = this.user()?.company.name ?? '';
  selfSignup = false;

  savingProfile = signal(false);
  savingPassword = signal(false);
  savingCompany = signal(false);
  profileError = signal<string | null>(null);
  passwordError = signal<string | null>(null);
  companyError = signal<string | null>(null);

  constructor() {
    if (this.isManager()) {
      this.api.get<CompanyInfo>('/company').then(c => { this.selfSignup = !!c.selfSignup; this.companyName = c.name; }).catch(() => undefined);
    }
  }

  async saveProfile() {
    this.profileError.set(null);
    this.savingProfile.set(true);
    try {
      const body: Record<string, unknown> = { name: this.name, jobTitle: this.jobTitle, phone: this.phone };
      if (this.isManager()) body['email'] = this.email;
      const r = await this.api.put<{ user: SessionUser }>('/me/profile', body);
      this.auth.updateUser(r.user);
      this.toast.success('Perfil atualizado.');
    } catch (e) { this.profileError.set(this.msg(e)); } finally { this.savingProfile.set(false); }
  }

  async savePassword() {
    this.passwordError.set(null);
    this.savingPassword.set(true);
    try {
      await this.api.put('/me/password', { currentPassword: this.currentPassword, newPassword: this.newPassword });
      this.currentPassword = ''; this.newPassword = '';
      this.toast.success('Senha alterada.');
    } catch (e) { this.passwordError.set(this.msg(e)); } finally { this.savingPassword.set(false); }
  }

  async saveCompany() {
    this.companyError.set(null);
    this.savingCompany.set(true);
    try {
      const c = await this.api.put<CompanyInfo>('/company', { name: this.companyName, selfSignup: this.selfSignup });
      const u = this.user();
      if (u) this.auth.updateUser({ ...u, company: { ...u.company, name: c.name } });
      this.toast.success('Empresa atualizada.');
    } catch (e) { this.companyError.set(this.msg(e)); } finally { this.savingCompany.set(false); }
  }

  async copyCode() {
    const code = this.user()?.company.code;
    if (!code) return;
    try { await navigator.clipboard.writeText(code); this.toast.success('Código copiado.'); } catch { this.toast.info(code); }
  }

  private msg(e: unknown) { return e instanceof Error ? e.message : 'Não foi possível salvar.'; }
}
