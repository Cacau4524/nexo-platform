import crypto from 'crypto';
import { env } from '../config/env';

const PREFIX = 'enc:v1:';

/** Criptografa texto livre (AES-256-GCM). Sem ENCRYPTION_KEY, devolve o texto como está. */
export function encryptText(plain: string): string {
  if (!env.encryptionKey) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', env.encryptionKey, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptText(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored; // legado / sem criptografia
  if (!env.encryptionKey) return '[comentário criptografado — chave ausente]';
  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', env.encryptionKey, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    return '[comentário ilegível]';
  }
}
