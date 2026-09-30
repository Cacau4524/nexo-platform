import { getDb, nowSql, toIso } from '../database/db';
import { INDICATORS, INDICATOR_KEYS } from '../domain';
import { env, aiConfigured } from '../config/env';
import { isoWeekKey } from '../utils/week';
import { decryptText, encryptText } from '../utils/crypto';
import { bad, conflict, forbidden, HttpError } from '../utils/validate';
import { audit } from './context';
import type { Ctx } from './context';
import { analyzeComment } from './ai.service';

export const questions = () => INDICATORS.map(({ key, label, prompt, low, high, kind }) => ({ key, label, prompt, low, high, kind }));

export async function submit(ctx: Ctx, body: Record<string, unknown>) {
  if (ctx.role !== 'employee') throw forbidden('Apenas colaboradores respondem check-ins.');
  const db = getDb();

  // Exige TODAS as perguntas, uma vez cada, com valores 1–5 (agregados consistentes).
  const raw = Array.isArray(body.answers) ? body.answers.slice(0, 30) : [];
  const map = new Map<string, number>();
  for (const a of raw as { indicator?: unknown; value?: unknown }[]) {
    const key = String(a?.indicator); const value = Number(a?.value);
    if (!INDICATOR_KEYS.includes(key) || map.has(key) || !Number.isInteger(value) || value < 1 || value > 5) throw bad('Respostas inválidas. Revise o check-in.');
    map.set(key, value);
  }
  if (map.size !== INDICATOR_KEYS.length) throw bad('Responda todas as perguntas para enviar o check-in.');
  const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 1000) : '';

  const me = (await db.query<any>('SELECT sector_id, team_id FROM users WHERE company_id = ? AND id = ?', [ctx.companyId, ctx.userId]))[0];
  if (!me || !me.sector_id) throw new HttpError(400, 'no_sector', 'Seu perfil não está vinculado a um setor, então não responde check-ins.');

  const weekKey = isoWeekKey(new Date(), 0);
  if (env.checkinsPerWeek > 0) {
    const done = Number((await db.query<any>('SELECT COUNT(*) AS n FROM checkins WHERE company_id = ? AND user_id = ? AND week_key = ?', [ctx.companyId, ctx.userId, weekKey]))[0].n);
    if (done >= env.checkinsPerWeek) throw conflict('Você já respondeu o check-in desta semana. Volte na próxima!', 'already_submitted');
  }

  // Setor/equipe gravados no check-in (snapshot): mudar de equipe depois não reescreve o histórico.
  const checkinId = await db.tx(async t => {
    const r = await t.run('INSERT INTO checkins (company_id, user_id, sector_id, team_id, week_key, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [ctx.companyId, ctx.userId, me.sector_id, me.team_id, weekKey, comment ? encryptText(comment) : null, nowSql()]);
    for (const [indicator, value] of map) {
      await t.run('INSERT INTO checkin_answers (company_id, checkin_id, indicator, value) VALUES (?, ?, ?, ?)', [ctx.companyId, r.insertId, indicator, value]);
    }
    return r.insertId;
  });
  await audit(ctx.companyId, ctx.userId, 'checkin_submitted', `Semana ${weekKey}`);

  // Análise opcional do comentário (só se habilitada e com IA configurada). Não bloqueia a resposta.
  if (comment && env.ai.commentAnalysis && aiConfigured()) {
    void analyzeComment(ctx.companyId, checkinId, ctx.userId, comment).catch(() => undefined);
  }
  return { id: checkinId, weekKey };
}

