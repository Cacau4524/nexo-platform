import { getDb, inList } from '../database/db';
import type { Row } from '../database/db';
import { env } from '../config/env';
import { attentionIndex, groupLevel, INDICATORS, levelOf } from '../domain';
import type { Level } from '../domain';
import { weekKeys, weekLabel } from '../utils/week';
import { notFound } from '../utils/validate';

/**
 * Todas as consultas recebem companyId e filtram por ele em CADA tabela envolvida.
 * PRIVACIDADE: nenhum agregado é devolvido se o grupo tiver menos de `minGroupSize`
 * PESSOAS diferentes (não respostas) no período — ver `insufficient`.
 */
export const ALLOWED_WEEKS = [1, 4, 8, 12];
export const parseWeeks = (v: unknown, def = 4) => (ALLOWED_WEEKS.includes(Number(v)) ? Number(v) : def);
const num = (v: unknown) => Number(v ?? 0);

export interface Scope { sectorId: number | null; teamId: number | null }
export interface ResolvedScope extends Scope { type: 'company' | 'sector' | 'team'; label: string }

/** Valida que setor/equipe existem NESTA empresa (senão 404) e devolve o escopo canônico. */
export async function resolveScope(companyId: number, sectorId: number | null, teamId: number | null): Promise<ResolvedScope> {
  const db = getDb();
  if (teamId) {
    const t = (await db.query<any>(
      `SELECT t.id, t.name, t.sector_id, s.name AS sector_name FROM teams t
         JOIN sectors s ON s.id = t.sector_id AND s.company_id = t.company_id
        WHERE t.company_id = ? AND t.id = ?`, [companyId, teamId]))[0];
    if (!t) throw notFound('Equipe não encontrada.');
    return { type: 'team', sectorId: t.sector_id, teamId: t.id, label: `Equipe ${t.name} (${t.sector_name})` };
  }
  if (sectorId) {
    const s = (await db.query<any>('SELECT id, name FROM sectors WHERE company_id = ? AND id = ?', [companyId, sectorId]))[0];
    if (!s) throw notFound('Setor não encontrado.');
    return { type: 'sector', sectorId: s.id, teamId: null, label: `Setor ${s.name}` };
  }
  return { type: 'company', sectorId: null, teamId: null, label: 'Organização inteira' };
}

const scopeSql = (s: Scope) => {
  let sql = ''; const p: unknown[] = [];
  if (s.sectorId) { sql += ' AND c.sector_id = ?'; p.push(s.sectorId); }
  if (s.teamId) { sql += ' AND c.team_id = ?'; p.push(s.teamId); }
  return { sql, p };
};

// ------------------------------------------------------------------ participação
export interface Part { eligible: number; participated: number; notParticipated: number; rate: number }
const mkPart = (eligible: number, participated: number): Part => ({
  eligible, participated, notParticipated: Math.max(0, eligible - participated),
  rate: eligible ? Math.round((participated / eligible) * 1000) / 10 : 0,
});

/**
 * Base de participação = colaboradores ativos + pré-cadastrados (exclui inativos).
 * Participou = enviou ao menos um check-in nas semanas do período.
 * Tudo calculado no banco; setor/equipe = cadastro ATUAL da pessoa.
 */
export async function participation(companyId: number, weeks: number) {
  const db = getDb();
  const keys = weekKeys(weeks);
  const elig = await db.query<Row>(
    `SELECT sector_id, team_id, COUNT(*) AS n FROM users
      WHERE company_id = ? AND role = 'employee' AND status IN ('active','pending') GROUP BY sector_id, team_id`, [companyId]);
  const part = await db.query<Row>(
    `SELECT u.sector_id, u.team_id, COUNT(DISTINCT c.user_id) AS n
       FROM checkins c JOIN users u ON u.id = c.user_id AND u.company_id = c.company_id
      WHERE c.company_id = ? AND c.week_key IN (${inList(keys.length)})
        AND u.role = 'employee' AND u.status IN ('active','pending')
      GROUP BY u.sector_id, u.team_id`, [companyId, ...keys]);

  const bySector = new Map<number | null, { e: number; p: number }>();
  const byTeam = new Map<number | null, { e: number; p: number }>();
  let e = 0, p = 0;
  const add = (m: Map<number | null, { e: number; p: number }>, k: number | null, ne: number, np: number) => {
    const c = m.get(k) ?? { e: 0, p: 0 }; c.e += ne; c.p += np; m.set(k, c);
  };
  for (const r of elig) { add(bySector, r.sector_id, num(r.n), 0); add(byTeam, r.team_id, num(r.n), 0); e += num(r.n); }
  for (const r of part) { add(bySector, r.sector_id, 0, num(r.n)); add(byTeam, r.team_id, 0, num(r.n)); p += num(r.n); }
  const get = (m: Map<number | null, { e: number; p: number }>, k: number) => mkPart(m.get(k)?.e ?? 0, m.get(k)?.p ?? 0);
  return {
    company: mkPart(e, p),
    sector: (id: number) => get(bySector, id),
    team: (id: number) => get(byTeam, id),
    weeks: keys,
  };
}

