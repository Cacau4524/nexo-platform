import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { Insight, Structure } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { InsightViewComponent } from '../../shared/insight-view.component';

@Component({
  selector: 'nx-insights',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DatePipe, InsightViewComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Insights do NEXO</h1>
        <p class="sub">A IA analisa apenas dados agregados e anônimos e sugere o que investigar. Não faz diagnósticos nem avalia pessoas.</p>
      </div>

      <form class="card card-pad form" (ngSubmit)="analyze()">
        <span class="section-title">Nova análise</span>
        <label class="field"><span>Escopo</span>
          <select class="input" name="sector" [ngModel]="sectorId()" (ngModelChange)="pickSector($event)">
            <option [ngValue]="null">Empresa inteira</option>
            @for (s of structure()?.sectors ?? []; track s.id) { <option [ngValue]="s.id">Setor: {{ s.name }}</option> }
          </select></label>
        @if (sectorId() !== null) {
          <label class="field"><span>Equipe</span>
            <select class="input" name="team" [(ngModel)]="teamId">
              <option [ngValue]="null">Todo o setor</option>
              @for (t of teams(); track t.id) { <option [ngValue]="t.id">{{ t.name }}</option> }
            </select></label>
        }
        <label class="field"><span>Período</span>
          <select class="input" name="weeks" [(ngModel)]="weeks">
            <option [ngValue]="4">Últimas 4 semanas</option><option [ngValue]="8">Últimas 8 semanas</option><option [ngValue]="12">Últimas 12 semanas</option>
          </select></label>
        @if (error()) { <div class="notice" [class.notice-warn]="warn()" [class.notice-error]="!warn()" role="alert">{{ error() }}</div> }
        <button class="btn btn-accent btn-block" type="submit" [disabled]="loading()">{{ loading() ? 'Analisando com IA… (pode levar alguns segundos)' : 'Solicitar análise da IA' }}</button>
      </form>

      @if (current(); as c) {
        <section class="card card-pad rise"><nx-insight-view [insight]="c" /></section>
      }

      @if (past().length) {
        <span class="section-title">Análises anteriores</span>
        @for (i of past(); track i.id) {
          <button type="button" class="card card-pad past" (click)="current.set(i); scrollTop()">
            <div><strong>{{ i.scope.label }}</strong><div class="small muted">{{ i.createdAt | date: 'dd/MM/yyyy HH:mm' }} · {{ i.weeks }} semanas</div></div>
            <span class="tag" [class]="'tag-' + tone(i)">{{ i.attentionLevel }}</span>
          </button>
        }
      }
    </div>
  `,
  styles: [`
    .past { display: flex; align-items: center; justify-content: space-between; gap: 10px; text-align: left; font: inherit; color: inherit; cursor: pointer; width: 100%; }
    .past:hover { border-color: var(--accent); }
    @media (min-width: 720px) { form.card { max-width: 560px; } }
  `],
})
export class InsightsComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  structure = signal<Structure | null>(null);
  sectorId = signal<number | null>(null);
  teamId: number | null = null;
  weeks = 4;
  loading = signal(false);
  error = signal<string | null>(null);
  warn = signal(false);
  current = signal<Insight | null>(null);
  past = signal<Insight[]>([]);

  constructor() { void this.init(); }

  teams() { return this.structure()?.sectors.find(s => s.id === this.sectorId())?.teams ?? []; }
  tone(i: Insight) { return i.attentionLevel === 'elevado' ? 'alta' : i.attentionLevel === 'moderado' ? 'moderada' : 'baixa'; }
  pickSector(id: number | null) { this.sectorId.set(id); this.teamId = null; }
  scrollTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

  private async init() {
    try {
      const [s, l] = await Promise.all([this.api.get<Structure>('/sectors?weeks=4'), this.api.get<{ insights: Insight[] }>('/ai/insights?limit=10')]);
      this.structure.set(s);
      this.past.set(l.insights);
      this.current.set(l.insights[0] ?? null);
    } catch (e) { this.toast.error(e instanceof Error ? e.message : 'Erro ao carregar.'); }
  }

  async analyze() {
    this.error.set(null);
    this.loading.set(true);
    try {
      const r = await this.api.post<{ insight: Insight }>('/ai/analyze', { sectorId: this.sectorId(), teamId: this.sectorId() ? this.teamId : null, weeks: this.weeks });
      this.current.set(r.insight);
      this.past.update(p => [r.insight, ...p].slice(0, 10));
      this.toast.success('Análise gerada.');
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Não foi possível gerar a análise.';
      this.warn.set(/insuficiente|configurada/i.test(m));
      this.error.set(m);
    } finally { this.loading.set(false); }
  }
}