export async function status(ctx: Ctx) {
  const weekKey = isoWeekKey(new Date(), 0);
  const db = getDb();
  const thisWeek = Number((await db.query<any>('SELECT COUNT(*) AS n FROM checkins WHERE company_id = ? AND user_id = ? AND week_key = ?', [ctx.companyId, ctx.userId, weekKey]))[0].n);
  const last = (await db.query<any>('SELECT MAX(created_at) AS d FROM checkins WHERE company_id = ? AND user_id = ?', [ctx.companyId, ctx.userId]))[0].d;
  const total = Number((await db.query<any>('SELECT COUNT(*) AS n FROM checkins WHERE company_id = ? AND user_id = ?', [ctx.companyId, ctx.userId]))[0].n);
  return {
    weekKey, answeredThisWeek: thisWeek > 0, canAnswer: env.checkinsPerWeek === 0 || thisWeek < env.checkinsPerWeek,
    lastCheckinAt: toIso(last), totalCheckins: total,
  };
}

/** Histórico do PRÓPRIO usuário (company_id + user_id). Nunca de outras pessoas. */
export async function myHistory(ctx: Ctx) {
  const db = getDb();
  const cs = await db.query<any>('SELECT id, week_key, comment, created_at FROM checkins WHERE company_id = ? AND user_id = ? ORDER BY id DESC LIMIT 100', [ctx.companyId, ctx.userId]);
  if (!cs.length) return [];
  const answers = await db.query<any>(
    `SELECT a.checkin_id, a.indicator, a.value FROM checkin_answers a JOIN checkins c ON c.id = a.checkin_id AND c.company_id = a.company_id
      WHERE a.company_id = ? AND c.user_id = ?`, [ctx.companyId, ctx.userId]);
  const analyses = await db.query<any>(
    `SELECT n.checkin_id, n.themes, n.intensity, n.recurrence, n.context FROM comment_analyses n JOIN checkins c ON c.id = n.checkin_id AND c.company_id = n.company_id
      WHERE n.company_id = ? AND c.user_id = ?`, [ctx.companyId, ctx.userId]);
  return cs.map(c => {
    const an = analyses.find(a => a.checkin_id === c.id);
    return {
      id: c.id, weekKey: c.week_key, createdAt: toIso(c.created_at),
      answers: answers.filter(a => a.checkin_id === c.id).map(a => ({ indicator: a.indicator, value: Number(a.value) })),
      comment: c.comment ? decryptText(String(c.comment)) : undefined,
      analysis: an ? { themes: JSON.parse(an.themes), intensity: an.intensity, recurrence: an.recurrence, context: an.context } : null,
    };
  });
}

/** LGPD — portabilidade: tudo o que o sistema guarda sobre UMA pessoa. */
export async function exportMyData(ctx: Ctx) {
  const u = (await getDb().query<any>('SELECT name, email, role, job_title, phone, created_at FROM users WHERE company_id = ? AND id = ?', [ctx.companyId, ctx.userId]))[0];
  return {
    exportedAt: new Date().toISOString(),
    user: u ? { name: u.name, email: u.email, role: u.role, jobTitle: u.job_title, phone: u.phone, createdAt: toIso(u.created_at) } : null,
    checkins: await myHistory(ctx),
    note: 'Médias agregadas já calculadas para setores e equipes não contêm dados identificáveis e não fazem parte desta exportação.',
  };
}

/** LGPD — eliminação: apaga check-ins, respostas e análises da pessoa (cascata no banco). */
export async function deleteMyCheckins(ctx: Ctx) {
  const r = await getDb().run('DELETE FROM checkins WHERE company_id = ? AND user_id = ?', [ctx.companyId, ctx.userId]);
  await audit(ctx.companyId, ctx.userId, 'user_data_deleted', `${r.changes} check-in(s) apagado(s) pelo titular`);
  return { removed: r.changes };
}

/** Retenção (todas as empresas): apaga o TEXTO dos comentários antigos. Rotina de manutenção, não é uma rota. */
export async function purgeOldComments(): Promise<number> {
  if (!env.commentRetentionDays) return 0;
  const limit = nowSql(new Date(Date.now() - env.commentRetentionDays * 86400000));
  const r = await getDb().run('UPDATE checkins SET comment = NULL WHERE comment IS NOT NULL AND created_at < ?', [limit]);
  if (r.changes) await audit(null, null, 'comments_purged', `${r.changes} comentário(s) removido(s) por retenção`);
  return r.changes;
}
