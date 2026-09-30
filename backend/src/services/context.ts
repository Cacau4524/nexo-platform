import type { Role } from '../domain';
import { getDb, nowSql } from '../database/db';

/**
 * Contexto da requisição, montado SOMENTE pelo middleware de autenticação a partir do banco.
 * Nenhum serviço aceita companyId vindo do cliente: o tenant é sempre ctx.companyId.
 */
export interface Ctx { companyId: number; userId: number; role: Role }

export async function audit(companyId: number | null, userId: number | null, action: string, detail = '') {
  try {
    await getDb().run('INSERT INTO audit_logs (company_id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)',
      [companyId, userId, action, detail.slice(0, 500), nowSql()]);
  } catch (e) {
    console.error('[NEXO] Falha ao gravar auditoria:', (e as Error).message);
  }
}

export const isDuplicateError = (e: unknown) => /UNIQUE|Duplicate entry|ER_DUP_ENTRY/i.test((e as Error)?.message ?? '');
