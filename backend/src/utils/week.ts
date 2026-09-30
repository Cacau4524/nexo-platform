/** Chave de semana ISO-8601 (ex.: 2026-W39), opcionalmente N semanas no passado. */
export function isoWeekKey(d: Date, weeksAgo = 0): string {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() - weeksAgo * 7));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day); // quinta-feira da semana ISO
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Chaves das `n` semanas ISO terminando `offset` semanas atrás, da MAIS ANTIGA para a mais recente.
 * weekKeys(4)    → últimas 4 semanas (incluindo a atual)
 * weekKeys(4, 4) → as 4 semanas imediatamente anteriores (período de comparação)
 */
export function weekKeys(n: number, offset = 0, from = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => isoWeekKey(from, offset + n - 1 - i));
}

/** "2026-W39" → "S39" (rótulo curto para gráficos). */
export const weekLabel = (key: string) => 'S' + key.split('-W')[1];
