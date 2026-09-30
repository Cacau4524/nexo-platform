import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { INDICATOR_LABELS, Intervention, InterventionStatus, Structure } from '../../core/models';
import { ToastService } from '../../core/toast.service';

const STATUS: Record<InterventionStatus, { label: string; tag: string }> = {
  planejada: { label: 'Planejada', tag: 'none' }, em_andamento: { label: 'Em andamento', tag: 'moderada' }, concluida: { label: 'Concluída', tag: 'baixa' },
};

@Component({
  selector: 'nx-interventions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DecimalPipe],
  template: `
    <div class="page">
      <div class="row between top">
        <div class="page-head"><h1>Acompanhamento</h1><p class="sub">Registre ações preventivas e acompanhe o efeito nos indicadores.</p></div>
        <button class="btn btn-accent" type="button" (click)="open.set(true)">+ Registrar</button>
      </div>

      @if (loading()) { <div class="skeleton" style="height: 160px"></div> }
      @for (iv of items(); track iv.id) {
        <div class="card card-pad iv">
          <div class="row-wrap">
            <span class="tag" [class]="'tag-' + st(iv.status).tag">{{ st(iv.status).label }}</span>
            <span class="tag tag-none">{{ iv.indicatorLabel }}</span>
            <span class="small muted">{{ iv.scopeLabel }}</span>
          </div>
          <p><strong>Problema:</strong> {{ iv.problem }}</p>
          <p><strong>Ação:</strong> {{ iv.action }}</p>
          <p class="small muted">Responsável: {{ iv.owner }} · Prazo: {{ br(iv.dueDate) }}</p>
          @if (iv.result; as r) {
            <div class="result">
              <span class="section-title">Efeito observado no índice de atenção</span>
              <div class="r-vals"><span>{{ r.before | number: '1.0-1' }}</span> → <span>{{ r.after | number: '1.0-1' }}</span>
                <strong [class.good]="r.variationPct < 0">{{ r.variationPct > 0 ? '+' : '' }}{{ r.variationPct | number: '1.0-1' }}%</strong></div>
              <p class="small muted">Correlação não implica causa: interprete com cautela.</p>
            </div>
          }
          @if (iv.status !== 'concluida') {
            <div class="row-wrap">
              @if (iv.status === 'planejada') { <button class="btn btn-ghost btn-sm" type="button" (click)="setStatus(iv, 'em_andamento')">Iniciar</button> }
              <button class="btn btn-primary btn-sm" type="button" (click)="setStatus(iv, 'concluida')">Concluir e medir efeito</button>
            </div>
          }
        </div>
      } @empty {
        @if (!loading()) { <div class="card card-pad"><p class="sub">Nenhuma ação registrada. Use as recomendações da IA em “Insights” como ponto de partida.</p></div> }
      }
    </div>

    @if (open()) {
      <div class="scrim" (click)="open.set(false)">
        <div class="sheet" role="dialog" aria-label="Registrar ação" (click)="$event.stopPropagation()">
          <h2 style="margin-bottom: 12px">Registrar ação preventiva</h2>
          <form class="form" (ngSubmit)="create()">
            <label class="field"><span>Escopo</span>
              <select class="input" name="sc" [ngModel]="sectorId()" (ngModelChange)="sectorId.set($event); teamId = null">
                <option [ngValue]="null">Empresa inteira</option>
                @for (s of structure()?.sectors ?? []; track s.id) { <option [ngValue]="s.id">{{ s.name }}</option> }
              </select></label>
            @if (sectorId() !== null) {
              <label class="field"><span>Equipe</span>
                <select class="input" name="tm" [(ngModel)]="teamId"><option [ngValue]="null">Todo o setor</option>
                  @for (t of teams(); track t.id) { <option [ngValue]="t.id">{{ t.name }}</option> }</select></label>
            }
            <label class="field"><span>Fator do ambiente</span>
              <select class="input" name="ind" [(ngModel)]="indicator">
                @for (k of indicatorKeys; track k) { <option [value]="k">{{ labels[k] }}</option> }
              </select></label>
            <label class="field"><span>Problema identificado</span><textarea class="input" name="pr" [(ngModel)]="problem" maxlength="500" required></textarea></label>
            <label class="field"><span>Ação</span><textarea class="input" name="ac" [(ngModel)]="action" maxlength="500" required></textarea></label>
            <label class="field"><span>Responsável</span><input class="input" name="ow" [(ngModel)]="owner" maxlength="120" /></label>
            <label class="field"><span>Prazo</span><input class="input" type="date" name="du" [(ngModel)]="dueDate" /></label>
            @if (error()) { <div class="notice notice-error">{{ error() }}</div> }
            <div class="row-wrap"><button class="btn btn-ghost" type="button" (click)="open.set(false)">Cancelar</button>
              <button class="btn btn-primary" type="submit" [disabled]="saving()">Salvar</button></div>
          </form>
        </div>
      </div>
    }
  `,
  styles: [`
    .top { align-items: flex-start; gap: 12px; }
    .iv { display: flex; flex-direction: column; gap: 8px; }
    .result { padding: 12px; background: var(--ink-soft); border-radius: var(--r-md); display: flex; flex-direction: column; gap: 4px; }
    .r-vals { display: flex; align-items: center; gap: 10px; font-size: 18px; font-variant-numeric: tabular-nums; }
    .good { color: var(--at-baixa); }
  `],
})
export class InterventionsComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  readonly labels = INDICATOR_LABELS;
  readonly indicatorKeys = Object.keys(INDICATOR_LABELS);

  items = signal<Intervention[]>([]);
  structure = signal<Structure | null>(null);
  loading = signal(true);
  open = signal(false);
  saving = signal(false);
  error = signal<string | null>(null);

  sectorId = signal<number | null>(null);
  teamId: number | null = null;
  indicator = 'carga';
  problem = '';
  action = '';
  owner = '';
  dueDate = '';

  constructor() { void this.load(); }

  st(s: InterventionStatus) { return STATUS[s]; }
  br(d: string) { return d.split('-').reverse().join('/'); }
  teams() { return this.structure()?.sectors.find(s => s.id === this.sectorId())?.teams ?? []; }

  private async load() {
    try {
      const [i, s] = await Promise.all([this.api.get<{ interventions: Intervention[] }>('/interventions'), this.api.get<Structure>('/sectors?weeks=4')]);
      this.items.set(i.interventions); this.structure.set(s);
    } catch (e) { this.toast.error(e instanceof Error ? e.message : 'Erro ao carregar.'); }
    finally { this.loading.set(false); }
  }

  async create() {
    this.error.set(null); this.saving.set(true);
    try {
      await this.api.post('/interventions', {
        sectorId: this.sectorId(), teamId: this.sectorId() ? this.teamId : null, indicator: this.indicator,
        problem: this.problem, action: this.action, owner: this.owner || undefined, dueDate: this.dueDate || undefined,
      });
      this.open.set(false); this.problem = ''; this.action = ''; this.owner = ''; this.dueDate = '';
      this.toast.success('Ação registrada.');
      this.items.set((await this.api.get<{ interventions: Intervention[] }>('/interventions')).interventions);
    } catch (e) { this.error.set(e instanceof Error ? e.message : 'Não foi possível salvar.'); }
    finally { this.saving.set(false); }
  }

  async setStatus(iv: Intervention, status: InterventionStatus) {
    try {
      const r = await this.api.put<{ result: unknown }>(`/interventions/${iv.id}`, { status });
      this.toast.success(status === 'concluida' ? (r.result ? 'Concluída. Efeito medido.' : 'Concluída. Dados insuficientes para medir o efeito.') : 'Status atualizado.');
      this.items.set((await this.api.get<{ interventions: Intervention[] }>('/interventions')).interventions);
    } catch (e) { this.toast.error(e instanceof Error ? e.message : 'Falha ao atualizar.'); }
  }
}
