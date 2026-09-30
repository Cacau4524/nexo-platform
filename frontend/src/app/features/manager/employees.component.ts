import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, qs } from '../../core/api.service';
import { EmployeeItem, EmployeeList, EmployeeStats, EmployeeStatus, Structure } from '../../core/models';
import { ToastService } from '../../core/toast.service';

const STATUS_LABEL: Record<EmployeeStatus, string> = { active: 'Ativo', pending: 'Aguardando conta', inactive: 'Inativo' };
const STATUS_TAG: Record<EmployeeStatus, string> = { active: 'baixa', pending: 'moderada', inactive: 'none' };

@Component({
  selector: 'nx-employees',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DatePipe, DecimalPipe, RouterLink],
  template: `
    <div class="page">
      <div class="row between top">
        <div class="page-head"><h1>Gestão de colaboradores</h1><p class="sub">Somente cadastro e participação. Respostas individuais nunca são exibidas.</p></div>
        <button class="btn btn-accent" type="button" (click)="openNew()" [disabled]="!structure()?.sectors?.length">+ Adicionar</button>
      </div>

      @if (structure() && !structure()!.sectors.length) {
        <div class="notice notice-warn">Cadastre primeiro os setores e equipes em <a routerLink="/app/estrutura" class="lnk">Setores e equipes</a>.</div>
      }

      <!-- Números reais do banco -->
      @if (stats(); as s) {
        <section class="grid grid-4">
          <div class="card kpi"><span class="k">Cadastrados</span><strong>{{ s.total | number }}</strong><span class="sm">colaboradores</span></div>
          <div class="card kpi"><span class="k">Ativos</span><strong>{{ s.active | number }}</strong><span class="sm">{{ s.pending | number }} aguardando conta</span></div>
          <div class="card kpi"><span class="k">Enviaram dados</span><strong>{{ s.participated | number }}</strong><span class="sm">últimas 4 semanas · {{ s.rate | number: '1.0-1' }}%</span></div>
          <div class="card kpi"><span class="k">Ainda não participaram</span><strong>{{ s.notParticipated | number }}</strong><span class="sm">colaboradores</span></div>
        </section>
      }

      <!-- Busca e filtros -->
      <div class="card card-pad filters">
        <input class="input" type="search" placeholder="Buscar por nome, e-mail ou cargo" [ngModel]="search()" (ngModelChange)="onSearch($event)" name="q" aria-label="Buscar" />
        <div class="f-row">
          <select class="input" aria-label="Setor" [ngModel]="sectorId()" (ngModelChange)="setSector($event)" name="fs">
            <option [ngValue]="null">Todos os setores</option>
            @for (s of structure()?.sectors ?? []; track s.id) { <option [ngValue]="s.id">{{ s.name }}</option> }
          </select>
          <select class="input" aria-label="Equipe" [ngModel]="teamId()" (ngModelChange)="setTeam($event)" name="ft" [disabled]="sectorId() === null">
            <option [ngValue]="null">Todas as equipes</option>
            @for (t of teamsOfFilter(); track t.id) { <option [ngValue]="t.id">{{ t.name }}</option> }
          </select>
          <select class="input" aria-label="Status" [ngModel]="status()" (ngModelChange)="setStatus($event)" name="fst">
            <option value="">Todos os status</option>
            <option value="active">Ativos</option>
            <option value="pending">Aguardando conta</option>
            <option value="inactive">Inativos</option>
          </select>
        </div>
      </div>

      <!-- Lista -->
      @if (loading() && !list()) {
        <div class="skeleton" style="height: 200px"></div>
      } @else {
        <div class="head-row small muted"><span>{{ list()?.total ?? 0 }} colaboradores</span></div>
        <div class="table">
          <div class="t-head">
            <span>Colaborador</span><span>Setor / equipe</span><span>Status</span><span>Cadastro</span><span>Último envio</span><span>Participação</span>
          </div>
          @for (e of list()?.items ?? []; track e.id) {
            <button type="button" class="t-row card" (click)="openEdit(e)">
              <div class="c-name"><strong>{{ e.name }}</strong><span class="small muted">{{ e.jobTitle }}</span></div>
              <div class="c-org"><span>{{ e.sectorName }}</span><span class="small muted">{{ e.teamName }}</span></div>
              <div><span class="tag" [class]="'tag-' + statusTag(e.status)">{{ statusLabel(e.status) }}</span></div>
              <div class="c-date"><span class="lbl">Cadastro</span>{{ e.createdAt | date: 'dd/MM/yyyy' }}</div>
              <div class="c-date"><span class="lbl">Último envio</span>{{ lastSent(e) }}</div>
              <div class="c-part"><span class="lbl">Participação</span>{{ e.participation.weeksDone }}/{{ e.participation.weeksTotal }} sem.</div>
            </button>
          } @empty {
            <div class="card card-pad"><p class="sub">Nenhum colaborador encontrado com estes filtros.</p></div>
          }
        </div>
        @if (pages() > 1) {
          <div class="pager">
            <button class="btn btn-ghost btn-sm" type="button" (click)="go(page() - 1)" [disabled]="page() <= 1">‹ Anterior</button>
            <span class="small muted">Página {{ page() }} de {{ pages() }}</span>
            <button class="btn btn-ghost btn-sm" type="button" (click)="go(page() + 1)" [disabled]="page() >= pages()">Próxima ›</button>
          </div>
        }
      }
    </div>

    <!-- Formulário (novo / editar) -->
    @if (form(); as f) {
      <div class="scrim" (click)="closeForm()">
        <div class="sheet" role="dialog" [attr.aria-label]="f.id ? 'Editar colaborador' : 'Novo colaborador'" (click)="$event.stopPropagation()">
          <h2>{{ f.id ? 'Editar colaborador' : 'Novo colaborador' }}</h2>
          @if (!f.id) { <p class="sub" style="margin: 4px 0 14px">A pessoa ativa a conta criando a senha na tela de entrada, com este mesmo e-mail.</p> }
          <form class="form" (ngSubmit)="save()">
            <label class="field"><span>Nome completo</span><input class="input" name="n" [(ngModel)]="f.name" required /></label>
            <label class="field"><span>E-mail</span><input class="input" type="email" name="e" [(ngModel)]="f.email" [disabled]="!!f.id" required /></label>
            <label class="field"><span>Cargo</span><input class="input" name="c" [(ngModel)]="f.jobTitle" required /></label>
            <label class="field"><span>Setor</span>
              <select class="input" name="s" [ngModel]="f.sectorId" (ngModelChange)="formSector($event)" required>
                <option [ngValue]="null">Selecione…</option>
                @for (s of structure()?.sectors ?? []; track s.id) { <option [ngValue]="s.id">{{ s.name }}</option> }
              </select></label>
            <label class="field"><span>Equipe</span>
              <select class="input" name="t" [(ngModel)]="f.teamId" [disabled]="f.sectorId === null" required>
                <option [ngValue]="null">Selecione…</option>
                @for (t of teamsOfForm(); track t.id) { <option [ngValue]="t.id">{{ t.name }}</option> }
              </select></label>
            <label class="field"><span>Telefone (opcional)</span><input class="input" type="tel" name="p" [(ngModel)]="f.phone" /></label>
            @if (f.id) {
              <label class="field"><span>Status</span>
                <select class="input" name="st" [(ngModel)]="f.status">
                  <option value="active">Ativo</option><option value="inactive">Inativo (não conta na participação)</option>
                </select></label>
            }
            @if (formError()) { <div class="notice notice-error" role="alert">{{ formError() }}</div> }
            <div class="row-wrap"><button class="btn btn-ghost" type="button" (click)="closeForm()">Cancelar</button>
              <button class="btn btn-primary" type="submit" [disabled]="saving()">{{ saving() ? 'Salvando…' : 'Salvar' }}</button></div>
          </form>
        </div>
      </div>
    }
  `,
  styles: [`
    .top { align-items: flex-start; gap: 12px; }
    .kpi { padding: 14px; display: flex; flex-direction: column; gap: 2px; }
    .kpi .k { font-size: 12.5px; color: var(--muted); font-weight: 600; }
    .kpi strong { font-size: 26px; line-height: 1.15; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
    .kpi .sm { font-size: 12px; color: var(--muted); }
    .filters { display: flex; flex-direction: column; gap: 10px; }
    .f-row { display: grid; grid-template-columns: 1fr; gap: 8px; }
    .table { display: flex; flex-direction: column; gap: 8px; }
    .t-head { display: none; }
    .t-row { text-align: left; font: inherit; color: inherit; cursor: pointer; padding: 14px; display: grid; grid-template-columns: 1fr auto; gap: 8px 12px; align-items: center; }
    .t-row:hover { border-color: var(--accent); }
    .c-name, .c-org { display: flex; flex-direction: column; line-height: 1.35; }
    .c-org { grid-column: 1; }
    .c-date, .c-part { font-size: 13px; color: var(--ink-2); grid-column: 1 / -1; display: flex; gap: 8px; }
    .lbl { color: var(--muted); min-width: 92px; }
    .pager { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .lnk { color: var(--accent-ink); font-weight: 600; }
    @media (min-width: 720px) {
      .f-row { grid-template-columns: repeat(3, 1fr); }
      .filters { flex-direction: row; align-items: center; } .filters > .input { max-width: 300px; } .f-row { flex: 1; }
    }
    @media (min-width: 960px) {
      .t-head, .t-row { display: grid; grid-template-columns: 1.6fr 1.3fr 1fr .8fr 1fr .9fr; gap: 12px; align-items: center; }
      .t-head { padding: 0 14px; font-size: 11.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); }
      .t-row { padding: 12px 14px; }
      .c-date, .c-part { grid-column: auto; } .lbl { display: none; }
    }
  `],
})
export class EmployeesComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  stats = signal<EmployeeStats | null>(null);
  structure = signal<Structure | null>(null);
  list = signal<EmployeeList | null>(null);
  loading = signal(true);

  search = signal('');
  sectorId = signal<number | null>(null);
  teamId = signal<number | null>(null);
  status = signal('');
  page = signal(1);
  private timer: ReturnType<typeof setTimeout> | null = null;

  form = signal<FormModel | null>(null);
  formError = signal<string | null>(null);
  saving = signal(false);

  pages = computed(() => Math.max(1, Math.ceil((this.list()?.total ?? 0) / (this.list()?.pageSize ?? 25))));
  teamsOfFilter = computed(() => this.structure()?.sectors.find(s => s.id === this.sectorId())?.teams ?? []);
  teamsOfForm = computed(() => this.structure()?.sectors.find(s => s.id === this.form()?.sectorId)?.teams ?? []);

  constructor() { void this.init(); }

  private async init() {
    try {
      const [st, sc] = await Promise.all([
        this.api.get<EmployeeStats>('/employees/stats?weeks=4'),
        this.api.get<Structure>('/sectors'),
      ]);
      this.stats.set(st); this.structure.set(sc);
    } catch (e) { this.toast.error(e instanceof Error ? e.message : 'Erro ao carregar.'); }
    await this.load();
  }

  statusLabel(s: EmployeeStatus) { return STATUS_LABEL[s]; }
  statusTag(s: EmployeeStatus) { return STATUS_TAG[s]; }

  lastSent(e: EmployeeItem): string {
    if (!e.lastCheckinAt) return 'Nunca';
    const d = new Date(e.lastCheckinAt);
    const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
    return days <= 0 ? 'Hoje' : days === 1 ? 'Ontem' : d.toLocaleDateString('pt-BR');
  }

  onSearch(v: string) {
    this.search.set(v);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.page.set(1); void this.load(); }, 300);
  }
  setSector(id: number | null) { this.sectorId.set(id); this.teamId.set(null); this.page.set(1); void this.load(); }
  setTeam(id: number | null) { this.teamId.set(id); this.page.set(1); void this.load(); }
  setStatus(s: string) { this.status.set(s); this.page.set(1); void this.load(); }
  go(p: number) { this.page.set(p); void this.load(); }

  async load() {
    this.loading.set(true);
    try {
      this.list.set(await this.api.get<EmployeeList>('/employees' + qs({
        search: this.search().trim(), sectorId: this.sectorId(), teamId: this.teamId(), status: this.status(), page: this.page(), pageSize: 25,
      })));
    } catch (e) { this.toast.error(e instanceof Error ? e.message : 'Erro ao listar.'); }
    finally { this.loading.set(false); }
  }

  openNew() { this.formError.set(null); this.form.set({ id: null, name: '', email: '', jobTitle: '', phone: '', sectorId: null, teamId: null, status: 'active' }); }
  openEdit(e: EmployeeItem) {
    this.formError.set(null);
    this.form.set({ id: e.id, name: e.name, email: e.email, jobTitle: e.jobTitle ?? '', phone: e.phone ?? '', sectorId: e.sectorId, teamId: e.teamId, status: e.status === 'inactive' ? 'inactive' : 'active' });
  }
  closeForm() { this.form.set(null); }
  formSector(id: number | null) { const f = this.form(); if (f) this.form.set({ ...f, sectorId: id, teamId: null }); }

  async save() {
    const f = this.form();
    if (!f) return;
    this.formError.set(null);
    if (!f.sectorId || !f.teamId) { this.formError.set('Selecione o setor e a equipe.'); return; }
    this.saving.set(true);
    try {
      if (f.id) {
        await this.api.put(`/employees/${f.id}`, { name: f.name, jobTitle: f.jobTitle, phone: f.phone || null, sectorId: f.sectorId, teamId: f.teamId, status: f.status });
        this.toast.success('Colaborador atualizado.');
      } else {
        await this.api.post('/employees', { name: f.name, email: f.email, jobTitle: f.jobTitle, phone: f.phone || undefined, sectorId: f.sectorId, teamId: f.teamId });
        this.toast.success('Colaborador cadastrado. Ele ativa a conta com este e-mail.');
      }
      this.form.set(null);
      this.stats.set(await this.api.get<EmployeeStats>('/employees/stats?weeks=4'));
      await this.load();
    } catch (e) { this.formError.set(e instanceof Error ? e.message : 'Não foi possível salvar.'); }
    finally { this.saving.set(false); }
  }
}

interface FormModel {
  id: number | null; name: string; email: string; jobTitle: string; phone: string;
  sectorId: number | null; teamId: number | null; status: 'active' | 'inactive';
}
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
