import type { Db } from './db';

const SCHEMA_VERSION = '2';

/**
 * Isolamento entre empresas no PRÓPRIO BANCO:
 *  - toda tabela de negócio tem company_id;
 *  - chaves estrangeiras COMPOSTAS (id, company_id) impedem, por exemplo, que uma
 *    equipe aponte para um setor de outra empresa, ou um check-in para um usuário de outra empresa.
 */
function tables(d: 'mysql' | 'sqlite') {
  const PK = d === 'mysql' ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const TS = d === 'mysql' ? 'DATETIME' : 'TEXT';
  const BIG = d === 'mysql' ? 'MEDIUMTEXT' : 'TEXT';
  const T = (name: string, body: string, indexes: string[] = []) => ({
    name, indexes,
    sql: `CREATE TABLE IF NOT EXISTS ${name} (${body})`,
    suffix: d === 'mysql' ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci' : '',
  });

  return [
    T('schema_meta', `k VARCHAR(40) PRIMARY KEY, v VARCHAR(40) NOT NULL`),
    T('companies', `
      id ${PK}, name VARCHAR(160) NOT NULL, name_key VARCHAR(160) NOT NULL UNIQUE, code VARCHAR(24) NOT NULL UNIQUE,
      status VARCHAR(12) NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
      self_signup TINYINT NOT NULL DEFAULT 1, created_at ${TS} NOT NULL`),
    T('sectors', `
      id ${PK}, company_id INT NOT NULL, name VARCHAR(120) NOT NULL, created_at ${TS} NOT NULL,
      UNIQUE (id, company_id), UNIQUE (company_id, name),
      FOREIGN KEY (company_id) REFERENCES companies(id)`),
    T('teams', `
      id ${PK}, company_id INT NOT NULL, sector_id INT NOT NULL, name VARCHAR(120) NOT NULL, created_at ${TS} NOT NULL,
      UNIQUE (id, company_id), UNIQUE (company_id, sector_id, name),
      FOREIGN KEY (sector_id, company_id) REFERENCES sectors(id, company_id)`, ['company_id, sector_id']),
    T('users', `
      id ${PK}, company_id INT NOT NULL, sector_id INT NULL, team_id INT NULL,
      name VARCHAR(160) NOT NULL, email VARCHAR(190) NOT NULL, password_hash VARCHAR(255) NULL,
      role VARCHAR(12) NOT NULL DEFAULT 'employee' CHECK (role IN ('employee','manager')),
      job_title VARCHAR(120) NULL, phone VARCHAR(30) NULL,
      status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','inactive')),
      theme VARCHAR(8) NULL, created_at ${TS} NOT NULL, last_login_at ${TS} NULL,
      UNIQUE (id, company_id), UNIQUE (company_id, email),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (sector_id, company_id) REFERENCES sectors(id, company_id),
      FOREIGN KEY (team_id, company_id) REFERENCES teams(id, company_id)`,
      ['company_id, role, status', 'company_id, sector_id', 'company_id, team_id']),
    T('checkins', `
      id ${PK}, company_id INT NOT NULL, user_id INT NOT NULL, sector_id INT NULL, team_id INT NULL,
      week_key VARCHAR(10) NOT NULL, comment ${BIG} NULL, created_at ${TS} NOT NULL,
      UNIQUE (id, company_id),
      FOREIGN KEY (user_id, company_id) REFERENCES users(id, company_id) ON DELETE CASCADE,
      FOREIGN KEY (sector_id, company_id) REFERENCES sectors(id, company_id),
      FOREIGN KEY (team_id, company_id) REFERENCES teams(id, company_id)`,
      ['company_id, week_key', 'company_id, user_id', 'company_id, sector_id, week_key', 'company_id, team_id, week_key']),
    T('checkin_answers', `
      id ${PK}, company_id INT NOT NULL, checkin_id INT NOT NULL, indicator VARCHAR(40) NOT NULL, value TINYINT NOT NULL,
      FOREIGN KEY (checkin_id, company_id) REFERENCES checkins(id, company_id) ON DELETE CASCADE`,
      ['company_id, indicator', 'checkin_id']),
    T('comment_analyses', `
      id ${PK}, company_id INT NOT NULL, checkin_id INT NOT NULL, themes ${BIG} NOT NULL,
      intensity VARCHAR(10) NOT NULL, recurrence VARCHAR(10) NOT NULL, context TEXT NOT NULL,
      provider VARCHAR(20) NOT NULL, created_at ${TS} NOT NULL,
      FOREIGN KEY (checkin_id, company_id) REFERENCES checkins(id, company_id) ON DELETE CASCADE`, ['checkin_id']),
    T('ai_insights', `
      id ${PK}, company_id INT NOT NULL, scope_type VARCHAR(10) NOT NULL, sector_id INT NULL, team_id INT NULL,
      period_weeks INT NOT NULL, week_from VARCHAR(10) NOT NULL, week_to VARCHAR(10) NOT NULL,
      input_json ${BIG} NOT NULL, result_json ${BIG} NOT NULL, attention_level VARCHAR(10) NOT NULL,
      provider VARCHAR(20) NOT NULL, model VARCHAR(80) NOT NULL, requested_by INT NULL, created_at ${TS} NOT NULL,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (sector_id, company_id) REFERENCES sectors(id, company_id),
      FOREIGN KEY (team_id, company_id) REFERENCES teams(id, company_id)`, ['company_id, created_at']),
    T('interventions', `
      id ${PK}, company_id INT NOT NULL, sector_id INT NULL, team_id INT NULL, indicator VARCHAR(40) NOT NULL,
      problem TEXT NOT NULL, action TEXT NOT NULL, owner VARCHAR(120) NOT NULL, due_date VARCHAR(10) NOT NULL,
      status VARCHAR(14) NOT NULL DEFAULT 'planejada' CHECK (status IN ('planejada','em_andamento','concluida')),
      created_by INT NULL, created_at ${TS} NOT NULL, UNIQUE (id, company_id),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (sector_id, company_id) REFERENCES sectors(id, company_id),
      FOREIGN KEY (team_id, company_id) REFERENCES teams(id, company_id)`, ['company_id, status']),
    T('intervention_results', `
      id ${PK}, company_id INT NOT NULL, intervention_id INT NOT NULL, before_value DECIMAL(6,2) NOT NULL,
      after_value DECIMAL(6,2) NOT NULL, variation_pct DECIMAL(7,2) NOT NULL, observed_at VARCHAR(10) NOT NULL,
      FOREIGN KEY (intervention_id, company_id) REFERENCES interventions(id, company_id) ON DELETE CASCADE`, ['intervention_id']),
    T('audit_logs', `
      id ${PK}, company_id INT NULL, user_id INT NULL, action VARCHAR(120) NOT NULL, detail TEXT NULL, created_at ${TS} NOT NULL`,
      ['company_id, action, created_at']),
  ];
}

