import { getDb, nowSql } from '../database/db';
import { INDICATOR_KEYS, indicatorLabel } from '../domain';
import { audit } from './context';
import type { Ctx } from './context';
import { indicatorIndexFor, resolveScope } from './analytics.service';
import { bad, notFound, optId, str } from '../utils/validate';
import { weekKeys } from '../utils/week';

const STATUSES = ['planejada', 'em_andamento', 'concluida'];
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export async function list(ctx: Ctx) {
  const db = getDb();
  const rows = await db.query<any>(
    `SELECT i.*, s.name AS sector_name, t.name AS team_name FROM interventions i
       LEFT JOIN sectors s ON s.id = i.sector_id AND s.company_id = i.company_id
       LEFT JOIN teams t ON t.id = i.team_id AND t.company_id = i.company_id
      WHERE i.company_id = ? ORDER BY i.id DESC`, [ctx.companyId]);
  const results = await db.query<any>('SELECT * FROM intervention_results WHERE company_id = ?', [ctx.companyId]);
  return rows.map(i => {
    const r = results.find(x => x.intervention_id === i.id);
    return {
      id: i.id, sectorId: i.sector_id, teamId: i.team_id,
      scopeLabel: i.team_name ? `Equipe ${i.team_name}` : i.sector_name ? `Setor ${i.sector_name}` : 'Organização inteira',
      indicator: i.indicator, indicatorLabel: indicatorLabel(i.indicator), problem: i.problem, action: i.action, owner: i.owner,
      dueDate: i.due_date, status: i.status, createdAt: String(i.created_at).slice(0, 10),
      result: r ? { before: Number(r.before_value), after: Number(r.after_value), variationPct: Number(r.variation_pct), observedAt: r.observed_at } : null,
    };
  });
}

export async function create(ctx: Ctx, b: Record<string, unknown>) {
  const scope = await resolveScope(ctx.companyId, optId(b.sectorId, 'setor'), optId(b.teamId, 'equipe'));
  const indicator = String(b.indicator);
  if (!INDICATOR_KEYS.includes(indicator)) throw bad('Fator inválido.');
  const status = String(b.status ?? 'planejada');
  if (!STATUSES.includes(status)) throw bad('Status inválido.');
  const dueDate = b.dueDate ? String(b.dueDate) : new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  if (!isDate(dueDate)) throw bad('Data inválida.');
  const r = await getDb().run(
    `INSERT INTO interventions (company_id, sector_id, team_id, indicator, problem, action, owner, due_date, status, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ctx.companyId, scope.sectorId, scope.teamId, indicator, str(b.problem, 'o problema identificado', { max: 500 }),
      str(b.action, 'a ação', { max: 500 }), str(b.owner, 'o responsável', { max: 120, optional: true }) || 'Gestor', dueDate, status, ctx.userId, nowSql()]);
  await audit(ctx.companyId, ctx.userId, 'intervention_created', `#${r.insertId} (${indicatorLabel(indicator)})`);
  return { id: r.insertId };
}

export async function update(ctx: Ctx, id: number, b: Record<string, unknown>) {
  const db = getDb();
  const cur = (await db.query<any>('SELECT * FROM interventions WHERE company_id = ? AND id = ?', [ctx.companyId, id]))[0];
  if (!cur) throw notFound('Intervenção não encontrada.');
  const sets: string[] = []; const p: unknown[] = [];
  if (b.status !== undefined) {
    if (!STATUSES.includes(String(b.status))) throw bad('Status inválido.');
    sets.push('status = ?'); p.push(String(b.status));
  }
  if (b.action) { sets.push('action = ?'); p.push(str(b.action, 'a ação', { max: 500 })); }
  if (b.dueDate) { if (!isDate(String(b.dueDate))) throw bad('Data inválida.'); sets.push('due_date = ?'); p.push(String(b.dueDate)); }
  if (!sets.length) throw bad('Nada para atualizar.');
  await db.run(`UPDATE interventions SET ${sets.join(', ')} WHERE company_id = ? AND id = ?`, [...p, ctx.companyId, id]);

  // Ao concluir (uma única vez): compara o índice de atenção do fator antes/depois, respeitando o mínimo de participantes.
  let result = null;
  if (b.status === 'concluida' && cur.status !== 'concluida') {
    const scope = { sectorId: cur.sector_id as number | null, teamId: cur.team_id as number | null };
    const before = await indicatorIndexFor(ctx.companyId, scope, cur.indicator, weekKeys(4, 4));
    const after = await indicatorIndexFor(ctx.companyId, scope, cur.indicator, weekKeys(4, 0));
    if (before !== null && after !== null && before > 0) {
      const variation = Math.round(((after - before) / before) * 1000) / 10;
      const observedAt = new Date().toISOString().slice(0, 10);
      await db.run('INSERT INTO intervention_results (company_id, intervention_id, before_value, after_value, variation_pct, observed_at) VALUES (?, ?, ?, ?, ?, ?)',
        [ctx.companyId, id, before, after, variation, observedAt]);
      result = { before, after, variationPct: variation, observedAt };
    }
  }
  await audit(ctx.companyId, ctx.userId, 'intervention_updated', `#${id} → ${b.status ?? 'editada'}`);
  return { id, result };
}
