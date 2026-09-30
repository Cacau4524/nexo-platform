import type { Ctx } from './context';
import { dashboard } from './dashboard.service';
import { list as listInterventions } from './intervention.service';
import { textToPdf } from '../utils/pdf';
import { audit } from './context';

export async function buildReport(ctx: Ctx) {
  const d = await dashboard(ctx, { weeks: 4 });
  const ivs = await listInterventions(ctx);
  const inds = d.focus.indicators;
  const period = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return {
    title: 'Relatório executivo',
    company: d.company.name,
    period: period.charAt(0).toUpperCase() + period.slice(1),
    week: d.period.to,
    minGroupSize: d.minGroupSize,
    insufficient: d.focus.insufficient,
    summary: {
      attentionIndex: d.focus.attention?.index ?? null,
      attentionLevel: d.focus.attention?.level ?? null,
      participation: d.overview.rate,
      registered: d.overview.registered,
      participated: d.overview.participated,
      attentionFactors: inds.filter(i => i.level !== 'baixa').length,
      activeInterventions: d.activeInterventions,
    },
    movements: [...inds].filter(i => i.delta !== null)
      .sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!))
      .map(i => ({ key: i.key, text: `${i.label}: índice ${i.index} (${i.delta! > 0 ? '+' : ''}${i.delta} pts vs. período anterior)`, delta: i.delta })),
    // Recomendações vêm da última análise REAL de IA (nenhum texto pré-programado).
    aiInsight: d.latestInsight ? {
      createdAt: d.latestInsight.createdAt, scope: d.latestInsight.scope.label,
      recommendation: d.latestInsight.result.recommendation, actions: d.latestInsight.result.suggestedActions,
    } : null,
    trust: d.trust,
    interventions: ivs.map(i => ({ scope: i.scopeLabel, indicator: i.indicatorLabel, action: i.action, owner: i.owner, dueDate: i.dueDate.split('-').reverse().join('/'), status: i.status })),
  };
}

export async function exportReportPdf(ctx: Ctx) {
  const r = await buildReport(ctx);
  const lines: string[] = [
    `NEXO - Relatorio executivo - ${r.company}`,
    `Periodo: ${r.period} (semana ${r.week})`,
    '',
    'RESUMO',
    `Indice de atencao psicossocial do ambiente: ${r.summary.attentionIndex ?? 'dados insuficientes'}`,
    `Participacao: ${r.summary.participated} de ${r.summary.registered} colaboradores (${r.summary.participation}%)`,
    `Fatores em atencao: ${r.summary.attentionFactors}`,
    `Intervencoes ativas: ${r.summary.activeInterventions}`,
    `Confiabilidade dos dados: ${r.trust.score}% (${r.trust.label})`,
    '',
    'PRINCIPAIS MOVIMENTOS',
    ...(r.movements.length ? r.movements.slice(0, 6).map((m, i) => `${i + 1}. ${m.text}`) : ['Sem dados suficientes para comparar periodos.']),
    '',
    'ANALISE DA IA',
    ...(r.aiInsight ? [`Escopo: ${r.aiInsight.scope}`, `Recomendacao: ${r.aiInsight.recommendation}`, ...r.aiInsight.actions.map(a => `- ${a}`)] : ['Nenhuma analise de IA gerada ainda.']),
    '',
    'INTERVENCOES',
    ...(r.interventions.length ? r.interventions.map(i => `- [${i.status}] ${i.indicator} - ${i.scope}: ${i.action} (resp.: ${i.owner}, prazo: ${i.dueDate})`) : ['Nenhuma intervencao registrada.']),
    '',
    'PRIVACIDADE',
    `Somente dados agregados de grupos com pelo menos ${r.minGroupSize} participantes. Nenhuma resposta individual`,
    'e exibida. O NEXO nao diagnostica pessoas e nao classifica colaboradores.',
  ];
  await audit(ctx.companyId, ctx.userId, 'report_exported', r.period);
  return textToPdf(lines);
}