// ------------------------------------------------------------------ agregados de indicadores
interface Grouped { respondents: number; avgs: Map<string, number> }

/** Médias por indicador (e nº de pessoas) nas semanas dadas, opcionalmente agrupadas por setor/equipe. */
async function groupedStats(companyId: number, keys: string[], scope: Scope, groupCol: 'sector_id' | 'team_id' | null) {
  const db = getDb();
  const sc = scopeSql(scope);
  const g = groupCol ? `c.${groupCol}` : '0';
  const grp = groupCol ? `GROUP BY c.${groupCol}` : '';
  const base = [companyId, ...keys, ...sc.p];
  const resp = await db.query<Row>(
    `SELECT ${g} AS gid, COUNT(DISTINCT c.user_id) AS n FROM checkins c
      WHERE c.company_id = ? AND c.week_key IN (${inList(keys.length)})${sc.sql} ${grp}`, base);
  const avgs = await db.query<Row>(
    `SELECT ${g} AS gid, a.indicator AS indicator, AVG(a.value) AS avg
       FROM checkin_answers a JOIN checkins c ON c.id = a.checkin_id AND c.company_id = a.company_id
      WHERE a.company_id = ? AND c.week_key IN (${inList(keys.length)})${sc.sql}
      GROUP BY ${groupCol ? `c.${groupCol}, ` : ''}a.indicator`, base);
  const out = new Map<number, Grouped>();
  for (const r of resp) out.set(num(r.gid), { respondents: num(r.n), avgs: new Map() });
  for (const r of avgs) {
    const gid = num(r.gid);
    if (!out.has(gid)) out.set(gid, { respondents: 0, avgs: new Map() });
    out.get(gid)!.avgs.set(String(r.indicator), num(r.avg));
  }
  return out;
}

export interface IndicatorStat {
  key: string; label: string; risk: boolean; avg: number; index: number; level: Level;
  prevIndex: number | null; delta: number | null;
}
export interface ScopeSummary {
  insufficient: boolean; respondents: number; minGroupSize: number;
  attention: { index: number; level: Level } | null;
  previousAttentionIndex: number | null;
  indicators: IndicatorStat[];
}

const toStats = (g: Grouped | undefined, prev: Grouped | undefined): { stats: IndicatorStat[]; prevOk: boolean } => {
  const prevOk = !!prev && prev.respondents >= env.minGroupSize;
  const stats: IndicatorStat[] = [];
  for (const ind of INDICATORS) {
    const avg = g?.avgs.get(ind.key);
    if (avg === undefined) continue;
    const index = attentionIndex(ind.key, avg);
    const pAvg = prevOk ? prev!.avgs.get(ind.key) : undefined;
    const prevIndex = pAvg === undefined ? null : attentionIndex(ind.key, pAvg);
    stats.push({
      key: ind.key, label: ind.label, risk: ind.risk, avg: Math.round(avg * 100) / 100, index, level: levelOf(index),
      prevIndex, delta: prevIndex === null ? null : Math.round((index - prevIndex) * 10) / 10,
    });
  }
  return { stats, prevOk };
};

function summarize(g: Grouped | undefined, prev: Grouped | undefined): ScopeSummary {
  const respondents = g?.respondents ?? 0;
  if (respondents < env.minGroupSize) {
    return { insufficient: true, respondents, minGroupSize: env.minGroupSize, attention: null, previousAttentionIndex: null, indicators: [] };
  }
  const { stats, prevOk } = toStats(g, prev);
  const prevIdx = prevOk && prev ? stats.filter(s => s.prevIndex !== null).map(s => s.prevIndex as number) : [];
  return {
    insufficient: false, respondents, minGroupSize: env.minGroupSize,
    attention: groupLevel(stats.map(s => s.index)),
    previousAttentionIndex: prevIdx.length ? groupLevel(prevIdx).index : null,
    indicators: stats,
  };
}