export async function migrate(db: Db) {
  if (db.dialect === 'mysql') {
    const legacy = await db.query<{ c: number }>(
      `SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'users'`);
    if (Number(legacy[0]?.c) > 0) {
      const col = await db.query<{ c: number }>(
        `SELECT COUNT(*) AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'company_id'`);
      if (Number(col[0]?.c) === 0) {
        throw new Error('Este banco contém o schema antigo (single-tenant) do NEXO. Use um banco novo em MYSQL_DATABASE (ex.: nexo_app).');
      }
    }
  }
  for (const t of tables(db.dialect)) {
    if (db.dialect === 'mysql') {
      // MySQL não tem CREATE INDEX IF NOT EXISTS: os índices entram na própria tabela.
      const keys = t.indexes.map((cols, i) => `KEY idx_${t.name}_${i} (${cols})`);
      const body = t.sql.slice(0, -1) + (keys.length ? ', ' + keys.join(', ') : '') + ')';
      await db.run(body + t.suffix);
    } else {
      await db.run(t.sql);
      for (const [i, cols] of t.indexes.entries()) {
        await db.run(`CREATE INDEX IF NOT EXISTS idx_${t.name}_${i} ON ${t.name} (${cols})`);
      }
    }
  }
  await db.run(db.dialect === 'mysql'
    ? `INSERT INTO schema_meta (k, v) VALUES ('version', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)`
    : `INSERT INTO schema_meta (k, v) VALUES ('version', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`, [SCHEMA_VERSION]);
}
