import fs from 'fs';
import path from 'path';
import { env } from '../config/env';

export type Row = Record<string, any>;
export interface RunResult { insertId: number; changes: number }

/** Interface única sobre MySQL (produção) e SQLite (desenvolvimento/testes). SQL sempre com `?`. */
export interface Db {
  dialect: 'mysql' | 'sqlite';
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<RunResult>;
  /** Transação atômica. Dentro do callback use SOMENTE o `Db` recebido. */
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const clean = (params: unknown[] = []) => params.map(p => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p));

/** Monta "?, ?, ?" para cláusulas IN. */
export const inList = (n: number) => Array.from({ length: n }, () => '?').join(', ');

// ---------------------------------------------------------------- SQLite
async function openSqlite(file: string): Promise<Db> {
  // Módulo nativo do Node >= 22.13 (sem dependências para instalar).
  const { DatabaseSync } = await import('node:sqlite');
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

  // Uma única conexão síncrona: serializamos tudo para que uma transação aberta
  // nunca receba comandos de outra requisição.
  let chain: Promise<unknown> = Promise.resolve();
  const lock = <T>(fn: () => Promise<T> | T): Promise<T> => {
    const next = chain.then(fn, fn);
    chain = next.catch(() => undefined);
    return next as Promise<T>;
  };

  const exec = (sql: string, params?: unknown[]) => raw.prepare(sql);
  const doQuery = <T>(sql: string, params?: unknown[]) => exec(sql).all(...(clean(params) as any[])) as unknown as T[];
  const doRun = (sql: string, params?: unknown[]): RunResult => {
    const r = exec(sql).run(...(clean(params) as any[]));
    return { insertId: Number(r.lastInsertRowid), changes: Number(r.changes) };
  };

  const inner: Db = {
    dialect: 'sqlite',
    query: async <T>(sql: string, params?: unknown[]) => doQuery<T>(sql, params),
    run: async (sql, params) => doRun(sql, params),
    tx: async fn => fn(inner), // já estamos dentro de uma transação
    close: async () => undefined,
  };
  return {
    dialect: 'sqlite',
    query: <T>(sql: string, params?: unknown[]) => lock(() => doQuery<T>(sql, params)),
    run: (sql, params) => lock(() => doRun(sql, params)),
    tx: <T>(fn: (db: Db) => Promise<T>) => lock(async () => {
      raw.exec('BEGIN');
      try {
        const out = await fn(inner);
        raw.exec('COMMIT');
        return out;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    }),
    close: async () => { raw.close(); },
  };
}

// ---------------------------------------------------------------- MySQL
async function openMysql(): Promise<Db> {
  const mysql = await import('mysql2/promise');
  const { database, ...base } = env.db.mysql;
  if (!/^[A-Za-z0-9_]+$/.test(database)) throw new Error('MYSQL_DATABASE inválido');
  const boot = await mysql.createConnection({ ...base, connectTimeout: 5000 });
  await boot.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await boot.end();
  const pool = mysql.createPool({ ...env.db.mysql, connectionLimit: 10, connectTimeout: 5000, dateStrings: true, charset: 'utf8mb4' });
  await pool.query('SELECT 1');

  type Q = { query: (sql: string, params?: any) => Promise<any> };
  const make = (q: Q, tx: (fn: (db: Db) => Promise<any>) => Promise<any>): Db => ({
    dialect: 'mysql',
    query: async <T>(sql: string, params?: unknown[]) => (await q.query(sql, clean(params)))[0] as T[],
    run: async (sql, params) => {
      const [r] = await q.query(sql, clean(params));
      return { insertId: Number(r.insertId ?? 0), changes: Number(r.affectedRows ?? 0) };
    },
    tx,
    close: async () => { await pool.end(); },
  });
  const root: Db = make(pool as unknown as Q, async <T>(fn: (db: Db) => Promise<T>) => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const inner: Db = make(conn as unknown as Q, async f => f(inner));
      const out = await fn(inner);
      await conn.commit();
      return out;
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  });
  return root;
}

let current: Db | null = null;
export async function openDb(): Promise<Db> {
  if (current) return current;
  current = env.db.client === 'mysql' ? await openMysql() : await openSqlite(env.db.sqlitePath);
  return current;
}
export async function openSqliteMemory(): Promise<Db> { return openSqlite(':memory:'); }
export function setDb(db: Db) { current = db; }
export function getDb(): Db {
  if (!current) throw new Error('Banco de dados não inicializado.');
  return current;
}

/** Datas sempre geradas pelo app em UTC ("YYYY-MM-DD HH:MM:SS"): iguais em MySQL e SQLite. */
export const nowSql = (d = new Date()) => d.toISOString().slice(0, 19).replace('T', ' ');
export const toIso = (s: string | null | undefined) => (s ? (s.includes('T') ? s : s.replace(' ', 'T') + 'Z') : null);
