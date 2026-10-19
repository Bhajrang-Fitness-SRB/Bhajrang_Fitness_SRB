// Free-AI pool router: tries providers in priority order, skips the ones whose free quota
// has ended (cool-down), and falls through to the next one. Pure logic + injected fetch,
// so it can be unit-tested without network access.

export type Provider = {
  id: string;
  slot_name: string;
  kind: 'openai' | 'gemini';
  base_url: string;
  models: string[];
  models_cache: string[];
  model_filter: string | null;
  priority: number;
  enabled: boolean;
  status: 'unknown' | 'ok' | 'cooldown' | 'invalid';
  cooldown_until: string | null;
  daily_limit: number | null;
  usage_day: string;
  req_today: number;
};
export type Msg = { role: 'system' | 'user' | 'assistant'; content: string };
export type Attempt = { provider: string; model: string; ok: boolean; status: number; error?: string; ms: number };
export type RecordFn = (p: Provider, r: { ok: boolean; tokens: number; error?: string; status?: 'cooldown' | 'invalid' | 'unknown'; cooldownUntil?: Date | null }) => Promise<void>;
export type RouteResult = { text: string; provider: Provider; model: string; attempts: Attempt[] };

export class AllFailed extends Error {
  attempts: Attempt[];
  constructor(msg: string, attempts: Attempt[]) { super(msg); this.attempts = attempts; }
}

export type ErrKind = 'rate' | 'quota' | 'auth' | 'model' | 'server' | 'bad';

/** Decide what a failed HTTP call means for this provider. */
export function classifyError(status: number, body: string, retryAfterSec?: number | null): { kind: ErrKind; cooldownMs: number } {
  const b = body.toLowerCase();
  const daily = /(per day|daily|quota|exhausted|billing|credit|insufficient|limit exceeded for (the )?day)/.test(b);
  if (status === 401 || status === 403) {
    // Some providers use 403 for an exhausted free tier; a plain key problem is "auth".
    if (daily && !/(invalid|incorrect|unauthor|api key)/.test(b)) return { kind: 'quota', cooldownMs: 6 * 3600e3 };
    return { kind: 'auth', cooldownMs: 0 };
  }
  if (status === 402) return { kind: 'quota', cooldownMs: 6 * 3600e3 };
  if (status === 429) {
    if (retryAfterSec && retryAfterSec > 0) return { kind: daily ? 'quota' : 'rate', cooldownMs: Math.min(retryAfterSec, 24 * 3600) * 1000 };
    return daily ? { kind: 'quota', cooldownMs: 6 * 3600e3 } : { kind: 'rate', cooldownMs: 90e3 };
  }
  if (status === 404 || (status === 400 && /model/.test(b) && /(not found|does not exist|decommission|unsupported|not supported|invalid)/.test(b))) return { kind: 'model', cooldownMs: 0 };
  if (status >= 500 || status === 0 || status === 408) return { kind: 'server', cooldownMs: 120e3 };
  return { kind: 'bad', cooldownMs: 0 };
}

const BAD_MODEL = /(whisper|tts|guard|embed|moderation|image|rerank|audio|orpheus|playai|transcribe|vision-preview|safety|dall|stable|clip)/i;
function modelScore(id: string): number {
  let s = 0;
  if (/(405b|253b|235b|120b|large|pro|ultra|opus|sonnet)/i.test(id)) s += 4;
  if (/(70b|72b|32b|gpt-oss|llama-3\.3|llama-4|qwen3|deepseek|versatile|maverick|flash|medium)/i.test(id)) s += 3;
  if (/(8b|7b|small|mini|lite|instruct)/i.test(id)) s += 1;
  if (/(preview|exp|beta)/i.test(id)) s -= 1;
  return s;
}
export function pickModels(ids: string[], filter: string | null, max = 3): string[] {
  let re: RegExp | null = null;
  try { re = filter ? new RegExp(filter, 'i') : null; } catch { re = null; }
  const ok = ids.filter(id => !BAD_MODEL.test(id) && (!re || re.test(id)));
  return [...new Set(ok)].sort((a, b) => modelScore(b) - modelScore(a)).slice(0, max);
}

