import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Insight } from '../core/models';

/** "Insight do NEXO": as 5 perguntas do gestor, preenchidas com a resposta REAL da IA (nada é texto fixo). */
@Component({
  selector: 'nx-insight-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  template: `
    @if (insight(); as i) {
      <div class="iv">
        <div class="meta">
          <span class="tag" [class]="'tag-' + tone()">Nível de atenção: {{ i.result.attentionLevel }}</span>
          <span class="small muted">{{ i.scope.label }} · {{ i.weekFrom }} a {{ i.weekTo }} · {{ i.participants }} participantes</span>
        </div>

        <div class="signal">
          <span class="k">Principal sinal</span>
          <p>{{ i.result.mainSignal }}</p>
        </div>

        <div class="block"><h3>O que mudou?</h3><p>{{ i.result.whatChanged }}</p></div>
        <div class="block"><h3>Por que merece atenção?</h3><p>{{ i.result.whyItMatters }}</p></div>
        <div class="block">
          <h3>O que investigar?</h3>
          <p>{{ i.result.whatToInvestigate }}</p>
          <ul>@for (f of i.result.factorsToInvestigate; track f) { <li>{{ f }}</li> }</ul>
        </div>
        <div class="block">
          <h3>O que pode ser feito?</h3>
          <ul>@for (a of i.result.suggestedActions; track a) { <li>{{ a }}</li> }</ul>
        </div>
        <div class="block"><h3>Como acompanhar o resultado?</h3><p>{{ i.result.howToFollow }}</p></div>

        <div class="reco"><span class="k">Recomendação</span><p>“{{ i.result.recommendation }}”</p></div>

        <p class="small muted foot">
          {{ i.result.limitations }}<br />
          Análise gerada por IA ({{ i.model }}) em {{ i.createdAt | date: 'dd/MM/yyyy HH:mm' }}, a partir de dados agregados e anônimos.
          Indica fatores do ambiente de trabalho para investigar; não é diagnóstico e não avalia pessoas.
        </p>
      </div>
    }
  `,
  styles: [`
    .iv { display: flex; flex-direction: column; gap: 14px; }
    .meta { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
    .k { font-size: 11.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
    .signal { padding: 12px 14px; border-radius: var(--r-md); background: var(--ink-soft); }
    .signal p { margin-top: 2px; font-weight: 600; }
    .block h3 { margin-bottom: 4px; }
    .block p { color: var(--ink-2); }
    ul { margin: 6px 0 0; padding-left: 20px; color: var(--ink-2); display: flex; flex-direction: column; gap: 4px; }
    .reco { padding: 14px; border-radius: var(--r-md); background: var(--accent-soft); color: var(--accent-ink); border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); }
    .reco .k { color: inherit; }
    .reco p { margin-top: 4px; font-weight: 600; }
    .foot { line-height: 1.5; }
  `],
})
export class InsightViewComponent {
  insight = input.required<Insight>();
  tone = computed(() => {
    const l = this.insight().result.attentionLevel;
    return l === 'elevado' ? 'alta' : l === 'moderado' ? 'moderada' : 'baixa';
  });
}
