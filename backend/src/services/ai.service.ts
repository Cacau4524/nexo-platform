import { getDb, nowSql, toIso } from '../database/db';
import { callModel, parseJsonObject } from '../ai/client';
import { COMMENT_SYSTEM, FORBIDDEN_TERMS, INSIGHT_SYSTEM } from '../ai/prompts';
import { aiConfigured, env } from '../config/env';
import { childSummaries, history, participation, parseWeeks, resolveScope, scopeSummary } from './analytics.service';
import { audit } from './context';
import type { Ctx } from './context';
import { HttpError, notFound, optId } from '../utils/validate';
import { redactPII } from '../utils/redact';
import { weekKeys } from '../utils/week';
import { isRisk } from '../domain';

export interface InsightResult {
  attentionLevel: 'baixo' | 'moderado' | 'elevado';
  mainSignal: string; whatChanged: string; whyItMatters: string;
  factorsToInvestigate: string[]; whatToInvestigate: string; suggestedActions: string[];
  howToFollow: string; recommendation: string; limitations: string;
}

const LEVELS = ['baixo', 'moderado', 'elevado'];
const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const list = (v: unknown, min: number, max: number, itemMax: number): string[] | null => {
  if (!Array.isArray(v)) return null;
  const out = v.map(x => text(x, itemMax)).filter((x): x is string => !!x).slice(0, max);
  return out.length >= min ? out : null;
};

/** Nunca confiamos cegamente no modelo: valida formato, tamanho e política (sem diagnósticos). */
export function validateInsight(raw: Record<string, unknown> | null): InsightResult | 'policy' | null {
  if (!raw) return null;
  const level = String(raw.attentionLevel ?? '').toLowerCase();
  const r = {
    attentionLevel: level as InsightResult['attentionLevel'],
    mainSignal: text(raw.mainSignal, 500), whatChanged: text(raw.whatChanged, 900), whyItMatters: text(raw.whyItMatters, 900),
    factorsToInvestigate: list(raw.factorsToInvestigate, 1, 6, 220), whatToInvestigate: text(raw.whatToInvestigate, 900),
    suggestedActions: list(raw.suggestedActions, 1, 5, 300), howToFollow: text(raw.howToFollow, 700),
    recommendation: text(raw.recommendation, 700), limitations: text(raw.limitations, 700),
  };
  if (!LEVELS.includes(level) || Object.values(r).some(v => v === null)) return null;
  const all = JSON.stringify(r);
  if (FORBIDDEN_TERMS.test(all)) return 'policy';
  return r as InsightResult;
}

