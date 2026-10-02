import { ChangeDetectionStrategy, Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LogoComponent } from '../../shared/logo.component';
import { IconComponent } from '../../shared/icon.component';
import { ApiService } from '../../core/api.service';
import { API_BASE } from '../../core/config';
import { AuthService } from '../../core/auth.service';
import { ThemeService } from '../../core/theme.service';
import { AuthResponse, CompanyPublic } from '../../core/models';

type Step = 'company' | 'access' | 'newCompany';
const LAST = 'nexo.lastCompany'; // apenas conveniência: preenche o campo; não é dado de negócio

@Component({
  selector: 'nx-auth',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LogoComponent, IconComponent],
  template: `
    <div class="wrap">
      <div class="panel rise">
        <div class="top">
          <nx-logo [size]="32" />
          <button class="theme" type="button" (click)="toggleTheme()" [attr.aria-label]="theme.mode() === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'">
            <nx-icon [name]="theme.mode() === 'dark' ? 'sun' : 'moon'" />
          </button>
        </div>

        @switch (step()) {
          @case ('company') {
            <h1>Qual é a sua empresa?</h1>
            <p class="sub">Digite o nome ou o código da empresa para continuar.</p>
            <form class="form" (ngSubmit)="lookup()">
              <label class="field">
                <span>Nome ou código da empresa</span>
                <input class="input" name="company" [(ngModel)]="companyQuery" placeholder="Ex.: Hospital Exemplo ou NX-AB12-CD34"
                       autocomplete="organization" autocapitalize="off" required />
              </label>
              @if (error()) { <div class="notice notice-error" role="alert">{{ error() }}</div> }
              <button class="btn btn-primary btn-block" type="submit" [disabled]="loading()">{{ loading() ? 'Procurando…' : 'Continuar' }}</button>
            </form>
            @if (allowSignup()) {
              <button class="link" type="button" (click)="goNewCompany()">Sou gestor e quero cadastrar minha empresa</button>
            }
          }

          @case ('access') {
            <div class="company-chip">
              <div>
                <span class="small muted">Empresa</span>
                <strong>{{ companyTitle() }}</strong>
              </div>
              <button class="link inline" type="button" (click)="reset()">Trocar</button>
            </div>

            <div class="tabs" role="tablist">
              <button role="tab" type="button" [class.on]="mode() === 'login'" (click)="mode.set('login')">Entrar</button>
              <button role="tab" type="button" [class.on]="mode() === 'register'" (click)="mode.set('register')">Criar conta</button>
            </div>

            @if (mode() === 'login') {
              <h1>Entrar</h1>
              <form class="form" (ngSubmit)="login()">
                <label class="field"><span>E-mail</span>
                  <input class="input" type="email" name="email" [(ngModel)]="email" autocomplete="username" inputmode="email" placeholder="nome@empresa.com.br" required /></label>
                <label class="field"><span>Senha</span>
                  <input class="input" type="password" name="password" [(ngModel)]="password" autocomplete="current-password" required /></label>
                @if (error()) { <div class="notice notice-error" role="alert">{{ error() }}</div> }
                <button class="btn btn-primary btn-block" type="submit" [disabled]="loading()">{{ loading() ? 'Entrando…' : 'Entrar' }}</button>
                <p class="legal">Ao entrar, você concorda com os <button class="link inline" type="button" (click)="openTerms('termos')">Termos de Uso</button> e a <button class="link inline" type="button" (click)="openTerms('privacidade')">Política de Privacidade</button>.</p>
              </form>
            } @else {
              <h1>Seus dados</h1>
              <p class="sub">Crie sua conta em {{ companyTitle() }}.</p>
              @if (!selfSignup()) {
                <div class="notice notice-warn">Esta empresa aceita apenas colaboradores pré-cadastrados. Use o mesmo e-mail que seu gestor cadastrou.</div>
              }
              @if (!sectors().length) {
                <div class="notice notice-warn">A empresa ainda não cadastrou setores e equipes. Peça ao gestor para concluir a configuração.</div>
              } @else {
                <form class="form" (ngSubmit)="register()">
                  <label class="field"><span>Nome completo</span>
                    <input class="input" name="name" [(ngModel)]="name" autocomplete="name" required /></label>
                  <label class="field"><span>E-mail</span>
                    <input class="input" type="email" name="email2" [(ngModel)]="email" autocomplete="username" inputmode="email" required /></label>
                  <label class="field"><span>Senha</span>
                    <input class="input" type="password" name="password2" [(ngModel)]="password" autocomplete="new-password" minlength="8" required />
                    <small>Mínimo de 8 caracteres; não pode ser só números.</small></label>
                  <label class="field"><span>Cargo</span>
                    <input class="input" name="jobTitle" [(ngModel)]="jobTitle" autocomplete="organization-title" required /></label>
                  <label class="field"><span>Setor</span>
                    <select class="input" name="sector" [ngModel]="sectorId()" (ngModelChange)="pickSector($event)" required>
                      <option [ngValue]="null">Selecione…</option>
                      @for (s of sectors(); track s.id) { <option [ngValue]="s.id">{{ s.name }}</option> }
                    </select></label>
                  <label class="field"><span>Equipe / time</span>
                    <select class="input" name="team" [ngModel]="teamId()" (ngModelChange)="teamId.set($event)" [disabled]="!sectorId()" required>
                      <option [ngValue]="null">{{ sectorId() ? 'Selecione…' : 'Escolha o setor primeiro' }}</option>
                      @for (t of teams(); track t.id) { <option [ngValue]="t.id">{{ t.name }}</option> }
                    </select></label>
                  <label class="field"><span>Telefone (opcional)</span>
                    <input class="input" type="tel" name="phone" [(ngModel)]="phone" autocomplete="tel" inputmode="tel" /></label>
                  <label class="check">
                    <input type="checkbox" name="terms1" [(ngModel)]="accepted" />
                    <span>Li e aceito os <button class="link inline" type="button" (click)="openTerms('termos')">Termos de Uso</button> e a <button class="link inline" type="button" (click)="openTerms('privacidade')">Política de Privacidade</button>.</span>
                  </label>
                  @if (error()) { <div class="notice notice-error" role="alert">{{ error() }}</div> }
                  <button class="btn btn-primary btn-block" type="submit" [disabled]="loading() || !accepted">{{ loading() ? 'Criando conta…' : 'Criar conta' }}</button>
                </form>
              }
            }
          }

          @case ('newCompany') {
            <button class="link inline back" type="button" (click)="reset()">← Voltar</button>
            <h1>Cadastrar empresa</h1>
            <p class="sub">Você será o gestor. Depois cadastre setores, equipes e colaboradores.</p>
            <form class="form" (ngSubmit)="createCompany()">
              <label class="field"><span>Nome da empresa</span>
                <input class="input" name="companyName" [(ngModel)]="companyName" autocomplete="organization" required /></label>
              <label class="field"><span>Seu nome completo</span>
                <input class="input" name="name3" [(ngModel)]="name" autocomplete="name" required /></label>
              <label class="field"><span>E-mail</span>
                <input class="input" type="email" name="email3" [(ngModel)]="email" autocomplete="username" inputmode="email" required /></label>
              <label class="field"><span>Senha</span>
                <input class="input" type="password" name="password3" [(ngModel)]="password" autocomplete="new-password" minlength="8" required />
                <small>Mínimo de 8 caracteres; não pode ser só números.</small></label>
              <label class="field"><span>Cargo (opcional)</span>
                <input class="input" name="jobTitle3" [(ngModel)]="jobTitle" autocomplete="organization-title" /></label>
              <label class="check">
                    <input type="checkbox" name="terms2" [(ngModel)]="accepted" />
                    <span>Li e aceito os <button class="link inline" type="button" (click)="openTerms('termos')">Termos de Uso</button> e a <button class="link inline" type="button" (click)="openTerms('privacidade')">Política de Privacidade</button>.</span>
                  </label>
                  @if (error()) { <div class="notice notice-error" role="alert">{{ error() }}</div> }
              <button class="btn btn-primary btn-block" type="submit" [disabled]="loading() || !accepted">{{ loading() ? 'Criando…' : 'Criar empresa e entrar' }}</button>
            </form>
          }
        }
      </div>
    </div>
    @if (terms(); as tab) {
      <div class="m-scrim" (click)="terms.set(null)"></div>
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title">
        <header>
          <h2 id="m-title">{{ tab === 'termos' ? 'Termos de Uso' : 'Política de Privacidade' }}</h2>
          <button class="m-x" type="button" (click)="terms.set(null)" aria-label="Fechar">✕</button>
        </header>
        <div class="m-tabs" role="tablist">
          <button role="tab" type="button" [class.on]="tab === 'termos'" (click)="terms.set('termos')">Termos de Uso</button>
          <button role="tab" type="button" [class.on]="tab === 'privacidade'" (click)="terms.set('privacidade')">Privacidade</button>
        </div>
        <div class="m-body">
          @if (tab === 'termos') {
            <h3>1. O que é o NEXO</h3>
            <p>O NEXO é uma plataforma de inteligência preventiva para riscos psicossociais no trabalho. Ele ajuda a organização a entender a rotina e a agir antes que problemas coletivos se agravem.</p>
            <h3>2. O que o NEXO não é</h3>
            <p>O NEXO não é terapia, não faz diagnóstico médico ou psicológico e não substitui psicólogo, médico ou qualquer profissional de saúde. Em caso de sofrimento, procure os canais de apoio da sua empresa ou um profissional.</p>
            <h3>3. Uso responsável</h3>
            <p>Responda com sinceridade e use a plataforma apenas para a finalidade a que ela se destina. Não informe nomes de pacientes, documentos, prontuários ou dados que identifiquem terceiros.</p>
            <h3>4. Sua conta</h3>
            <p>Mantenha sua senha em segurança. Você é responsável pelas ações feitas com a sua conta.</p>
            <h3>5. Uso proibido dos dados</h3>
            <p>Os dados psicossociais não podem ser usados para punição, avaliação de desempenho ou exposição individual.</p>
            <h3>6. Alterações</h3>
            <p>Estes termos podem ser atualizados. Mudanças relevantes serão comunicadas na plataforma.</p>
          } @else {
            <h3>Como tratamos seus dados</h3>
            <p>Tratamos seus dados conforme a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018), com finalidade, necessidade e transparência.</p>
            <h3>O que os gestores veem</h3>
            <p>Somente resultados agregados por setor ou equipe, e apenas quando há um número mínimo de participantes. Gestores nunca veem as respostas de uma pessoa.</p>
            <h3>O que você vê</h3>
            <p>Somente os seus próprios registros e histórico.</p>
            <h3>Comentários e IA</h3>
            <p>Comentários são armazenados protegidos e apagados após o período de retenção. Antes de qualquer análise automática, e-mails, telefones e documentos são removidos do texto.</p>
            <h3>Seus direitos</h3>
            <p>Você pode acessar, exportar e apagar o que foi registrado sobre você, e pedir esclarecimentos ao encarregado (DPO) da sua empresa.</p>
            <h3>O que o NEXO não faz</h3>
            <p>Não monitora e-mails, chats ou canais privados, não faz diagnóstico e não rotula pessoas.</p>
          }
        </div>
        <button class="btn btn-primary btn-block" type="button" (click)="terms.set(null)">Entendi</button>
      </section>
    }
  `,
  styles: [`
    .wrap {
      min-height: 100dvh; display: flex; align-items: flex-start; justify-content: center;
      padding: calc(20px + var(--safe-top)) 16px calc(24px + var(--safe-bottom));
      background:
        radial-gradient(700px 400px at 15% 0%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 60%),
        radial-gradient(600px 380px at 90% 100%, color-mix(in srgb, var(--teal) 10%, transparent), transparent 60%),
        var(--bg);
    }
    .panel { width: 100%; max-width: 440px; display: flex; flex-direction: column; gap: 14px; }
    .top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
    .theme { width: 44px; height: 44px; border-radius: 50%; border: 1px solid var(--line); background: var(--surface); color: var(--ink-2); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
    .link { background: none; border: none; color: var(--accent-ink); font-weight: 600; font-size: 14px; padding: 12px 4px; cursor: pointer; text-align: center; }
    .link.inline { padding: 4px 0; width: auto; }
    .back { align-self: flex-start; color: var(--muted); }
    .company-chip { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; border-radius: var(--r-md); background: var(--surface); border: 1px solid var(--line); }
    .company-chip div { display: flex; flex-direction: column; line-height: 1.3; }
    .tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; background: var(--ink-soft); border-radius: var(--r-md); }
    .tabs button { min-height: 44px; border: none; background: none; border-radius: var(--r-sm); font-weight: 600; font-size: 14.5px; color: var(--muted); cursor: pointer; }
    .tabs button.on { background: var(--surface); color: var(--ink); box-shadow: var(--shadow-sm); }
    .legal { font-size: 12.5px; color: var(--muted); line-height: 1.55; text-align: center; margin: 2px 0 0; }
    .legal .link { font-size: 12.5px; padding: 0; text-decoration: underline; }
    .check { display: flex; align-items: flex-start; gap: 10px; font-size: 13.5px; line-height: 1.5; color: var(--ink-2); cursor: pointer; }
    .check input { flex: none; width: 22px; height: 22px; margin-top: 1px; accent-color: var(--accent); }
    .check .link { font-size: 13.5px; padding: 0; text-decoration: underline; }
    .m-scrim { position: fixed; inset: 0; z-index: 100; background: var(--scrim); }
    .modal { position: fixed; z-index: 110; left: 12px; right: 12px; bottom: calc(12px + var(--safe-bottom)); max-width: 520px; max-height: 86dvh; margin: 0 auto;
      display: flex; flex-direction: column; gap: 12px; padding: 20px; background: var(--surface); color: var(--ink);
      border: 1px solid var(--line); border-radius: var(--r-xl); box-shadow: var(--shadow-lg); }
    .modal header { display: flex; align-items: center; justify-content: space-between; }
    .modal h2 { font-size: 19px; }
    .m-x { width: 40px; height: 40px; border-radius: 50%; border: none; background: var(--ink-soft); color: var(--ink); cursor: pointer; }
    .m-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; background: var(--ink-soft); border-radius: var(--r-md); }
    .m-tabs button { min-height: 40px; border: none; background: none; border-radius: var(--r-sm); font-weight: 600; font-size: 14px; color: var(--muted); cursor: pointer; }
    .m-tabs button.on { background: var(--surface); color: var(--ink); box-shadow: var(--shadow-sm); }
    .m-body { overflow: auto; padding-right: 4px; }
    .m-body h3 { font-size: 14.5px; margin: 14px 0 4px; }
    .m-body h3:first-child { margin-top: 0; }
    .m-body p { font-size: 13.5px; line-height: 1.6; color: var(--ink-2); }
    @media (min-width: 720px) { .modal { top: 50%; bottom: auto; transform: translateY(-50%); } }
    @media (min-width: 720px) {
      .wrap { align-items: center; }
      .panel { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-xl); box-shadow: var(--shadow-lg); padding: 32px; }
    }
  `],
})
export class AuthComponent {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);
  readonly theme = inject(ThemeService);

  step = signal<Step>('company');
  mode = signal<'login' | 'register'>('login');
  company = signal<CompanyPublic | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);
  allowSignup = signal(true);
  terms = signal<'termos' | 'privacidade' | null>(null);
  accepted = false;

  companyQuery = '';
  companyName = '';
  name = '';
  email = '';
  password = '';
  jobTitle = '';
  phone = '';
  sectorId = signal<number | null>(null);
  teamId = signal<number | null>(null);

  companyTitle = computed(() => this.company()?.name ?? '');
  selfSignup = computed(() => this.company()?.selfSignup ?? false);
  sectors = computed(() => this.company()?.sectors ?? []);
  teams = computed(() => this.sectors().find(s => s.id === this.sectorId())?.teams ?? []);

  constructor() {
    try { this.companyQuery = localStorage.getItem(LAST) ?? ''; } catch { /* sem armazenamento */ }
    fetch(`${API_BASE}/config`).then(r => r.json()).then(c => this.allowSignup.set(c.allowCompanySignup !== false)).catch(() => undefined);
  }

  openTerms(t: 'termos' | 'privacidade') { this.terms.set(t); }
  @HostListener('document:keydown.escape') onEsc() { this.terms.set(null); }

  toggleTheme() { this.theme.apply(this.theme.next()); }

  pickSector(id: number | null) { this.sectorId.set(id); this.teamId.set(null); }

  reset() { this.accepted = false; this.step.set('company'); this.company.set(null); this.error.set(null); this.password = ''; }
  goNewCompany() { this.error.set(null); this.step.set('newCompany'); }

  async lookup() {
    this.error.set(null);
    const q = this.companyQuery.trim();
    if (q.length < 2) { this.error.set('Digite o nome ou o código da empresa.'); return; }
    await this.run(async () => {
      const r = await this.api.post<{ company: CompanyPublic }>('/auth/company', { company: q });
      this.company.set(r.company);
      try { localStorage.setItem(LAST, q); } catch { /* ignora */ }
      this.mode.set('login');
      this.step.set('access');
    });
  }

  async login() {
    this.error.set(null);
    const c = this.company();
    if (!c) return;
    if (!this.email || !this.password) { this.error.set('Informe e-mail e senha.'); return; }
    await this.run(async () => this.finish(await this.api.post<AuthResponse>('/auth/login', {
      company: c.code, email: this.email, password: this.password,
    })));
  }

  async register() {
    this.error.set(null);
    const c = this.company();
    if (!c) return;
    if (!this.accepted) { this.error.set('Aceite os Termos de Uso e a Política de Privacidade para continuar.'); return; }
    if (!this.sectorId() || !this.teamId()) { this.error.set('Selecione o setor e a equipe.'); return; }
    await this.run(async () => this.finish(await this.api.post<AuthResponse>('/auth/register', {
      company: c.code, name: this.name, email: this.email, password: this.password,
      jobTitle: this.jobTitle, phone: this.phone || undefined, sectorId: this.sectorId(), teamId: this.teamId(),
    })));
  }

  async createCompany() {
    this.error.set(null);
    if (!this.accepted) { this.error.set('Aceite os Termos de Uso e a Política de Privacidade para continuar.'); return; }
    await this.run(async () => this.finish(await this.api.post<AuthResponse>('/auth/register-company', {
      companyName: this.companyName, name: this.name, email: this.email, password: this.password, jobTitle: this.jobTitle || undefined,
    })));
  }

  private finish(r: AuthResponse) {
    this.auth.setSession(r);
    this.router.navigate([this.auth.home]);
  }

  private async run(fn: () => Promise<void>) {
    this.loading.set(true);
    try { await fn(); } catch (e) { this.error.set(e instanceof Error ? e.message : 'Não foi possível concluir.'); } finally { this.loading.set(false); }
  }
}
