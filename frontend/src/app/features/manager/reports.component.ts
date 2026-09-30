import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ApiService } from '../../core/api.service';
import { ReportData } from '../../core/models';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'nx-reports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  template: `
    <div class="page">
      <div class="row between top">
        <div class="page-head"><h1>Relatório executivo</h1><p class="sub">Resumo com dados reais da sua empresa.</p></div>
        <button class="btn btn-primary" type="button" (click)="download()" [disabled]="busy() || !r()">{{ busy() ? 'Gerando…' : 'Baixar PDF' }}</button>
      </div>
      @if (r(); as d) {
        <div class="card card-pad">
          <span class="section-title">{{ d.company }} · {{ d.period }} · {{ d.week }}</span>
          <div class="grid grid-2 kp">
            <div><span class="k">Índice de atenção</span><strong>{{ d.summary.attentionIndex === null ? '—' : (d.summary.attentionIndex | number: '1.0-1') }}</strong></div>
            <div><span class="k">Participação</span><strong>{{ d.summary.participation | number: '1.0-1' }}%</strong></div>
            <div><span class="k">Participaram</span><strong>{{ d.summary.participated }} / {{ d.summary.registered }}</strong></div>
            <div><span class="k">Ações ativas</span><strong>{{ d.summary.activeInterventions }}</strong></div>
          </div>
          @if (d.insufficient) { <div class="notice notice-warn">Dados insuficientes (mínimo de {{ d.minGroupSize }} participantes).</div> }
        </div>
        <div class="card card-pad">
          <span class="section-title">Principais movimentos</span>
          <ul>@for (m of d.movements.slice(0, 6); track m.key) { <li>{{ m.text }}</li> } @empty { <li class="muted">Sem dados suficientes para comparar períodos.</li> }</ul>
        </div>
        <div class="card card-pad">
          <span class="section-title">Recomendação da IA</span>
          @if (d.aiInsight; as a) {
            <p class="reco">“{{ a.recommendation }}”</p>
            <ul>@for (x of a.actions; track x) { <li>{{ x }}</li> }</ul>
            <p class="small muted">Escopo: {{ a.scope }}</p>
          } @else { <p class="sub">Nenhuma análise de IA gerada ainda. Gere uma em “Insights”.</p> }
        </div>
        <p class="small muted">Confiabilidade dos dados: {{ d.trust.label }} ({{ d.trust.score }}%). Somente dados agregados; nenhuma resposta individual é exibida.</p>
      } @else { <div class="skeleton" style="height: 220px"></div> }
    </div>
  `,
  styles: [`
    .top { align-items: flex-start; gap: 12px; }
    .kp { margin-top: 12px; }
    .k { display: block; font-size: 12.5px; color: var(--muted); }
    .kp strong { font-size: 22px; font-variant-numeric: tabular-nums; }
    ul { margin: 8px 0 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; color: var(--ink-2); }
    .reco { margin-top: 8px; font-weight: 600; }
  `],
})
export class ReportsComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  r = signal<ReportData | null>(null);
  busy = signal(false);

  constructor() { this.api.get<ReportData>('/reports').then(d => this.r.set(d)).catch(e => this.toast.error(e instanceof Error ? e.message : 'Erro ao carregar.')); }

  async download() {
    this.busy.set(true);
    try {
      const blob = await this.api.blob('POST', '/reports/export');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'nexo-relatorio-executivo.pdf'; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { this.toast.error(e instanceof Error ? e.message : 'Falha ao gerar o PDF.'); }
    finally { this.busy.set(false); }
  }
}
