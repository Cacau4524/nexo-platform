import { env } from '../config/env';
import { HttpError } from '../utils/validate';

/**
 * Chamada ao provedor de IA. Roda SOMENTE no backend: a chave (AI_API_KEY) nunca é enviada
 * ao navegador, nem aparece em logs ou respostas.
 * Suporta Anthropic (Messages API) e qualquer API compatível com OpenAI (/chat/completions).
 */
export async function callModel(system: string, user: string, maxTokens = 1600): Promise<string> {
  if (!env.ai.apiKey) throw new HttpError(503, 'ai_not_configured', 'A IA ainda não foi configurada neste ambiente (defina AI_API_KEY no backend).');

  const isAnthropic = env.ai.provider === 'anthropic';
  const url = env.ai.apiUrl || (isAnthropic ? 'https://api.anthropic.com/v1/messages' : 'https://api.openai.com/v1/chat/completions');
  const u = new URL(url);
  if (u.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(u.hostname)) {
    throw new HttpError(500, 'ai_misconfigured', 'AI_API_URL precisa usar HTTPS.');
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let body: unknown;
  if (isAnthropic) {
    headers['x-api-key'] = env.ai.apiKey;
    headers['anthropic-version'] = '2023-06-01';
    body = { model: env.ai.model, max_tokens: maxTokens, temperature: 0.2, system, messages: [{ role: 'user', content: user }] };
  } else {
    headers.Authorization = `Bearer ${env.ai.apiKey}`;
    body = {
      model: env.ai.model, temperature: 0.2, max_tokens: maxTokens, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.ai.timeoutMs);
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
    if (!res.ok) {
      // Loga só o status (o corpo pode ecoar dados do pedido).
      console.error(`[NEXO] Provedor de IA respondeu HTTP ${res.status}`);
      throw new HttpError(502, 'ai_unavailable', res.status === 401 || res.status === 403
        ? 'A chave da IA foi recusada pelo provedor. Verifique AI_API_KEY no backend.'
        : 'O provedor de IA não conseguiu responder agora. Tente novamente em instantes.');
    }
    const data: any = await res.json();
    const text: unknown = isAnthropic
      ? (data?.content ?? []).filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('')
      : data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw new HttpError(502, 'ai_bad_response', 'A IA devolveu uma resposta vazia.');
    return text;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    const aborted = (e as Error).name === 'AbortError';
    console.error('[NEXO] Falha ao chamar a IA:', aborted ? 'timeout' : (e as Error).message);
    throw new HttpError(502, 'ai_unavailable', aborted ? 'A IA demorou demais para responder. Tente novamente.' : 'Não foi possível contatar o provedor de IA.');
  } finally {
    clearTimeout(timer);
  }
}

/** Extrai o primeiro objeto JSON de um texto (o modelo às vezes envolve em ```json). */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  const a = text.indexOf('{'); const b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    const v = JSON.parse(text.slice(a, b + 1));
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
  } catch { return null; }
}
