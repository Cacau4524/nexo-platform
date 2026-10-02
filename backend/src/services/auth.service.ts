import { getDb, nowSql, toIso } from '../database/db';
import { hashPassword, passwordProblem, verifyPassword } from '../utils/password';
import { randomCompanyCode, normalizeCode } from '../utils/codes';
import { bad, conflict, email as vEmail, forbidden, HttpError, id as vId, nameKey, phone as vPhone, str } from '../utils/validate';
import { audit, isDuplicateError } from './context';
import { env } from '../config/env';

export interface CompanyRow { id: number; name: string; code: string; status: string; self_signup: number; created_at: string }

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const fails = new Map<string, { n: number; until: number }>();

// ------------------------------------------------------------------ empresa
/** Localiza a empresa por CÓDIGO ou por NOME EXATO (sem busca parcial → não permite listar empresas). */
export async function findCompany(query: unknown): Promise<CompanyRow | null> {
  const q = typeof query === 'string' ? query.trim().slice(0, 160) : '';
  if (q.length < 2) return null;
  const rows = await getDb().query<CompanyRow>(
    `SELECT * FROM companies WHERE status = 'active' AND (code = ? OR name_key = ?) LIMIT 1`, [normalizeCode(q), nameKey(q)]);
  return rows[0] ?? null;
}

export async function companyPublicInfo(company: CompanyRow) {
  const db = getDb();
  const sectors = await db.query<{ id: number; name: string }>(
    'SELECT id, name FROM sectors WHERE company_id = ? ORDER BY name', [company.id]);
  const teams = await db.query<{ id: number; sector_id: number; name: string }>(
    'SELECT id, sector_id, name FROM teams WHERE company_id = ? ORDER BY name', [company.id]);
  return {
    name: company.name,
    code: company.code,
    selfSignup: !!company.self_signup,
    sectors: sectors.map(s => ({ id: s.id, name: s.name, teams: teams.filter(t => t.sector_id === s.id).map(t => ({ id: t.id, name: t.name })) })),
  };
}

// ------------------------------------------------------------------ sessão
export interface SessionUser {
  id: number; name: string; email: string; role: 'employee' | 'manager'; jobTitle: string | null; phone: string | null;
  sectorId: number | null; sectorName: string | null; teamId: number | null; teamName: string | null;
  theme: 'light' | 'dark' | null;
  company: { name: string; code?: string };
}

export async function sessionUser(companyId: number, userId: number): Promise<SessionUser | null> {
  const rows = await getDb().query<any>(
    `SELECT u.id, u.name, u.email, u.role, u.job_title, u.phone, u.sector_id, u.team_id, u.theme, c.name AS company_name, c.code AS company_code,
            s.name AS sector_name, t.name AS team_name
       FROM users u
       JOIN companies c ON c.id = u.company_id
       LEFT JOIN sectors s ON s.id = u.sector_id AND s.company_id = u.company_id
       LEFT JOIN teams t ON t.id = u.team_id AND t.company_id = u.company_id
      WHERE u.company_id = ? AND u.id = ?`, [companyId, userId]);
  const u = rows[0];
  if (!u) return null;
  return {
    id: u.id, name: u.name, email: u.email, role: u.role, jobTitle: u.job_title, phone: u.phone ?? null,
    sectorId: u.sector_id, sectorName: u.sector_name, teamId: u.team_id, teamName: u.team_name,
    theme: u.theme === 'light' || u.theme === 'dark' ? u.theme : null,
    // O código da empresa (usado para convidar pessoas) só é mostrado ao gestor.
    company: u.role === 'manager' ? { name: u.company_name, code: u.company_code } : { name: u.company_name },
  };
}

// ------------------------------------------------------------------ cadastro de empresa + gestor
export async function registerCompany(input: Record<string, unknown>) {
  if (!env.allowCompanySignup) throw forbidden('O cadastro de novas empresas está desativado neste ambiente.');
  const companyName = str(input.companyName, 'o nome da empresa', { min: 2, max: 160 });
  const name = str(input.name, 'seu nome completo', { min: 3, max: 160 });
  const mail = vEmail(input.email);
  const pw = passwordProblem(input.password);
  if (pw) throw bad(pw);
  const jobTitle = str(input.jobTitle, 'o cargo', { max: 120, optional: true }) || 'Gestor';
  const hash = await hashPassword(String(input.password));

  const db = getDb();
  let created: { companyId: number; userId: number } | null = null;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    try {
      created = await db.tx(async t => {
        const now = nowSql();
        const c = await t.run('INSERT INTO companies (name, name_key, code, status, self_signup, created_at) VALUES (?, ?, ?, ?, 1, ?)',
          [companyName, nameKey(companyName), randomCompanyCode(), 'active', now]);
        const u = await t.run(
          `INSERT INTO users (company_id, name, email, password_hash, role, job_title, status, created_at) VALUES (?, ?, ?, ?, 'manager', ?, 'active', ?)`,
          [c.insertId, name, mail, hash, jobTitle, now]);
        return { companyId: c.insertId, userId: u.insertId };
      });
    } catch (e) {
      if (!isDuplicateError(e)) throw e;
      const exists = await db.query('SELECT id FROM companies WHERE name_key = ?', [nameKey(companyName)]);
      if (exists.length) throw conflict('Já existe uma empresa cadastrada com este nome. Entre por ela ou escolha outro nome.', 'company_exists');
      // senão foi colisão do código aleatório: tenta de novo
    }
  }
  if (!created) throw new HttpError(500, 'internal', 'Não foi possível criar a empresa. Tente novamente.');
  await audit(created.companyId, created.userId, 'company_created', companyName);
  return { companyId: created.companyId, userId: created.userId };
}

