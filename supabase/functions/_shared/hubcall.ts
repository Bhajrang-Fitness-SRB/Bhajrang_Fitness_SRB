// Network layer for the AI Agent Hub: talks to Gemini and OpenAI-compatible providers (Groq, OpenRouter, Cerebras, Mistral).
import { catalogEntry, pickModel, type CallResult, type ProviderState } from './hub.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const modelCache = new Map<string, { model: string; at: number }>();
const TIMEOUT_MS = 30_000;

async function discoverModel(key: string): Promise<string | null> {
  const entry = catalogEntry(key); if (!entry) return null;
  const hit = modelCache.get(key);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.model;
  const secret = env(entry.envKey); if (!secret) return null;
  try {
    let ids: string[] = [];
    if (entry.style === 'gemini') {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100', { headers: { 'x-goog-api-key': secret }, signal: AbortSignal.timeout(15_000) });
      if (!r.ok) return null;
      const d = await r.json();
      ids = (d.models ?? []).filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes('generateContent')).map((m: { name: string }) => m.name.replace('models/', ''));
    } else {
      const r = await fetch(`${entry.base}/models`, { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(15_000) });
      if (!r.ok) return null;
      const d = await r.json();
      ids = (d.data ?? []).map((m: { id: string }) => m.id);
    }
    const model = pickModel(ids, entry);
    if (model) modelCache.set(key, { model, at: Date.now() });
    return model;
  } catch { return null; }
}

export async function callProvider(p: ProviderState, system: string, input: string, maxTokens = 1400): Promise<CallResult> {
  const entry = catalogEntry(p.key); if (!entry) return { ok: false, status: 400, body: 'unknown provider' };
  const secret = env(entry.envKey); if (!secret) return { ok: false, status: 401, body: 'no key configured' };
  const model = p.model || (await discoverModel(p.key));
  if (!model) return { ok: false, status: 503, body: 'could not find a usable model (the provider may be down)' };

  try {
    let res: Response;
    if (entry.style === 'gemini') {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': secret }, signal: AbortSignal.timeout(TIMEOUT_MS),
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: input }] }], generationConfig: { temperature: 0.6, maxOutputTokens: maxTokens } }),
      });
    } else {
      res = await fetch(`${entry.base}/chat/completions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(TIMEOUT_MS),
        body: JSON.stringify({ model, temperature: 0.6, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: input }] }),
      });
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const ra = Number(res.headers.get('retry-after'));
      return { ok: false, status: res.status, body, retryAfter: Number.isFinite(ra) && ra > 0 ? ra : null };
    }
    const d = await res.json();
    const text: string = entry.style === 'gemini'
      ? (d?.candidates?.[0]?.content?.parts ?? []).map((x: { text?: string }) => x.text ?? '').join('')
      : (d?.choices?.[0]?.message?.content ?? '');
    if (!text.trim()) return { ok: false, status: 422, body: `empty answer (${d?.candidates?.[0]?.finishReason ?? d?.promptFeedback?.blockReason ?? d?.choices?.[0]?.finish_reason ?? 'unknown'})` };
    return { ok: true, text: text.trim(), model };
  } catch (e) {
    return { ok: false, status: 0, body: String(e).slice(0, 200) };
  }
}
