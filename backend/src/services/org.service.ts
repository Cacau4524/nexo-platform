import { getDb, nowSql, toIso } from '../database/db';
import { audit, isDuplicateError } from './context';
import type { Ctx } from './context';
import { assertSectorTeam } from './auth.service';
import { participation, parseWeeks } from './analytics.service';
import { bad, conflict, email as vEmail, forbidden, id as vId, notFound, optId, phone as vPhone, str, nameKey } from '../utils/validate';
import { weekKeys } from '../utils/week';
import { inList } from '../database/db';

const like = (s: string) => '%' + s.toLowerCase().replace(/[!%_]/g, m => '!' + m) + '%';

// ------------------------------------------------------------------ empresa
export async function getCompany(ctx: Ctx) {
  const db = getDb();
  const c = (await db.query<any>('SELECT name, code, self_signup, created_at FROM companies WHERE id = ?', [ctx.companyId]))[0];
  if (!c) throw notFound('Empresa não encontrada.');
  const counts = (await db.query<any>(
    `SELECT (SELECT COUNT(*) FROM sectors WHERE company_id = ?) AS sectors,
            (SELECT COUNT(*) FROM teams WHERE company_id = ?) AS teams`, [ctx.companyId, ctx.companyId]))[0];
  return {
    name: c.name, createdAt: toIso(c.created_at), sectors: Number(counts.sectors), teams: Number(counts.teams),
    ...(ctx.role === 'manager' ? { code: c.code, selfSignup: !!c.self_signup } : {}),
  };
}

export async function updateCompany(ctx: Ctx, body: Record<string, unknown>) {
  const db = getDb();
  const changed: string[] = [];
  if (body.name !== undefined) {
    const name = str(body.name, 'o nome da empresa', { min: 2, max: 160 });
    try {
      await db.run('UPDATE companies SET name = ?, name_key = ? WHERE id = ?', [name, nameKey(name), ctx.companyId]);
    } catch (e) {
      if (isDuplicateError(e)) throw conflict('Já existe uma empresa cadastrada com este nome.', 'company_exists');
      throw e;
    }
    changed.push('name');
  }
  if (body.selfSignup !== undefined) {
    if (typeof body.selfSignup !== 'boolean') throw bad('Valor inválido para o cadastro aberto.');
    await db.run('UPDATE companies SET self_signup = ? WHERE id = ?', [body.selfSignup ? 1 : 0, ctx.companyId]);
    changed.push(`self_signup=${body.selfSignup}`);
  }
  if (!changed.length) throw bad('Nada para atualizar.');
  await audit(ctx.companyId, ctx.userId, 'company_updated', changed.join(', '));
  return getCompany(ctx);
}

// ------------------------------------------------------------------ estrutura: setores e equipes
export async function structure(ctx: Ctx, weeksParam?: unknown) {
  const db = getDb();
  const weeks = parseWeeks(weeksParam);
  const part = await participation(ctx.companyId, weeks);
  const sectors = await db.query<any>('SELECT id, name FROM sectors WHERE company_id = ? ORDER BY name', [ctx.companyId]);
  const teams = await db.query<any>('SELECT id, sector_id, name FROM teams WHERE company_id = ? ORDER BY name', [ctx.companyId]);
  return {
    weeks,
    sectors: sectors.map(s => ({
      id: s.id, name: s.name, ...part.sector(s.id),
      teams: teams.filter(t => t.sector_id === s.id).map(t => ({ id: t.id, name: t.name, sectorId: s.id, ...part.team(t.id) })),
    })),
  };
}

export async function listTeams(ctx: Ctx, sectorId: number | null) {
  const rows = await getDb().query<any>(
    `SELECT t.id, t.name, t.sector_id, s.name AS sector_name FROM teams t
       JOIN sectors s ON s.id = t.sector_id AND s.company_id = t.company_id
      WHERE t.company_id = ? ${sectorId ? 'AND t.sector_id = ?' : ''} ORDER BY s.name, t.name`,
    sectorId ? [ctx.companyId, sectorId] : [ctx.companyId]);
  return rows.map(r => ({ id: r.id, name: r.name, sectorId: r.sector_id, sectorName: r.sector_name }));
}