/** Resumo do escopo (empresa, setor ou equipe) no período, comparado ao período anterior de igual tamanho. */
export async function scopeSummary(companyId: number, weeks: number, scope: Scope): Promise<ScopeSummary> {
  const [cur, prev] = await Promise.all([
    groupedStats(companyId, weekKeys(weeks), scope, null),
    groupedStats(companyId, weekKeys(weeks, weeks), scope, null),
  ]);
  return summarize(cur.get(0), prev.get(0));
}

/** Resumo de cada setor (ou de cada equipe de um setor) — uma consulta agrupada, sem N+1. */
export async function childSummaries(companyId: number, weeks: number, by: 'sector' | 'team', sectorId: number | null = null) {
  const scope: Scope = { sectorId: by === 'team' ? sectorId : null, teamId: null };
  const col = by === 'sector' ? 'sector_id' : 'team_id';
  const [cur, prev] = await Promise.all([
    groupedStats(companyId, weekKeys(weeks), scope, col),
    groupedStats(companyId, weekKeys(weeks, weeks), scope, col),
  ]);
  return (id: number) => summarize(cur.get(id), prev.get(id));
}

// ------------------------------------------------------------------ histórico semanal
export interface WeekPoint { week: string; label: string; respondents: number; suppressed: boolean; index: number | null; values: Record<string, number> }

/** Série semanal. Semanas com menos de K pessoas são suprimidas (index = null). */
export async function history(companyId: number, weeks: number, scope: Scope, indicator?: string): Promise<WeekPoint[]> {
  const db = getDb();
  const keys = weekKeys(weeks);
  const sc = scopeSql(scope);
  const params = [companyId, ...keys, ...sc.p];
  const resp = await db.query<Row>(
    `SELECT c.week_key AS wk, COUNT(DISTINCT c.user_id) AS n FROM checkins c
      WHERE c.company_id = ? AND c.week_key IN (${inList(keys.length)})${sc.sql} GROUP BY c.week_key`, params);
  const avgs = await db.query<Row>(
    `SELECT c.week_key AS wk, a.indicator AS indicator, AVG(a.value) AS avg
       FROM checkin_answers a JOIN checkins c ON c.id = a.checkin_id AND c.company_id = a.company_id
      WHERE a.company_id = ? AND c.week_key IN (${inList(keys.length)})${sc.sql} GROUP BY c.week_key, a.indicator`, params);
  return keys.map(week => {
    const respondents = num(resp.find(r => r.wk === week)?.n);
    const suppressed = respondents < env.minGroupSize;
    const values: Record<string, number> = {};
    if (!suppressed) for (const r of avgs.filter(a => a.wk === week)) values[String(r.indicator)] = Math.round(num(r.avg) * 100) / 100;
    const idxs = Object.entries(values).filter(([k]) => !indicator || k === indicator).map(([k, v]) => attentionIndex(k, v));
    return {
      week, label: weekLabel(week), respondents, suppressed,
      index: suppressed || !idxs.length ? null : Math.round((idxs.reduce((a, b) => a + b, 0) / idxs.length) * 10) / 10,
      values,
    };
  });
}

/** Índice de atenção (0–100) de um indicador num conjunto de semanas; null se dados insuficientes. */
export async function indicatorIndexFor(companyId: number, scope: Scope, indicator: string, keys: string[]): Promise<number | null> {
  const g = (await groupedStats(companyId, keys, scope, null)).get(0);
  if (!g || g.respondents < env.minGroupSize) return null;
  const avg = g.avgs.get(indicator);
  return avg === undefined ? null : attentionIndex(indicator, avg);
}

/** Confiabilidade dos dados exibidos (participação + cobertura de semanas + amostra). */
export function trust(part: Part, weeksWithData: number, weeks: number, respondents: number) {
  const partScore = Math.min(100, part.rate * 1.25); // 80% de participação já é "excelente"
  const coverage = weeks ? (weeksWithData / weeks) * 100 : 0;
  const sample = Math.min(100, (respondents / (env.minGroupSize * 4)) * 100);
  const score = Math.round(0.5 * partScore + 0.3 * coverage + 0.2 * sample);
  const label = score >= 80 ? 'Alta confiabilidade' : score >= 55 ? 'Confiabilidade moderada' : 'Atenção';
  const message = score >= 80 ? 'Participação e continuidade suficientes para leitura de tendências.'
    : score >= 55 ? 'Adequado para leitura geral; interprete variações pequenas com cautela.'
      : 'Poucos dados: interprete com cautela e incentive a participação.';
  return { score, label, message };
}