export function isAvailable(p: Provider, now: Date): { ok: boolean; why?: string } {
  if (!p.enabled) return { ok: false, why: 'switched off' };
  if (p.status === 'invalid') return { ok: false, why: 'key rejected' };
  if (p.cooldown_until && new Date(p.cooldown_until) > now) return { ok: false, why: 'free limit reached, resting' };
  const today = now.toISOString().slice(0, 10);
  if (p.daily_limit != null && p.usage_day === today && p.req_today >= p.daily_limit) return { ok: false, why: 'your daily cap reached' };
  return { ok: true };
}

type FetchFn = typeof fetch;
const TIMEOUT_MS = 45_000;

async function timedFetch(f: FetchFn, url: string, init: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try { return await f(url, { ...init, signal: ctl.signal }); } finally { clearTimeout(t); }
}

export async function discoverModels(p: Provider, key: string, f: FetchFn = fetch): Promise<string[]> {
  try {
    if (p.kind === 'gemini') {
      const r = await timedFetch(f, `${p.base_url || 'https://generativelanguage.googleapis.com/v1beta'}/models?pageSize=100`, { headers: { 'x-goog-api-key': key } });
      if (!r.ok) return [];
      const d = await r.json();
      const ids: string[] = (d.models ?? [])
        .filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m: { name: string }) => m.name.replace('models/', ''));
      return pickModels(ids.filter(i => /^gemini/i.test(i) && !/(live|thinking|tts|image)/i.test(i)), p.model_filter ?? 'flash|pro', 3);
    }
    const r = await timedFetch(f, `${p.base_url.replace(/\/$/, '')}/models`, { headers: { Authorization: `Bearer ${key}` } });
    if (!r.ok) return [];
    const d = await r.json();
    return pickModels((d.data ?? []).map((m: { id: string }) => m.id), p.model_filter, 3);
  } catch { return []; }
}

export async function callOnce(p: Provider, key: string, model: string, msgs: Msg[], f: FetchFn = fetch, maxTokens = 3500): Promise<{ text: string; tokens: number }> {
  if (p.kind === 'gemini') {
    const system = msgs.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const contents = msgs.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    const r = await timedFetch(f, `${p.base_url || 'https://generativelanguage.googleapis.com/v1beta'}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { maxOutputTokens: maxTokens, temperature: 0.4 } }),
    });
    const raw = await r.text();
    if (!r.ok) throw new HttpErr(r.status, raw, r.headers.get('retry-after'));
    const d = JSON.parse(raw);
    const text = (d?.candidates?.[0]?.content?.parts ?? []).map((x: { text?: string }) => x.text ?? '').join('');
    if (!text) throw new HttpErr(502, 'empty response: ' + (d?.promptFeedback?.blockReason ?? d?.candidates?.[0]?.finishReason ?? ''), null);
    return { text, tokens: d?.usageMetadata?.totalTokenCount ?? Math.ceil((text.length + msgs.reduce((n, m) => n + m.content.length, 0)) / 4) };
  }
  const r = await timedFetch(f, `${p.base_url.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages: msgs, temperature: 0.4, max_tokens: maxTokens }),
  });
  const raw = await r.text();
  if (!r.ok) throw new HttpErr(r.status, raw, r.headers.get('retry-after'));
  const d = JSON.parse(raw);
  const text = d?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new HttpErr(502, 'empty response', null);
  return { text, tokens: d?.usage?.total_tokens ?? Math.ceil((text.length + msgs.reduce((n, m) => n + m.content.length, 0)) / 4) };
}

export class HttpErr extends Error {
  status: number; body: string; retryAfter: number | null;
  constructor(status: number, body: string, retryAfter: string | null) {
    super(`HTTP ${status}`); this.status = status; this.body = body;
    const n = retryAfter ? Number(retryAfter) : NaN; this.retryAfter = isFinite(n) ? n : null;
  }
}