// ------------------------------------------------------------------ cadastro de colaborador
export async function registerEmployee(input: Record<string, unknown>) {
  const company = await findCompany(input.company ?? input.companyCode);
  if (!company) throw new HttpError(404, 'company_not_found', 'Empresa não encontrada.');
  const name = str(input.name, 'seu nome completo', { min: 3, max: 160 });
  const mail = vEmail(input.email);
  const pw = passwordProblem(input.password);
  if (pw) throw bad(pw);
  const jobTitle = str(input.jobTitle, 'o cargo', { max: 120 });
  const phone = vPhone(input.phone);
  const sectorId = vId(input.sectorId, 'setor');
  const teamId = vId(input.teamId, 'equipe');
  const hash = await hashPassword(String(input.password));

  const db = getDb();
  await assertSectorTeam(company.id, sectorId, teamId);
  const existing = (await db.query<any>('SELECT id, role, status, sector_id, team_id, job_title FROM users WHERE company_id = ? AND email = ?', [company.id, mail]))[0];

  if (existing) {
    // Pré-cadastrado pelo gestor e ainda sem senha: a pessoa "assume" a conta.
    // Setor/equipe/cargo definidos pelo gestor prevalecem (a pessoa não se move sozinha).
    if (existing.status !== 'pending' || existing.role !== 'employee') {
      throw conflict('Já existe uma conta com este e-mail nesta empresa. Faça login.', 'email_taken');
    }
    await db.run(
      `UPDATE users SET name = ?, password_hash = ?, phone = ?, status = 'active',
              job_title = COALESCE(job_title, ?), sector_id = COALESCE(sector_id, ?), team_id = COALESCE(team_id, ?)
        WHERE company_id = ? AND id = ?`,
      [name, hash, phone, jobTitle, sectorId, teamId, company.id, existing.id]);
    await audit(company.id, existing.id, 'employee_activated', 'Conta ativada a partir de pré-cadastro');
    return { companyId: company.id, userId: existing.id as number };
  }

  if (!company.self_signup) throw forbidden('Esta empresa aceita apenas colaboradores pré-cadastrados pelo gestor. Peça o cadastro do seu e-mail.');
  try {
    const r = await db.run(
      `INSERT INTO users (company_id, sector_id, team_id, name, email, password_hash, role, job_title, phone, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'employee', ?, ?, 'active', ?)`,
      [company.id, sectorId, teamId, name, mail, hash, jobTitle, phone, nowSql()]);
    await audit(company.id, r.insertId, 'employee_registered', 'Auto-cadastro');
    return { companyId: company.id, userId: r.insertId };
  } catch (e) {
    if (isDuplicateError(e)) throw conflict('Já existe uma conta com este e-mail nesta empresa. Faça login.', 'email_taken');
    throw e;
  }
}

/** Setor e equipe precisam pertencer à MESMA empresa e a equipe precisa pertencer ao setor. */
export async function assertSectorTeam(companyId: number, sectorId: number | null, teamId: number | null) {
  const db = getDb();
  if (sectorId !== null) {
    const s = await db.query('SELECT id FROM sectors WHERE company_id = ? AND id = ?', [companyId, sectorId]);
    if (!s.length) throw bad('Setor inválido para esta empresa.');
  }
  if (teamId !== null) {
    const t = await db.query<{ sector_id: number }>('SELECT sector_id FROM teams WHERE company_id = ? AND id = ?', [companyId, teamId]);
    if (!t.length) throw bad('Equipe inválida para esta empresa.');
    if (sectorId === null || t[0].sector_id !== sectorId) throw bad('A equipe não pertence ao setor selecionado.');
  }
}

