export type Role = 'employee' | 'manager';
export type Level = 'baixa' | 'moderada' | 'alta';

/**
 * Indicadores do ambiente de trabalho (NÃO são diagnósticos).
 * risk=true  → valor MAIOR significa MAIS pressão (carga, pressão).
 * risk=false → valor MAIOR significa situação melhor.
 * Para adicionar um indicador basta incluí-lo aqui: check-in, agregação e IA o acompanham.
 */
export const INDICATORS = [
  { key: 'humor', label: 'Disposição no dia', risk: false, prompt: 'Como você está hoje?', low: 'Muito mal', high: 'Muito bem', kind: 'mood' },
  { key: 'carga', label: 'Carga de trabalho', risk: true, prompt: 'Como está sua carga de trabalho?', low: 'Muito leve', high: 'Muito pesada', kind: 'scale' },
  { key: 'tempo', label: 'Tempo para as atividades', risk: false, prompt: 'Você consegue realizar suas atividades dentro do tempo disponível?', low: 'Nunca', high: 'Sempre', kind: 'scale' },
  { key: 'pressao', label: 'Pressão no trabalho', risk: true, prompt: 'Como está seu nível de pressão no trabalho?', low: 'Nenhuma pressão', high: 'Pressão intensa', kind: 'scale' },
  { key: 'apoio_equipe', label: 'Apoio da equipe', risk: false, prompt: 'Como você avalia o apoio da sua equipe?', low: 'Nenhum apoio', high: 'Apoio total', kind: 'scale' },
  { key: 'lideranca', label: 'Suporte da liderança', risk: false, prompt: 'Como você avalia o suporte da liderança?', low: 'Insatisfatório', high: 'Excelente', kind: 'scale' },
  { key: 'relacionamento', label: 'Relação com a equipe', risk: false, prompt: 'Como está sua relação com a equipe?', low: 'Tensa', high: 'Muito boa', kind: 'scale' },
  { key: 'autonomia', label: 'Autonomia', risk: false, prompt: 'Você sente que possui autonomia suficiente?', low: 'Nenhuma', high: 'Total', kind: 'scale' },
] as const;

export type IndicatorKey = (typeof INDICATORS)[number]['key'];
export const INDICATOR_KEYS: string[] = INDICATORS.map(i => i.key);
export const indicatorLabel = (key: string) => INDICATORS.find(i => i.key === key)?.label ?? key;
export const isRisk = (key: string) => !!INDICATORS.find(i => i.key === key)?.risk;

/**
 * Índice de atenção 0–100 (maior = mais atenção). Converte a média 1–5 para "pressão":
 * indicadores de risco usam o valor; os demais, a escala invertida.
 */
export function attentionIndex(key: string, avg: number): number {
  const pressure = isRisk(key) ? avg : 6 - avg;
  return Math.round(((pressure - 1) / 4) * 100 * 10) / 10;
}
export const levelOf = (index: number): Level => (index >= 70 ? 'alta' : index >= 55 ? 'moderada' : 'baixa');

/** Nível de um grupo: pelo índice composto, elevado a pelo menos "moderada" se algum indicador estiver "alta". */
export function groupLevel(indexes: number[]): { index: number; level: Level } {
  if (!indexes.length) return { index: 0, level: 'baixa' };
  const index = Math.round((indexes.reduce((a, b) => a + b, 0) / indexes.length) * 10) / 10;
  let level = levelOf(index);
  if (level === 'baixa' && indexes.some(i => levelOf(i) === 'alta')) level = 'moderada';
  return { index, level };
}
