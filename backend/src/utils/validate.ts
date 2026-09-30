/** Validação de entrada. Lançam ValidationError → resposta 400 padronizada. */
export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const bad = (message: string, code = 'invalid_input') => new HttpError(400, code, message);
export const notFound = (message = 'Recurso não encontrado.') => new HttpError(404, 'not_found', message);
export const forbidden = (message = 'Seu perfil não tem acesso a este recurso.') => new HttpError(403, 'forbidden', message);
export const conflict = (message: string, code = 'conflict') => new HttpError(409, code, message);

export function str(v: unknown, field: string, opts: { min?: number; max: number; optional?: boolean }): string {
  const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  if (!s) {
    if (opts.optional) return '';
    throw bad(`Informe ${field}.`);
  }
  if (s.length < (opts.min ?? 1)) throw bad(`${field} é curto demais.`);
  if (s.length > opts.max) throw bad(`${field} é longo demais (máx. ${opts.max} caracteres).`);
  return s;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function email(v: unknown): string {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (!s || s.length > 190 || !EMAIL_RE.test(s)) throw bad('Informe um e-mail válido.');
  return s;
}

export function phone(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim();
  if (!/^[0-9 ()+\-]{8,20}$/.test(s)) throw bad('Telefone inválido.');
  return s;
}

export function id(v: unknown, field = 'identificador'): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw bad(`${field} inválido.`);
  return n;
}
export function optId(v: unknown, field?: string): number | null {
  return v === undefined || v === null || v === '' ? null : id(v, field);
}

/** Normaliza para comparar nomes: minúsculas, sem acentos, sem espaços duplicados. */
export const nameKey = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