/**
 * Try every available provider in order until one answers.
 * `preferred` (a provider id) is moved to the front for this call only.
 */
export async function routeChat(opts: {
  providers: Provider[];
  getKey: (p: Provider) => Promise<string | null>;
  msgs: Msg[];
  record: RecordFn;
  saveModels?: (p: Provider, models: string[]) => Promise<void>;
  preferred?: string | null;
  fetchFn?: FetchFn;
  now?: Date;
  maxTokens?: number;
  skipIds?: Set<string>;
}): Promise<RouteResult> {
  const f = opts.fetchFn ?? fetch;
  const now = opts.now ?? new Date();
  const attempts: Attempt[] = [];
  let order = [...opts.providers].sort((a, b) => a.priority - b.priority);
  if (opts.preferred) order = [...order.filter(p => p.id === opts.preferred), ...order.filter(p => p.id !== opts.preferred)];

  for (const p of order) {
    if (opts.skipIds?.has(p.id)) continue;
    const av = isAvailable(p, now);
    if (!av.ok) { attempts.push({ provider: p.slot_name, model: '-', ok: false, status: 0, error: `skipped: ${av.why}`, ms: 0 }); continue; }
    const key = await opts.getKey(p);
    if (!key) { attempts.push({ provider: p.slot_name, model: '-', ok: false, status: 0, error: 'skipped: no key saved', ms: 0 }); continue; }

    let models = p.models.length ? p.models : p.models_cache;
    let rediscovered = false;
    if (!models.length) { models = await discoverModels(p, key, f); rediscovered = true; if (models.length) await opts.saveModels?.(p, models); }
    if (!models.length) { attempts.push({ provider: p.slot_name, model: '-', ok: false, status: 0, error: 'no usable model found', ms: 0 }); continue; }

    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      const t0 = Date.now();
      try {
        const { text, tokens } = await callOnce(p, key, model, opts.msgs, f, opts.maxTokens);
        attempts.push({ provider: p.slot_name, model, ok: true, status: 200, ms: Date.now() - t0 });
        await opts.record(p, { ok: true, tokens });
        return { text, provider: p, model, attempts };
      } catch (e) {
        const he = e instanceof HttpErr ? e : new HttpErr(e instanceof Error && e.name === 'AbortError' ? 408 : 0, String(e), null);
        const c = classifyError(he.status, he.body, he.retryAfter);
        const msg = `${he.status} ${he.body.replace(/\s+/g, ' ').slice(0, 160)}`;
        attempts.push({ provider: p.slot_name, model, ok: false, status: he.status, error: msg, ms: Date.now() - t0 });
        if (c.kind === 'model') {
          // Retired / renamed model: refresh the list once, otherwise try the next listed model.
          if (!rediscovered && !p.models.length) {
            rediscovered = true;
            const fresh = await discoverModels(p, key, f);
            if (fresh.length) { await opts.saveModels?.(p, fresh); models = fresh; i = -1; continue; }
          }
          if (i === models.length - 1) await opts.record(p, { ok: false, tokens: 0, error: msg, status: 'unknown' });
          continue;
        }
        if (c.kind === 'auth') { await opts.record(p, { ok: false, tokens: 0, error: msg, status: 'invalid' }); break; }
        if (c.kind === 'rate' || c.kind === 'quota' || c.kind === 'server') {
          await opts.record(p, { ok: false, tokens: 0, error: msg, status: 'cooldown', cooldownUntil: new Date(now.getTime() + c.cooldownMs) });
          break; // next provider
        }
        // bad request on this model: try the next model, then the next provider
        if (i === models.length - 1) await opts.record(p, { ok: false, tokens: 0, error: msg, status: 'unknown' });
      }
    }
  }
  const tried = attempts.filter(a => a.status !== 0 || !a.error?.startsWith('skipped')).length;
  throw new AllFailed(
    tried === 0
      ? 'No AI is ready. Add a free AI key in the AI Pool tab (or wait for a resting one to reset).'
      : 'Every free AI is busy or out of quota right now. Try again in a few minutes.',
    attempts);
}