export async function createSector(ctx: Ctx, body: Record<string, unknown>) {
  const name = str(body.name, 'o nome do setor', { min: 2, max: 120 });
  try {
    const r = await getDb().run('INSERT INTO sectors (company_id, name, created_at) VALUES (?, ?, ?)', [ctx.companyId, name, nowSql()]);
    await audit(ctx.companyId, ctx.userId, 'sector_created', name);
    return { id: r.insertId, name };
  } catch (e) {
    if (isDuplicateError(e)) throw conflict('Já existe um setor com este nome.');
    throw e;
  }
}

export async function renameSector(ctx: Ctx, sectorId: number, body: Record<string, unknown>) {
  const name = str(body.name, 'o nome do setor', { min: 2, max: 120 });
  try {
    const r = await getDb().run('UPDATE sectors SET name = ? WHERE company_id = ? AND id = ?', [name, ctx.companyId, sectorId]);
    if (!r.changes) throw notFound('Setor não encontrado.');
  } catch (e) {
    if (isDuplicateError(e)) throw conflict('Já existe um setor com este nome.');
    throw e;
  }
  return { id: sectorId, name };
}

export async function deleteSector(ctx: Ctx, sectorId: number) {
  const db = getDb();
  const s = await db.query('SELECT id FROM sectors WHERE company_id = ? AND id = ?', [ctx.companyId, sectorId]);
  if (!s.length) throw notFound('Setor não encontrado.');
  const used = (await db.query<any>(
    `SELECT (SELECT COUNT(*) FROM teams WHERE company_id = ? AND sector_id = ?) AS teams,
            (SELECT COUNT(*) FROM users WHERE company_id = ? AND sector_id = ?) AS users,
            (SELECT COUNT(*) FROM checkins WHERE company_id = ? AND sector_id = ?) AS checkins,
            (SELECT COUNT(*) FROM interventions WHERE company_id = ? AND sector_id = ?) AS ivs`,
    Array(4).fill([ctx.companyId, sectorId]).flat()))[0];
  if (Object.values(used).some(v => Number(v) > 0)) throw conflict('O setor possui equipes, colaboradores ou histórico e não pode ser removido.', 'in_use');
  await db.run('DELETE FROM sectors WHERE company_id = ? AND id = ?', [ctx.companyId, sectorId]);
  await audit(ctx.companyId, ctx.userId, 'sector_deleted', String(sectorId));
}

export async function createTeam(ctx: Ctx, body: Record<string, unknown>) {
  const name = str(body.name, 'o nome da equipe', { min: 2, max: 120 });
  const sectorId = vId(body.sectorId, 'setor');
  await assertSectorTeam(ctx.companyId, sectorId, null);
  try {
    const r = await getDb().run('INSERT INTO teams (company_id, sector_id, name, created_at) VALUES (?, ?, ?, ?)', [ctx.companyId, sectorId, name, nowSql()]);
    await audit(ctx.companyId, ctx.userId, 'team_created', `${name} (setor ${sectorId})`);
    return { id: r.insertId, name, sectorId };
  } catch (e) {
    if (isDuplicateError(e)) throw conflict('Já existe uma equipe com este nome neste setor.');
    throw e;
  }
}

export async function renameTeam(ctx: Ctx, teamId: number, body: Record<string, unknown>) {
  const name = str(body.name, 'o nome da equipe', { min: 2, max: 120 });
  try {
    const r = await getDb().run('UPDATE teams SET name = ? WHERE company_id = ? AND id = ?', [name, ctx.companyId, teamId]);
    if (!r.changes) throw notFound('Equipe não encontrada.');
  } catch (e) {
    if (isDuplicateError(e)) throw conflict('Já existe uma equipe com este nome neste setor.');
    throw e;
  }
  return { id: teamId, name };
}

