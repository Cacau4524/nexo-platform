import crypto from 'crypto';

// Sem 0/O/1/I/L para evitar confusão ao digitar.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function randomCompanyCode(): string {
  const bytes = crypto.randomBytes(8);
  const chars = Array.from(bytes, b => ALPHABET[b % ALPHABET.length]);
  return `NX-${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}`;
}

/** "nx 7kq2 m9ab" → "NX-7KQ2-M9AB". Textos que não parecem código são só normalizados em maiúsculas. */
export function normalizeCode(s: string): string {
  const c = s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^NX[A-Z0-9]{8}$/.test(c) ? `NX-${c.slice(2, 6)}-${c.slice(6)}` : c;
}
