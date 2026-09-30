import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ChartConfiguration } from 'chart.js';
import { ApiService, qs } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ThemeService } from '../../core/theme.service';
import { ToastService } from '../../core/toast.service';
import { DashboardData, IndicatorStat, Level, LEVEL_LABEL } from '../../core/models';
import { ChartComponent } from '../../shared/chart.component';
import { InsightViewComponent } from '../../shared/insight-view.component';

const PERIODS = [
  { weeks: 1, label: '1 semana' },
  { weeks: 4, label: '4 semanas' },
  { weeks: 8, label: '8 semanas' },
  { weeks: 12, label: '12 semanas' },
];

@Component({
  selector: 'nx-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, NgTemplateOutlet, RouterLink, FormsModule, ChartComponent, InsightViewComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Olá, {{ firstName() }} 👋</h1>
        <p class="sub">Empresa: <strong>{{ companyName() }}</strong></p>
      </div>

      @if (error()) { <div class="notice notice-error">{{ error() }}</div> }

      <!-- Filtros -->
      <div class="filters">
        <div class="row-wrap" role="group" aria-label="Período">
          @for (p of periods; track p.weeks) {
            <button type="button" class="chip" [class.on]="weeks() === p.weeks" (click)="setWeeks(p.weeks)">{{ p.label }}</button>
          }
        </div>
        <div class="selects">
          <select class="input" aria-label="Setor" [ngModel]="sectorId()" (ngModelChange)="setSector($event)" name="fsector">
            <option [ngValue]="null">Empresa inteira</option>
            @for (s of data()?.sectors ?? []; track s.id) { <option [ngValue]="s.id">{{ s.name }}</option> }
          </select>
          @if (sectorId() !== null) {
            <select class="input" aria-label="Equipe" [ngModel]="teamId()" (ngModelChange)="setTeam($event)" name="fteam">
              <option [ngValue]="null">Todas as equipes</option>
              @for (t of data()?.teams ?? []; track t.id) { <option [ngValue]="t.id">{{ t.name }}</option> }
            </select>
          }
        </div>
      </div>

      @if (loading() && !data()) {
        <div class="grid grid-4">@for (i of [1,2,3,4]; track i) { <div class="skeleton" style="height: 92px"></div> }</div>
        <div class="skeleton" style="height: 240px"></div>
      } @else {
       @if (data(); as d) {
        <!-- Visão geral (números reais calculados no banco) -->
        <section class="grid grid-4">
          <div class="card kpi rise"><span class="k">Colaboradores</span><strong>{{ d.overview.total | number }}</strong><span class="s">{{ d.overview.active | number }} ativos · {{ d.overview.pending | number }} aguardando conta</span></div>
          <div class="card kpi rise"><span class="k">Participaram</span><strong>{{ d.overview.participated | number }}</strong><span class="s">nas últimas {{ d.period.weeks }} sem.</span></div>
          <div class="card kpi rise"><span class="k">Não participaram</span><strong>{{ d.overview.notParticipated | number }}</strong><span class="s">de {{ d.overview.registered | number }} na base</span></div>
          <div class="card kpi rise accent"><span class="k">Taxa de participação</span><strong>{{ d.overview.rate | number: '1.0-1' }}%</strong><span class="s">{{ d.overview.sectors }} setores · {{ d.overview.teams }} equipes</span></div>
        </section>

        <!-- Atenção atual -->
        <section class="card card-pad">
          <div class="row between wrap">
            <div>
              <span class="section-title">Atenção atual</span>
              <h2>{{ d.scope.label }}</h2>
            </div>
            @if (d.focus.insufficient) {
              <span class="tag tag-none">Dados insuficientes</span>
            } @else {
              @if (d.focus.attention; as a) {
                <span class="tag" [class]="'tag-' + a.level">{{ levelWord(a.level) }} · índice {{ a.index | number: '1.0-1' }}</span>
              }
            }
          </div>
          <p class="small muted note">Indicadores de atenção psicossocial do ambiente de trabalho (0–100; quanto maior, mais atenção). Não avaliam pessoas.</p>

          @if (d.focus.insufficient) {
            <div class="notice notice-warn">
              Dados insuficientes para gerar análise agregada: são necessários pelo menos {{ d.minGroupSize }} participantes no período
              (há {{ d.focus.respondents }}). Isso protege a identidade de quem respondeu.
            </div>
          } @else {
            <div class="inds">
              @for (i of sortedIndicators(); track i.key) {
                <div class="ind">
                  <div class="i-top"><span>{{ i.label }}</span><span class="i-val">{{ i.index | number: '1.0-0' }} <em [class]="'d-' + deltaTone(i)">{{ deltaText(i) }}</em></span></div>
                  <div class="i-bar"><span [class]="'f-' + i.level" [style.width.%]="i.index"></span></div>
                </div>
              }
            </div>
          }
        </section>

        <!-- Insight do NEXO (resposta real da IA, gravada no banco) -->
        <section class="card card-pad">
          <div class="row between wrap">
            <div><span class="section-title">Insight do NEXO</span><h2>Análise da IA</h2></div>
            <a routerLink="/app/insights" class="btn btn-accent btn-sm">{{ d.latestInsight ? 'Nova análise' : 'Solicitar análise' }}</a>
          </div>
          @if (d.latestInsight; as ins) {
            <div class="ins-wrap"><nx-insight-view [insight]="ins" /></div>
          } @else {
            <p class="sub ins-empty">Nenhuma análise gerada ainda. Solicite uma análise para receber, a partir dos dados agregados, o que mudou, o que investigar e o que pode ser feito.</p>
          }
        </section>

        <!-- Participação e atenção por setor -->
        <section class="card card-pad">
          <span class="section-title">Participação por setor</span>
          <div class="groups">
            @for (s of d.sectors; track s.id) {
              <ng-container *ngTemplateOutlet="row; context: { $implicit: s, kind: 'sector' }" />
            } @empty { <p class="sub">Nenhum setor cadastrado. <a routerLink="/app/estrutura" class="lnk">Criar setores e equipes</a></p> }
          </div>
        </section>

        @if (d.teams.length) {
          <section class="card card-pad">
            <span class="section-title">Equipes do setor</span>
            <div class="groups">
              @for (t of d.teams; track t.id) {
                <ng-container *ngTemplateOutlet="row; context: { $implicit: t, kind: 'team' }" />
              }
            </div>
          </section>
        }

        <!-- Histórico -->
        <section class="card card-pad">
          <span class="section-title">Histórico do índice de atenção</span>
          @if (hasHistory()) {
            <nx-chart [config]="chart()" [height]="200" />
          }
          <div class="weeks">
            @for (w of lastWeeks(); track w.week) {
              <div class="wk"><span class="small muted">{{ w.label }}</span>
                <strong>{{ w.suppressed ? '—' : (w.index | number: '1.0-0') }}</strong>
                @if (w.suppressed) { <span class="small muted">insuf.</span> }</div>
            }
          </div>
          <p class="small muted">Semanas com menos de {{ d.minGroupSize }} participantes não exibem valor (privacidade).</p>
        </section>

        <p class="small muted foot">Confiabilidade dos dados: <strong>{{ d.trust.label }}</strong> ({{ d.trust.score }}%). {{ d.trust.message }}</p>
       }
      }
    </div>

    <ng-template #row let-g let-kind="kind">
      <button class="grp" type="button" (click)="pickGroup(kind, g.id)">
        <div class="g-top">
          <strong>{{ g.name }}</strong>
          @if (g.insufficient) { <span class="tag tag-none">Dados insuficientes</span> }
          @else if (g.attention) { <span class="tag" [class]="'tag-' + g.attention.level">Atenção: {{ levelWord(g.attention.level) }}</span> }
        </div>
        <div class="g-bar"><span [style.width.%]="g.rate"></span></div>
        <div class="g-sub">{{ g.eligible }} colaboradores · {{ g.participated }} participaram · <strong>{{ g.rate | number: '1.0-1' }}%</strong></div>
        @if (g.topFactor) { <div class="g-sub">Principal fator: {{ g.topFactor }}</div> }
      </button>
    </ng-template>
  `,
  styles: [`
    .filters { display: flex; flex-direction: column; gap: 10px; }
    .selects { display: grid; grid-template-columns: 1fr; gap: 8px; }
    .row.wrap { flex-wrap: wrap; align-items: flex-start; }
    .kpi { padding: 14px; display: flex; flex-direction: column; gap: 2px; }
    .kpi .k { font-size: 12.5px; color: var(--muted); font-weight: 600; }
    .kpi strong { font-size: 28px; letter-spacing: -0.02em; line-height: 1.15; font-variant-numeric: tabular-nums; }
    .kpi .s { font-size: 12px; color: var(--muted); }
    .kpi.accent { background: var(--accent-soft); border-color: color-mix(in srgb, var(--accent) 30%, transparent); }
    .kpi.accent strong { color: var(--accent-ink); }
    .note { margin: 8px 0 12px; }
    .inds { display: flex; flex-direction: column; gap: 12px; }
    .i-top { display: flex; justify-content: space-between; gap: 10px; font-size: 13.5px; }
    .i-val { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .i-val em { font-style: normal; font-size: 12px; font-weight: 600; margin-left: 4px; }
    .d-up { color: var(--at-alta); } .d-down { color: var(--at-baixa); } .d-flat { color: var(--muted); }
    .i-bar { height: 8px; background: var(--ink-soft); border-radius: 999px; overflow: hidden; margin-top: 5px; }
    .i-bar span { display: block; height: 100%; border-radius: 999px; transition: width .5s var(--ease); }
    .f-baixa { background: var(--at-baixa); } .f-moderada { background: #E0A81A; } .f-alta { background: var(--at-alta); }
    .ins-wrap { margin-top: 14px; }
    .ins-empty { margin-top: 10px; }
    .groups { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
    .grp { text-align: left; font: inherit; color: inherit; cursor: pointer; padding: 12px 14px; border: 1px solid var(--line); background: var(--surface-2); border-radius: var(--r-md); display: flex; flex-direction: column; gap: 6px; min-height: var(--tap); }
    .grp:hover { border-color: var(--accent); }
    .g-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
    .g-bar { height: 6px; background: var(--ink-soft); border-radius: 999px; overflow: hidden; }
    .g-bar span { display: block; height: 100%; background: var(--grad-accent); border-radius: 999px; }
    .g-sub { font-size: 12.5px; color: var(--muted); }
    .weeks { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0 8px; }
    .wk { display: flex; flex-direction: column; align-items: center; padding: 8px 4px; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--r-md); }
    .wk strong { font-size: 20px; font-variant-numeric: tabular-nums; }
    .lnk { color: var(--accent-ink); font-weight: 600; }
    .foot { text-align: center; }
    @media (min-width: 720px) { .filters { flex-direction: row; align-items: center; justify-content: space-between; } .selects { grid-template-columns: 220px 220px; } }
  `],
})
export class OverviewComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private theme = inject(ThemeService);
  readonly auth = inject(AuthService);
  readonly periods = PERIODS;

  data = signal<DashboardData | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  weeks = signal(4);
  sectorId = signal<number | null>(null);
  teamId = signal<number | null>(null);

  firstName = computed(() => (this.auth.user()?.name ?? '').split(' ')[0]);
  companyName = computed(() => this.data()?.company.name ?? this.auth.user()?.company.name ?? '');
  sortedIndicators = computed<IndicatorStat[]>(() => [...(this.data()?.focus.indicators ?? [])].sort((a, b) => b.index - a.index));
  lastWeeks = computed(() => (this.data()?.history ?? []).slice(-4));
  hasHistory = computed(() => (this.data()?.history ?? []).some(h => h.index !== null));

  chart = computed<ChartConfiguration>(() => {
    const h = this.data()?.history ?? [];
    const dark = this.theme.mode() === 'dark';
    const color = dark ? '#8B8BF0' : '#5B5BD6';
    return {
      type: 'line',
      data: {
        labels: h.map(p => p.label),
        datasets: [{
          label: 'Índice de atenção',
          data: h.map(p => p.index),
          borderColor: color,
          backgroundColor: dark ? 'rgba(139,139,240,.14)' : 'rgba(91,91,214,.10)',
          fill: true, tension: 0.35, pointRadius: 3, pointHoverRadius: 6, borderWidth: 2.2, spanGaps: false,
        }],
      },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: { displayColors: false, callbacks: { label: c => (c.raw === null || c.raw === undefined ? 'Dados insuficientes' : ` Índice ${Number(c.raw).toFixed(1)}`) } },
        },
        scales: {
          y: { min: 0, max: 100, ticks: { stepSize: 25, font: { size: 11 } } },
          x: { ticks: { font: { size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { display: false } },
        },
      },
    };
  });

  constructor() { void this.load(); }

  levelWord(l: Level): string { return LEVEL_LABEL[l]; }

  deltaText(i: IndicatorStat): string {
    if (i.delta === null) return '';
    if (Math.abs(i.delta) < 1) return 'estável';
    return (i.delta > 0 ? '+' : '−') + Math.abs(i.delta).toFixed(1).replace('.', ',');
  }
  /** Para todos os indicadores o índice sobe quando a situação piora (já convertido no backend). */
  deltaTone(i: IndicatorStat): string {
    if (i.delta === null || Math.abs(i.delta) < 1) return 'flat';
    return i.delta > 0 ? 'up' : 'down';
  }

  setWeeks(w: number) { this.weeks.set(w); void this.load(); }
  setSector(id: number | null) { this.sectorId.set(id); this.teamId.set(null); void this.load(); }
  setTeam(id: number | null) { this.teamId.set(id); void this.load(); }
  pickGroup(kind: 'sector' | 'team', id: number) {
    if (kind === 'sector') this.setSector(id); else this.setTeam(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.data.set(await this.api.get<DashboardData>('/dashboard' + qs({ weeks: this.weeks(), sectorId: this.sectorId(), teamId: this.teamId() })));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao carregar o painel.';
      this.error.set(msg);
      this.toast.error(msg);
    } finally {
      this.loading.set(false);
    }
  }
}
