import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { CompanyInfo, Structure } from '../../core/models';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'nx-structure',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DecimalPipe],
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Setores e equipes</h1>
        <p class="sub">Empresa → Setor → Equipe → Colaborador. É essa estrutura que organiza os indicadores.</p>
      </div>

      @if (company(); as c) {
        <div class="card card-pad code">
          <div>
            <span class="section-title">Código da empresa</span>
            <div class="code-val">{{ c.code }}</div>
            <p class="small muted">Compartilhe com os colaboradores: eles digitam este código (ou o nome da empresa) na tela de entrada.</p>
          </div>
          <label class="switch">
            <input type="checkbox" [ngModel]="c.selfSignup" (ngModelChange)="toggleSignup($event)" name="ss" />
            <span>Permitir que colaboradores criem a própria conta. Desligado: apenas e-mails pré-cadastrados.</span>
          </label>
        </div>
      }

      <form class="card card-pad add" (ngSubmit)="addSector()">
        <label class="field"><span>Novo setor</span>
          <input class="input" name="sector" [(ngModel)]="newSector" placeholder="Ex.: Emergência, UTI, Administrativo" maxlength="120" /></label>
        <button class="btn btn-primary" type="submit" [disabled]="!newSector.trim() || busy()">Criar setor</button>
      </form>

      @if (loading()) {
        <div class="skeleton" style="height: 180px"></div>
      } @else {
        @for (s of data()?.sectors ?? []; track s.id) {
          <section class="card card-pad sector">
            <div class="s-head">
              @if (editing() === 's' + s.id) {
                <input class="input" [(ngModel)]="editName" name="en{{ s.id }}" maxlength="120" (keydown.enter)="rename('sector', s.id)" />
                <button class="btn btn-primary btn-sm" type="button" (click)="rename('sector', s.id)">Salvar</button>
                <button class="btn btn-ghost btn-sm" type="button" (click)="editing.set(null)">Cancelar</button>
              } @else {
                <div class="s-title">
                  <h2>{{ s.name }}</h2>
                  <span class="small muted">{{ s.eligible }} colaboradores · {{ s.participated }} participaram ({{ s.rate | number: '1.0-1' }}%)</span>
                </div>
                <div class="row-wrap">
                  <button class="btn btn-ghost btn-sm" type="button" (click)="startEdit('s' + s.id, s.name)">Renomear</button>
                  <button class="btn btn-danger btn-sm" type="button" (click)="remove('sector', s.id, s.name)">Remover</button>
                </div>
              }
            </div>

            <div class="teams">
              @for (t of s.teams; track t.id) {
                <div class="team">
                  @if (editing() === 't' + t.id) {
                    <input class="input" [(ngModel)]="editName" name="et{{ t.id }}" maxlength="120" (keydown.enter)="rename('team', t.id)" />
                    <button class="btn btn-primary btn-sm" type="button" (click)="rename('team', t.id)">Salvar</button>
                    <button class="btn btn-ghost btn-sm" type="button" (click)="editing.set(null)">×</button>
                  } @else {
                    <div class="t-info"><strong>{{ t.name }}</strong><span class="small muted">{{ t.eligible }} colaboradores · {{ t.participated }} participaram ({{ t.rate | number: '1.0-1' }}%)</span></div>
                    <div class="row-wrap">
                      <button class="btn btn-ghost btn-sm" type="button" (click)="startEdit('t' + t.id, t.name)">Renomear</button>
                      <button class="btn btn-danger btn-sm" type="button" (click)="remove('team', t.id, t.name)">Remover</button>
                    </div>
                  }
                </div>
              } @empty { <p class="small muted">Nenhuma equipe neste setor.</p> }
            </div>

            <form class="add-team" (ngSubmit)="addTeam(s.id)">
              <input class="input" [ngModel]="teamDraft()[s.id]" (ngModelChange)="setDraft(s.id, $event)" name="nt{{ s.id }}" placeholder="Nova equipe neste setor" maxlength="120" />
              <button class="btn btn-ghost" type="submit" [disabled]="!teamDraft()[s.id]?.trim() || busy()">Adicionar equipe</button>
            </form>
          </section>
        } @empty {
          <div class="card card-pad"><p class="sub">Comece criando o primeiro setor acima.</p></div>
        }
      }
    </div>
  `,
  styles: [`
    .code { display: flex; flex-direction: column; gap: 14px; }
    .code-val { font-size: 24px; font-weight: 800; letter-spacing: .06em; margin: 4px 0; font-variant-numeric: tabular-nums; user-select: all; }
    .switch { display: flex; gap: 10px; align-items: flex-start; font-size: 13.5px; color: var(--ink-2); cursor: pointer; }
    .switch input { width: 22px; height: 22px; margin-top: 1px; accent-color: var(--accent); flex: none; }
    .add { display: flex; flex-direction: column; gap: 12px; }
    .sector { display: flex; flex-direction: column; gap: 14px; }
    .s-head { display: flex; flex-direction: column; gap: 10px; }
    .s-title { display: flex; flex-direction: column; gap: 2px; }
    .teams { display: flex; flex-direction: column; gap: 8px; }
    .team { display: flex; flex-direction: column; gap: 8px; padding: 12px; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--r-md); }
    .t-info { display: flex; flex-direction: column; }
    .add-team { display: flex; flex-direction: column; gap: 8px; }
    @media (min-width: 720px) {
      .add { flex-direction: row; align-items: flex-end; } .add .field { flex: 1; }
      .s-head { flex-direction: row; align-items: center; justify-content: space-between; }
      .team { flex-direction: row; align-items: center; justify-content: space-between; }
      .add-team { flex-direction: row; }
    }
  `],
})
export class StructureComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  data = signal<Structure | null>(null);
  company = signal<CompanyInfo | null>(null);
  loading = signal(true);
  busy = signal(false);
  editing = signal<string | null>(null);
  editName = '';
  newSector = '';
  teamDraft = signal<Record<number, string | undefined>>({});

  constructor() { void this.load(); }

  private async load() {
    try {
      const [s, c] = await Promise.all([this.api.get<Structure>('/sectors?weeks=4'), this.api.get<{ company: CompanyInfo }>('/company')]);
      this.data.set(s); this.company.set(c.company);
    } catch (e) { this.toast.error(msg(e)); }
    finally { this.loading.set(false); }
  }

  setDraft(id: number, v: string) { this.teamDraft.update(d => ({ ...d, [id]: v })); }
  startEdit(key: string, name: string) { this.editing.set(key); this.editName = name; }

  private async act(fn: () => Promise<unknown>, ok: string) {
    this.busy.set(true);
    try { await fn(); this.toast.success(ok); this.editing.set(null); this.data.set(await this.api.get<Structure>('/sectors?weeks=4')); }
    catch (e) { this.toast.error(msg(e)); }
    finally { this.busy.set(false); }
  }

  async addSector() {
    const name = this.newSector.trim();
    if (!name) return;
    await this.act(() => this.api.post('/sectors', { name }), 'Setor criado.');
    this.newSector = '';
  }

  async addTeam(sectorId: number) {
    const name = (this.teamDraft()[sectorId] ?? '').trim();
    if (!name) return;
    await this.act(() => this.api.post('/teams', { name, sectorId }), 'Equipe criada.');
    this.setDraft(sectorId, '');
  }

  rename(kind: 'sector' | 'team', id: number) {
    return this.act(() => this.api.put(`/${kind === 'sector' ? 'sectors' : 'teams'}/${id}`, { name: this.editName }), 'Nome atualizado.');
  }

  remove(kind: 'sector' | 'team', id: number, name: string) {
    if (!confirm(`Remover "${name}"? Só é possível se não houver colaboradores nem histórico vinculados.`)) return Promise.resolve();
    return this.act(() => this.api.delete(`/${kind === 'sector' ? 'sectors' : 'teams'}/${id}`), 'Removido.');
  }

  async toggleSignup(v: boolean) {
    try {
      const r = await this.api.put<{ company: CompanyInfo }>('/company', { selfSignup: v });
      this.company.set(r.company);
      this.toast.success(v ? 'Auto-cadastro ativado.' : 'Auto-cadastro desativado.');
    } catch (e) { this.toast.error(msg(e)); }
  }
}
const msg = (e: unknown) => (e instanceof Error ? e.message : 'Não foi possível concluir.');