// ------------------------------------------------------------------ análise agregada (gestor)
export async function requestInsight(ctx: Ctx, body: Record<string, unknown>) {
  const db = getDb();
  const scope = await resolveScope(ctx.companyId, optId(body.sectorId, 'setor'), optId(body.teamId, 'equipe'));
  const weeks = parseWeeks(body.weeks, 4);
  if (!aiConfigured()) throw new HttpError(503, 'ai_not_configured', 'A IA ainda não foi configurada neste ambiente (defina AI_API_KEY no backend).');

  // PRIVACIDADE: sem pessoas suficientes, nem chamamos a IA.
  const summary = await scopeSummary(ctx.companyId, weeks, scope);
  if (summary.insufficient) {
    throw new HttpError(422, 'insufficient_data', `Dados insuficientes para gerar análise agregada (mínimo de ${env.minGroupSize} participantes no período).`);
  }

  // Controle de custo por empresa.
  const since = nowSql(new Date(Date.now() - 3600 * 1000));
  const used = Number((await db.query<any>(
    `SELECT COUNT(*) AS n FROM audit_logs WHERE company_id = ? AND action = 'ai_requested' AND created_at >= ?`, [ctx.companyId, since]))[0].n);
  if (used >= env.ai.maxPerHour) throw new HttpError(429, 'ai_rate_limited', 'Limite de análises por hora atingido para esta empresa. Tente mais tarde.');

  // ---- payload AGREGADO (sem nomes de pessoas, e-mails, comentários ou nome da empresa)
  const part = await participation(ctx.companyId, weeks);
  const p = scope.type === 'team' ? part.team(scope.teamId!) : scope.type === 'sector' ? part.sector(scope.sectorId!) : part.company;
  const series = await history(ctx.companyId, Math.min(12, Math.max(8, weeks * 2)), scope);

  let comparison: { nome: string; indiceGeral: number; nivel: string; participantes: number }[] = [];
  let omitted = 0;
  if (scope.type !== 'team') {
    const by = scope.type === 'company' ? 'sector' : 'team';
    const rows = scope.type === 'company'
      ? await db.query<any>('SELECT id, name FROM sectors WHERE company_id = ?', [ctx.companyId])
      : await db.query<any>('SELECT id, name FROM teams WHERE company_id = ? AND sector_id = ?', [ctx.companyId, scope.sectorId]);
    const sum = await childSummaries(ctx.companyId, weeks, by, scope.sectorId);
    for (const r of rows) {
      const s = sum(r.id);
      if (s.insufficient || !s.attention) omitted++;
      else comparison.push({ nome: r.name, indiceGeral: s.attention.index, nivel: s.attention.level, participantes: s.respondents });
    }
    comparison = comparison.sort((a, b) => b.indiceGeral - a.indiceGeral);
  }

  const input = {
    escopo: scope.label,
    periodoSemanas: weeks,
    escala: 'Índice de atenção 0–100: quanto maior, maior a necessidade de atenção ao fator. Não é diagnóstico.',
    participantesNoPeriodo: summary.respondents,
    taxaParticipacaoPct: p.rate,
    indiceGeral: { atual: summary.attention!.index, anterior: summary.previousAttentionIndex, nivel: summary.attention!.level },
    indicadores: summary.indicators.map(i => ({
      nome: i.label, sentido: isRisk(i.key) ? 'valor maior = mais pressão' : 'valor maior = situação melhor (índice já convertido)',
      indice: i.index, indiceAnterior: i.prevIndex, variacaoPontos: i.delta, nivel: i.level,
    })),
    serieSemanal: series.map(w => ({ semana: w.label, participantes: w.suppressed ? 'insuficiente' : w.respondents, indiceGeral: w.index })),
    comparacaoInterna: comparison,
    gruposOmitidosPorPoucosParticipantes: omitted,
  };

  await audit(ctx.companyId, ctx.userId, 'ai_requested', scope.label);

  let result: InsightResult | null = null;
  let userMsg = JSON.stringify(input);
  for (let attempt = 0; attempt < 2 && !result; attempt++) {
    const raw = await callModel(INSIGHT_SYSTEM, userMsg);
    const v = validateInsight(parseJsonObject(raw));
    if (v && v !== 'policy') result = v;
    else userMsg = JSON.stringify(input) + (v === 'policy'
      ? '\n\nATENÇÃO: sua resposta anterior usou termos clínicos/diagnósticos, o que é proibido. Refaça falando apenas de fatores do ambiente de trabalho.'
      : '\n\nATENÇÃO: sua resposta anterior não seguiu o formato JSON exigido. Refaça exatamente no formato pedido.');
  }
  if (!result) throw new HttpError(502, 'ai_bad_response', 'A IA não devolveu uma análise válida. Tente novamente.');

  const now = nowSql();
  const ins = await db.run(
    `INSERT INTO ai_insights (company_id, scope_type, sector_id, team_id, period_weeks, week_from, week_to, input_json, result_json,
                              attention_level, provider, model, requested_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ctx.companyId, scope.type, scope.sectorId, scope.teamId, weeks, weekKeys(weeks)[0], weekKeys(weeks)[weeks - 1],
      JSON.stringify(input), JSON.stringify(result), result.attentionLevel, env.ai.provider, env.ai.model, ctx.userId, now]);
  await audit(ctx.companyId, ctx.userId, 'ai_insight_created', `#${ins.insertId} ${scope.label}`);
  return getInsight(ctx, ins.insertId);
}

const shape = (r: any) => {
  const input = JSON.parse(r.input_json);
  return {
    id: r.id, createdAt: toIso(r.created_at), weeks: r.period_weeks, weekFrom: r.week_from, weekTo: r.week_to,
    scope: { type: r.scope_type, sectorId: r.sector_id, teamId: r.team_id, label: input.escopo as string },
    participants: input.participantesNoPeriodo as number, attentionLevel: r.attention_level as string,
    provider: r.provider, model: r.model, result: JSON.parse(r.result_json) as InsightResult,
  };
};

export async function getInsight(ctx: Ctx, id: number) {
  const r = (await getDb().query<any>('SELECT * FROM ai_insights WHERE company_id = ? AND id = ?', [ctx.companyId, id]))[0];
  if (!r) throw notFound('Análise não encontrada.');
  return shape(r);
}

export async function listInsights(ctx: Ctx, limit = 20) {
  const rows = await getDb().query<any>('SELECT * FROM ai_insights WHERE company_id = ? ORDER BY id DESC LIMIT ?', [ctx.companyId, Math.min(50, Math.max(1, limit))]);
  return rows.map(shape);
}

export async function latestInsight(companyId: number) {
  const r = (await getDb().query<any>('SELECT * FROM ai_insights WHERE company_id = ? ORDER BY id DESC LIMIT 1', [companyId]))[0];
  return r ? shape(r) : null;
}

// ------------------------------------------------------------------ comentário livre (opcional, desligado por padrão)
export async function analyzeComment(companyId: number, checkinId: number, userId: number, comment: string) {
  const raw = await callModel(COMMENT_SYSTEM, redactPII(comment), 400);
  const j = parseJsonObject(raw);
  const themes = Array.isArray(j?.themes) ? (j!.themes as unknown[]).map(t => text(t, 60)).filter((t): t is string => !!t).slice(0, 4) : [];
  const intensity = String(j?.intensity);
  const context = text(j?.context, 300);
  if (!themes.length || !['baixa', 'moderada', 'alta'].includes(intensity) || !context || FORBIDDEN_TERMS.test(JSON.stringify(j))) return;
  const db = getDb();
  const prior = Number((await db.query<any>('SELECT COUNT(*) AS n FROM checkins WHERE company_id = ? AND user_id = ? AND comment IS NOT NULL AND id <> ?', [companyId, userId, checkinId]))[0].n);
  await db.run('INSERT INTO comment_analyses (company_id, checkin_id, themes, intensity, recurrence, context, provider, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [companyId, checkinId, JSON.stringify(themes), intensity, prior >= 3 ? 'frequente' : prior >= 1 ? 'ocasional' : 'raro', context, env.ai.provider, nowSql()]);
}
