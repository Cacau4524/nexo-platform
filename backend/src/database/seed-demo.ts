/**
 * Dados de DEMONSTRAÇÃO (opcional): `npm run seed:demo`.
 * Cria 2 empresas independentes com setores, equipes, colaboradores e ~8 semanas de check-ins gravados
 * no banco (não existe nenhum número fixo na aplicação). Recusa rodar em produção.
 * Senha de todos os usuários de demonstração: nexo1234
 */
import { env } from '../config/env';
import { openDb, nowSql } from './db';
import { migrate } from './schema';
import { hashPassword } from '../utils/password';
import { nameKey } from '../utils/validate';
import { randomCompanyCode } from '../utils/codes';
import { INDICATORS } from '../domain';
import { isoWeekKey } from '../utils/week';

function rng(seed: number) {
  return () => { let t = (seed += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const FIRST = ['Ana', 'Bruno', 'Carla', 'Diego', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Karina', 'Lucas', 'Mariana', 'Nicolas', 'Olívia', 'Pedro', 'Rafaela', 'Sérgio', 'Tatiana', 'Vitor', 'Beatriz', 'Caio', 'Daniela', 'Enzo', 'Fernanda', 'Gustavo', 'Helena', 'Igor', 'Júlia', 'Leandro', 'Larissa', 'Matheus'];
const LAST = ['Almeida', 'Barbosa', 'Cardoso', 'Dias', 'Ferreira', 'Gomes', 'Lima', 'Moreira', 'Nunes', 'Oliveira', 'Pereira', 'Rocha', 'Santos', 'Teixeira', 'Vieira', 'Costa'];
const slug = (s: string) => nameKey(s).replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');

interface Profile { carga: number; pressao: number; drift: number } // nível base 1–5 e deriva semanal da carga/pressão
interface TeamSeed { name: string; size: number; jobTitle: string; profile: Profile }
interface CompanySeed { name: string; domain: string; sectors: Record<string, TeamSeed[]> }

const COMPANIES: CompanySeed[] = [
  { name: 'Hospital Exemplo', domain: 'hospitalexemplo.test', sectors: {
    'Emergência': [{ name: 'Plantão A', size: 8, jobTitle: 'Enfermeira', profile: { carga: 3.6, pressao: 3.5, drift: 0.14 } }, { name: 'Plantão B', size: 7, jobTitle: 'Técnico de enfermagem', profile: { carga: 3.5, pressao: 3.4, drift: 0.12 } }],
    'UTI': [{ name: 'Equipe A', size: 7, jobTitle: 'Técnico de enfermagem', profile: { carga: 3.3, pressao: 3.2, drift: 0.04 } }, { name: 'Equipe B', size: 6, jobTitle: 'Enfermeiro', profile: { carga: 3.2, pressao: 3.1, drift: 0.03 } }],
    'Enfermagem': [{ name: 'Equipe A', size: 6, jobTitle: 'Enfermeira', profile: { carga: 2.9, pressao: 2.8, drift: 0 } }, { name: 'Equipe B', size: 6, jobTitle: 'Técnico de enfermagem', profile: { carga: 2.8, pressao: 2.8, drift: 0 } }],
    'Administrativo': [{ name: 'Financeiro', size: 6, jobTitle: 'Analista', profile: { carga: 2.4, pressao: 2.3, drift: -0.01 } }, { name: 'RH', size: 3, jobTitle: 'Assistente', profile: { carga: 2.5, pressao: 2.4, drift: 0 } }],
    'Centro Cirúrgico': [{ name: 'Equipe Única', size: 6, jobTitle: 'Instrumentador', profile: { carga: 3.0, pressao: 3.3, drift: 0.02 } }],
  } },
  { name: 'Nexus Tecnologia', domain: 'nexustec.test', sectors: {
    'Desenvolvimento': [{ name: 'Plataforma', size: 8, jobTitle: 'Desenvolvedor', profile: { carga: 3.7, pressao: 3.6, drift: 0.1 } }, { name: 'Mobile', size: 6, jobTitle: 'Desenvolvedora', profile: { carga: 3.2, pressao: 3.1, drift: 0.03 } }],
    'Comercial': [{ name: 'Inside Sales', size: 7, jobTitle: 'Executivo de contas', profile: { carga: 3.4, pressao: 3.7, drift: 0.05 } }],
    'Suporte': [{ name: 'Atendimento', size: 6, jobTitle: 'Analista de suporte', profile: { carga: 3.0, pressao: 2.9, drift: -0.04 } }],
  } },
];

const WEEKS = 8;

async function main() {
  if (env.isProd) { console.error('[seed] Recusado: NODE_ENV=production.'); process.exit(1); }
  const db = await openDb();
  await migrate(db);
  const hash = await hashPassword('nexo1234');
  const out: string[] = [];

  for (const [ci, comp] of COMPANIES.entries()) {
    if ((await db.query('SELECT id FROM companies WHERE name_key = ?', [nameKey(comp.name)])).length) { out.push(`(já existe) ${comp.name}`); continue; }
    const rand = rng(1000 + ci);
    const now = nowSql();
    const code = randomCompanyCode();
    const cid = (await db.run('INSERT INTO companies (name, name_key, code, status, self_signup, created_at) VALUES (?, ?, ?, ?, 1, ?)', [comp.name, nameKey(comp.name), code, 'active', now])).insertId;
    await db.run(`INSERT INTO users (company_id, name, email, password_hash, role, job_title, status, created_at) VALUES (?, ?, ?, ?, 'manager', 'Gestor', 'active', ?)`,
      [cid, `Gestor ${comp.name}`, `gestor@${comp.domain}`, hash, now]);

    let n = 0; let firstEmployee = '';
    for (const [sectorName, teams] of Object.entries(comp.sectors)) {
      const sid = (await db.run('INSERT INTO sectors (company_id, name, created_at) VALUES (?, ?, ?)', [cid, sectorName, now])).insertId;
      for (const t of teams) {
        const tid = (await db.run('INSERT INTO teams (company_id, sector_id, name, created_at) VALUES (?, ?, ?, ?)', [cid, sid, t.name, now])).insertId;
        for (let i = 0; i < t.size; i++) {
          const name = `${FIRST[(n * 7 + ci) % FIRST.length]} ${LAST[(n * 5 + 3) % LAST.length]}`;
          const email = `${slug(name)}.${n}@${comp.domain}`;
          if (!firstEmployee) firstEmployee = email;
          // ~1 em cada 8 colaboradores ainda não criou a conta (pré-cadastrado) e ~1 em 12 nunca participa.
          const pending = n % 8 === 7;
          const uid = (await db.run(
            `INSERT INTO users (company_id, sector_id, team_id, name, email, password_hash, role, job_title, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'employee', ?, ?, ?)`,
            [cid, sid, tid, name, email, pending ? null : hash, t.jobTitle, pending ? 'pending' : 'active', now])).insertId;
          n++;
          if (pending || n % 12 === 0) continue;
          for (let w = WEEKS - 1; w >= 0; w--) {
            if (rand() > 0.82) continue; // ~82% de chance de participar em cada semana
            const step = WEEKS - 1 - w; // 0 = mais antiga
            const wk = isoWeekKey(new Date(), w);
            const created = nowSql(new Date(Date.now() - w * 7 * 86400000 - Math.floor(rand() * 4) * 86400000));
            const cin = (await db.run('INSERT INTO checkins (company_id, user_id, sector_id, team_id, week_key, comment, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)', [cid, uid, sid, tid, wk, created])).insertId;
            for (const ind of INDICATORS) {
              const base = ind.key === 'carga' ? t.profile.carga + t.profile.drift * step
                : ind.key === 'pressao' ? t.profile.pressao + t.profile.drift * step
                  : ind.key === 'humor' ? 3.6 - t.profile.drift * step * 0.8 - (t.profile.carga - 3) * 0.3
                    : ind.key === 'lideranca' || ind.key === 'apoio_equipe' ? 3.4 - (t.profile.carga - 3) * 0.25
                      : ind.key === 'tempo' ? 3.4 - (t.profile.carga - 3) * 0.6 - t.profile.drift * step * 0.5
                        : 3.3 - (t.profile.pressao - 3) * 0.2;
              const v = Math.max(1, Math.min(5, Math.round(base + (rand() - 0.5) * 1.6)));
              await db.run('INSERT INTO checkin_answers (company_id, checkin_id, indicator, value) VALUES (?, ?, ?, ?)', [cid, cin, ind.key, v]);
            }
          }
        }
      }
    }
    out.push(`${comp.name}: código ${code} · gestor gestor@${comp.domain} · colaborador ${firstEmployee} · ${n} colaboradores`);
  }
  console.log('\n[seed] Concluído. Senha de todos: nexo1234\n' + out.map(l => ' - ' + l).join('\n'));
  await db.close();
}
main().catch(e => { console.error('[seed] Falha:', e); process.exit(1); });