// ------------------------------------------------------------------ login
export async function login(input: Record<string, unknown>, ip = '') {
  const generic = new HttpError(401, 'invalid_credentials', 'Empresa, e-mail ou senha inválidos.');
  const mail = typeof input.email === 'string' ? input.email.trim().toLowerCase().slice(0, 190) : '';
  const password = typeof input.password === 'string' ? input.password : '';
  if (!mail || !password || password.length > 200) throw generic;
  const company = await findCompany(input.company ?? input.companyCode);
  const lockKey = `${company?.id ?? 0}:${mail}`;

  const lock = fails.get(lockKey);
  if (lock && lock.until > Date.now()) {
    throw new HttpError(429, 'locked', `Muitas tentativas. Tente novamente em ${Math.ceil((lock.until - Date.now()) / 60000)} min.`);
  }

  const user = company
    ? (await getDb().query<any>('SELECT id, password_hash, status FROM users WHERE company_id = ? AND email = ?', [company.id, mail]))[0]
    : undefined;
  const ok = await verifyPassword(password, user?.password_hash);
  if (!company || !user || !ok || user.status !== 'active') {
    const f = fails.get(lockKey) ?? { n: 0, until: 0 };
    f.n = f.until && f.until < Date.now() ? 1 : f.n + 1;
    if (f.n >= MAX_FAILS) { f.until = Date.now() + LOCK_MS; f.n = 0; }
    fails.set(lockKey, f);
    await audit(company?.id ?? null, user?.id ?? null, 'login_failed', `Tentativa falha (${ip})`);
    throw generic;
  }
  fails.delete(lockKey);
  await getDb().run('UPDATE users SET last_login_at = ? WHERE company_id = ? AND id = ?', [nowSql(), company.id, user.id]);
  await audit(company.id, user.id, 'login_ok', `Login (${ip})`);
  return { companyId: company.id, userId: user.id as number };
}

export async function setTheme(companyId: number, userId: number, theme: unknown) {
  if (theme !== 'light' && theme !== 'dark') throw bad('Tema inválido.');
  await getDb().run('UPDATE users SET theme = ? WHERE company_id = ? AND id = ?', [theme, companyId, userId]);
}

/**
 * Perfil do PRÓPRIO usuário. Todos editam nome, cargo e telefone; o gestor também edita o e-mail de acesso.
 * Setor e equipe só mudam pelo gestor (em Pessoas), para não distorcer os indicadores agregados.
 */
export async function updateProfile(companyId: number, userId: number, role: 'employee' | 'manager', body: Record<string, unknown>) {
  const db = getDb();
  const sets: string[] = []; const p: unknown[] = [];
  const set = (col: string, v: unknown) => { sets.push(`${col} = ?`); p.push(v); };
  if (body.name !== undefined) set('name', str(body.name, 'seu nome', { min: 3, max: 160 }));
  if (body.jobTitle !== undefined) set('job_title', str(body.jobTitle, 'o cargo', { max: 120, optional: true }) || null);
  if (body.phone !== undefined) set('phone', vPhone(body.phone));
  if (body.email !== undefined) {
    if (role !== 'manager') throw forbidden('Somente o gestor pode alterar o e-mail de acesso.');
    set('email', vEmail(body.email));
  }
  if (!sets.length) throw bad('Nada para atualizar.');
  try {
    await db.run(`UPDATE users SET ${sets.join(', ')} WHERE company_id = ? AND id = ?`, [...p, companyId, userId]);
  } catch (e) {
    if (isDuplicateError(e)) throw conflict('Já existe um usuário com este e-mail nesta empresa.', 'email_taken');
    throw e;
  }
  await audit(companyId, userId, 'profile_updated', sets.map(s => s.split(' ')[0]).join(', '));
}

export async function changePassword(companyId: number, userId: number, body: Record<string, unknown>) {
  const db = getDb();
  const cur = (await db.query<any>('SELECT password_hash FROM users WHERE company_id = ? AND id = ?', [companyId, userId]))[0];
  if (!cur) throw bad('Conta não encontrada.');
  if (!(await verifyPassword(String(body.currentPassword ?? ''), cur.password_hash))) throw bad('A senha atual não confere.', 'wrong_password');
  const problem = passwordProblem(body.newPassword);
  if (problem) throw bad(problem);
  await db.run('UPDATE users SET password_hash = ? WHERE company_id = ? AND id = ?', [await hashPassword(String(body.newPassword)), companyId, userId]);
  await audit(companyId, userId, 'password_changed', 'Senha alterada pelo próprio usuário');
}

export async function loadAuthUser(userId: number) {
  const rows = await getDb().query<any>(
    `SELECT u.id, u.company_id, u.role, u.status, c.status AS company_status
       FROM users u JOIN companies c ON c.id = u.company_id WHERE u.id = ?`, [userId]);
  const u = rows[0];
  if (!u || u.status !== 'active' || u.company_status !== 'active') return null;
  return { id: u.id as number, companyId: u.company_id as number, role: u.role as 'employee' | 'manager' };
}

export { toIso };
