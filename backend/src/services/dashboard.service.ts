import { getDb, toIso } from '../database/db';
import type { Ctx } from './context';
import { childSummaries, history, parseWeeks, participation, resolveScope, scopeSummary, trust } from './analytics.service';
import type { ScopeSummary } from './analytics.service';
import { employeeStats, getCompany } from './org.service';
import { latestInsight } from './ai.service';
import { env } from '../config/env';
import { optId } from '../utils/validate';
import { weekKeys } from '../utils/week';

const topFactor = (s: ScopeSummary) => {
  const worst = [...s.indicators].filter(i => i.level !== 'baixa').sort((a, b) => b.index - a.index)[0];
  return worst?.label ?? null;
};
const brief = (s: ScopeSummary) => ({
  insufficient: s.insufficient, respondents: s.respondents,
  attention: s.attention, previousIndex: s.previousAttentionIndex, topFactor: s.insufficient ? null : topFactor(s),
});

export async function dashboard(ctx: Ctx, q: Record<string, unknown>) {
  const db = getDb();
  const weeks = parseWeeks(q.weeks);
  const scope = await resolveScope(ctx.companyId, optId(q.sectorId, 'setor'), optId(q.teamId, 'equipe'));

  const [company, stats, part, focus, hist, latest, sectorRows, teamRows, ivCount] = await Promise.all([
    getCompany(ctx),
    employeeStats(ctx, weeks),
    participation(ctx.companyId, weeks),
    scopeSummary(ctx.companyId, weeks, scope),
    history(ctx.companyId, Math.max(8, weeks), scope),
    latestInsight(ctx.companyId),
    db.query<any>('SELECT id, name FROM sectors WHERE company_id = ? ORDER BY name', [ctx.companyId]),
    db.query<any>('SELECT id, sector_id, name FROM teams WHERE company_id = ? ORDER BY name', [ctx.companyId]),
    db.query<any>(`SELECT COUNT(*) AS n FROM interventions WHERE company_id = ? AND status <> 'concluida'`, [ctx.companyId]),
  ]);

  const sectorSum = await childSummaries(ctx.companyId, weeks, 'sector');
  const sectors = sectorRows.map(s => ({ id: s.id, name: s.name, ...part.sector(s.id), ...brief(sectorSum(s.id)) }));

  // Equipes: as do setor em foco (ou do setor da equipe em foco).
  let teams: unknown[] = [];
  if (scope.sectorId) {
    const teamSum = await childSummaries(ctx.companyId, weeks, 'team', scope.sectorId);
    teams = teamRows.filter(t => t.sector_id === scope.sectorId)
      .map(t => ({ id: t.id, sectorId: t.sector_id, name: t.name, ...part.team(t.id), ...brief(teamSum(t.id)) }));
  }

  const focusPart = scope.type === 'team' ? part.team(scope.teamId!) : scope.type === 'sector' ? part.sector(scope.sectorId!) : part.company;
  const weeksWithData = hist.filter(h => !h.suppressed).length;
  const keys = weekKeys(weeks);

  return {
    company: { name: company.name },
    period: { weeks, from: keys[0], to: keys[keys.length - 1] },
    minGroupSize: env.minGroupSize,
    scope: { type: scope.type, label: scope.label, sectorId: scope.sectorId, teamId: scope.teamId },
    // Números reais calculados no banco (empresa inteira).
    overview: {
      total: stats.total, registered: stats.eligible, active: stats.active, pending: stats.pending, inactive: stats.inactive,
      participated: stats.participated, notParticipated: stats.notParticipated, rate: stats.rate,
      sectors: company.sectors, teams: company.teams,
    },
    focus: { participation: focusPart, ...brief(focus), indicators: focus.indicators },
    sectors, teams,
    history: hist,
    trust: trust(focusPart, weeksWithData, hist.length, focus.respondents),
    latestInsight: latest,
    activeInterventions: Number(ivCount[0].n),
  };
}

export async function historyFor(ctx: Ctx, q: Record<string, unknown>) {
  const weeks = Math.min(12, Math.max(4, Number(q.weeks) || 12));
  const scope = await resolveScope(ctx.companyId, optId(q.sectorId, 'setor'), optId(q.teamId, 'equipe'));
  const indicator = typeof q.indicator === 'string' ? q.indicator : undefined;
  return { scope: { type: scope.type, label: scope.label }, minGroupSize: env.minGroupSize, points: await history(ctx.companyId, weeks, scope, indicator) };
}

/** Avisos derivados dos dados reais (nada fixo). */
export async function notifications(ctx: Ctx) {
  const db = getDb();
  const now = new Date().toISOString();
  const items: { type: string; title: string; message: string; date: string }[] = [];
  const s = await scopeSummary(ctx.companyId, 4, { sectorId: null, teamId: null });
  if (!s.insufficient) {
    for (const i of s.indicators.filter(i => i.level !== 'baixa' && (i.delta ?? 0) >= 5).slice(0, 3)) {
      items.push({ type: 'sinal', title: 'Indicador em alta', date: now, message: `${i.label}: índice de atenção ${i.index} (+${i.delta} pts vs. período anterior).` });
    }
  }
  const soon = await db.query<any>(
    `SELECT action, due_date FROM interventions WHERE company_id = ? AND status <> 'concluida' AND due_date <= ? ORDER BY due_date LIMIT 2`,
    [ctx.companyId, new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)]);
  for (const iv of soon) items.push({ type: 'intervencao', title: 'Intervenção próxima do prazo', date: now, message: `"${iv.action}" vence em ${String(iv.due_date).split('-').reverse().join('/')}.` });
  const st = await employeeStats(ctx, 1);
  items.push({ type: 'dados', title: 'Participação da semana', date: now, message: `${st.participated} de ${st.eligible} colaboradores enviaram o check-in nesta semana (${st.rate}%).` });
  return items;
}

export { toIso };
