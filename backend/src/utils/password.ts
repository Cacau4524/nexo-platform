import crypto from 'crypto';

// scrypt (nativo do Node): hash lento e com memória alta, com salt único por senha.
// Formato armazenado: scrypt$N$r$p$salt(b64)$hash(b64)
const N = 2 ** 15, R = 8, P = 1, KEYLEN = 64;

const scrypt = (pw: string, salt: Buffer, n: number, r: number, p: number, len: number) =>
  new Promise<Buffer>((resolve, reject) =>
    crypto.scrypt(pw, salt, len, { N: n, r, p, maxmem: 128 * n * r * 2 }, (e, k) => (e ? reject(e) : resolve(k))));

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, N, R, P, KEYLEN);
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  // Sempre gasta o mesmo tempo, mesmo sem hash (conta inexistente / pendente).
  const parts = (stored || DUMMY).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p), expected.length);
  const ok = crypto.timingSafeEqual(key, expected);
  return !!stored && ok;
}

const DUMMY = ['scrypt', N, R, P, Buffer.alloc(16).toString('base64'), Buffer.alloc(KEYLEN).toString('base64')].join('$');

export const PASSWORD_MIN = 8;
export function passwordProblem(pw: unknown): string | null {
  if (typeof pw !== 'string' || pw.length < PASSWORD_MIN) return `A senha deve ter pelo menos ${PASSWORD_MIN} caracteres.`;
  if (pw.length > 128) return 'A senha é longa demais.';
  if (/^\d+$/.test(pw)) return 'A senha não pode conter apenas números.';
  return null;
}