export async function deleteTeam(ctx: Ctx, teamId: number) {
  const db = getDb();
  const t = await db.query('SELECT id FROM teams WHERE company_id = ? AND id = ?', [ctx.companyId, teamId]);
  if (!t.length) throw notFound('Equipe não encontrada.');
  const used = (await db.query<any>(
    `SELECT (SELECT COUNT(*) FROM users WHERE company_id = ? AND team_id = ?) AS users,
            (SELECT COUNT(*) FROM checkins WHERE company_id = ? AND team_id = ?) AS checkins,
            (SELECT COUNT(*) FROM interventions WHERE company_id = ? AND team_id = ?) AS ivs`,
    Array(3).fill([ctx.companyId, teamId]).flat()))[0];
  if (Object.values(used).some(v => Number(v) > 0)) throw conflict('A equipe possui colaboradores ou histórico e não pode ser removida.', 'in_use');
  await db.run('DELETE FROM teams WHERE company_id = ? AND id = ?', [ctx.companyId, teamId]);
  await audit(ctx.companyId, ctx.userId, 'team_deleted', String(teamId));
}

// ------------------------------------------------------------------ colaboradores
export async function employeeStats(ctx: Ctx, weeksParam?: unknown) {
  const db = getDb();
  const weeks = parseWeeks(weeksParam);
  const c = (await db.query<any>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) AS inactive
       FROM users WHERE company_id = ? AND role = 'employee'`, [ctx.companyId]))[0];
  const part = await participation(ctx.companyId, weeks);
  return {
    weeks,
    total: Number(c.total ?? 0), active: Number(c.active ?? 0), pending: Number(c.pending ?? 0), inactive: Number(c.inactive ?? 0),
    ...part.company, // eligible, participated, notParticipated, rate
  };
}

export async function listEmployees(ctx: Ctx, q: Record<string, unknown>) {
  const db = getDb();
  const where = ['u.company_id = ?', `u.role = 'employee'`];
  const p: unknown[] = [ctx.companyId];
  const status = typeof q.status === 'string' ? q.status : '';
  if (['active', 'pending', 'inactive'].includes(status)) { where.push('u.status = ?'); p.push(status); }
  const sectorId = optId(q.sectorId, 'setor');
  const teamId = optId(q.teamId, 'equipe');
  if (sectorId) { where.push('u.sector_id = ?'); p.push(sectorId); }
  if (teamId) { where.push('u.team_id = ?'); p.push(teamId); }
  const search = typeof q.search === 'string' ? q.search.trim().slice(0, 80) : '';
  if (search) {
    where.push(`(LOWER(u.name) LIKE ? ESCAPE '!' OR LOWER(u.email) LIKE ? ESCAPE '!' OR LOWER(COALESCE(u.job_title, '')) LIKE ? ESCAPE '!')`);
    p.push(like(search), like(search), like(search));
  }
  const pageSize = Math.min(100, Math.max(5, Number(q.pageSize) || 25));
  const page = Math.max(1, Number(q.page) || 1);
  const keys = weekKeys(4);

  const total = Number((await db.query<any>(`SELECT COUNT(*) AS n FROM users u WHERE ${where.join(' AND ')}`, p))[0].n);
  const rows = await db.query<any>(
    `SELECT u.id, u.name, u.email, u.job_title, u.phone, u.sector_id, u.team_id, u.status, u.created_at,
            s.name AS sector_name, t.name AS team_name,
            (SELECT MAX(c.created_at) FROM checkins c WHERE c.company_id = u.company_id AND c.user_id = u.id) AS last_checkin,
            (SELECT COUNT(DISTINCT c.week_key) FROM checkins c
               WHERE c.company_id = u.company_id AND c.user_id = u.id AND c.week_key IN (${inList(keys.length)})) AS weeks_done
       FROM users u
       LEFT JOIN sectors s ON s.id = u.sector_id AND s.company_id = u.company_id
       LEFT JOIN teams t ON t.id = u.team_id AND t.company_id = u.company_id
      WHERE ${where.join(' AND ')}
      ORDER BY u.name LIMIT ? OFFSET ?`, [...keys, ...p, pageSize, (page - 1) * pageSize]);

  // Somente METADADOS de participação (quando enviou). Nunca respostas individuais.
  return {
    total, page, pageSize,
    items: rows.map(r => ({
      id: r.id, name: r.name, email: r.email, jobTitle: r.job_title, phone: r.phone,
      sectorId: r.sector_id, sectorName: r.sector_name, teamId: r.team_id, teamName: r.team_name,
      status: r.status, createdAt: toIso(r.created_at), lastCheckinAt: toIso(r.last_checkin),
      participation: { weeksDone: Number(r.weeks_done), weeksTotal: keys.length },
    })),
  };
}

export async function createEmployee(ctx: Ctx, body: Record<string, unknown>) {
  const name = str(body.name, 'o nome', { min: 3, max: 160 });
  const mail = vEmail(body.email);
  const jobTitle = str(body.jobTitle, 'o cargo', { max: 120 });
  const phone = vPhone(body.phone);
  const sectorId = vId(body.sectorId, 'setor');
  const teamId = vId(body.teamId, 'equipe');
  await assertSectorTeam(ctx.companyId, sectorId, teamId);
  try {
    const r = await getDb().run(
      `INSERT INTO users (company_id, sector_id, team_id, name, email, password_hash, role, job_title, phone, status, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, 'employee', ?, ?, 'pending', ?)`,
      [ctx.companyId, sectorId, teamId, name, mail, jobTitle, phone, nowSql()]);
    await audit(ctx.companyId, ctx.userId, 'employee_created', `Usuário ${r.insertId}`);
    return { id: r.insertId, status: 'pending' };
  } catch (e) {
    if (isDuplicateError(e)) throw conflict('Já existe um usuário com este e-mail nesta empresa.', 'email_taken');
    throw e;
  }
}

export async function updateEmployee(ctx: Ctx, userId: number, body: Record<string, unknown>) {
  const db = getDb();
  const cur = (await db.query<any>('SELECT * FROM users WHERE company_id = ? AND id = ?', [ctx.companyId, userId]))[0];
  if (!cur) throw notFound('Colaborador não encontrado.');
  const sets: string[] = []; const p: unknown[] = [];
  const set = (col: string, v: unknown) => { sets.push(`${col} = ?`); p.push(v); };

  if (body.name !== undefined) set('name', str(body.name, 'o nome', { min: 3, max: 160 }));
  if (body.jobTitle !== undefined) set('job_title', str(body.jobTitle, 'o cargo', { max: 120 }));
  if (body.phone !== undefined) set('phone', vPhone(body.phone));
  if (body.sectorId !== undefined || body.teamId !== undefined) {
    const sectorId = body.sectorId !== undefined ? vId(body.sectorId, 'setor') : cur.sector_id;
    const teamId = body.teamId !== undefined ? vId(body.teamId, 'equipe') : (body.sectorId !== undefined ? null : cur.team_id);
    await assertSectorTeam(ctx.companyId, sectorId, teamId);
    set('sector_id', sectorId); set('team_id', teamId);
  }
  if (body.status !== undefined) {
    if (userId === ctx.userId) throw forbidden('Você não pode alterar o próprio status.');
    const st = String(body.status);
    if (st === 'inactive') set('status', 'inactive');
    else if (st === 'active') set('status', cur.password_hash ? 'active' : 'pending'); // sem senha = ainda pendente
    else throw bad('Status inválido.');
  }
  if (!sets.length) throw bad('Nada para atualizar.');
  await db.run(`UPDATE users SET ${sets.join(', ')} WHERE company_id = ? AND id = ?`, [...p, ctx.companyId, userId]);
  await audit(ctx.companyId, ctx.userId, 'employee_updated', `Usuário ${userId}: ${sets.map(s => s.split(' ')[0]).join(', ')}`);
  return { id: userId };
}
