// Meta (WhatsApp Cloud API / Messenger / Instagram) sending + free-tier AI calls.
// Uses the same Gemini -> Groq fallback chain as the app's existing `ai-coach` function.
import { splitMessage, type Channel } from './social.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const GRAPH = () => `https://graph.facebook.com/${env('GRAPH_VERSION') || 'v23.0'}`;

export interface SendResult { ok: boolean; error?: string }

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<SendResult> {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    if (r.ok) return { ok: true };
    const t = await r.text().catch(() => '');
    return { ok: false, error: `${r.status} ${t.slice(0, 300)}` };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 200) };
  }
}

/** Free-form reply. Only valid inside the 24h customer-service window (always true when replying to a fresh message). */
export async function sendText(channel: Channel, to: string, text: string): Promise<SendResult> {
  for (const part of splitMessage(text, channel === 'whatsapp' ? 1500 : 900)) {
    let res: SendResult;
    if (channel === 'whatsapp') {
      const id = env('WA_PHONE_NUMBER_ID'), tok = env('WA_ACCESS_TOKEN');
      if (!id || !tok) return { ok: false, error: 'WhatsApp credentials missing' };
      res = await post(`${GRAPH()}/${id}/messages`, { Authorization: `Bearer ${tok}` },
        { messaging_product: 'whatsapp', to, type: 'text', text: { body: part, preview_url: false } });
    } else {
      const tok = env('PAGE_ACCESS_TOKEN');
      if (!tok) return { ok: false, error: 'Page access token missing' };
      res = await post(`${GRAPH()}/me/messages`, { Authorization: `Bearer ${tok}` },
        { recipient: { id: to }, messaging_type: 'RESPONSE', message: { text: part } });
    }
    if (!res.ok) return res;
  }
  return { ok: true };
}

/** Approved WhatsApp template - the only way to message a customer who has not written in the last 24h. */
export async function sendTemplate(to: string, name: string, lang: string, params: string[]): Promise<SendResult> {
  const id = env('WA_PHONE_NUMBER_ID'), tok = env('WA_ACCESS_TOKEN');
  if (!id || !tok) return { ok: false, error: 'WhatsApp credentials missing' };
  const clean = (s: string) => s.replace(/[\n\t]+/g, ' ').replace(/ {2,}/g, ' ').slice(0, 200);
  return post(`${GRAPH()}/${id}/messages`, { Authorization: `Bearer ${tok}` }, {
    messaging_product: 'whatsapp', to, type: 'template',
    template: { name, language: { code: lang }, components: params.length ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: clean(p) })) }] : [] },
  });
}

// ------------------------------------------------------------------ AI
export interface Turn { role: 'user' | 'assistant'; text: string }

let geminiCache: { models: string[]; at: number } | null = null;
async function geminiModels(key: string): Promise<string[]> {
  if (env('GEMINI_MODEL')) return [env('GEMINI_MODEL')];
  if (geminiCache && Date.now() - geminiCache.at < 6 * 3600_000) return geminiCache.models;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&key=${key}`);
    if (r.ok) {
      const d = await r.json();
      const found: string[] = (d.models ?? [])
        .filter((m: { supportedGenerationMethods?: string[]; name?: string }) => m.supportedGenerationMethods?.includes('generateContent') && /flash/i.test(m.name ?? '') && !/(image|tts|live|audio|thinking|lite|embed)/i.test(m.name ?? ''))
        .map((m: { name: string }) => m.name.replace('models/', '')).sort().reverse().slice(0, 3);
      if (found.length) { geminiCache = { models: found, at: Date.now() }; return found; }
    }
  } catch { /* fall through */ }
  return ['gemini-flash-latest'];
}

async function groqModels(key: string): Promise<string[]> {
  if (env('GROQ_MODEL')) return [env('GROQ_MODEL')];
  try {
    const r = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${key}` } });
    if (r.ok) {
      const d = await r.json();
      const ids: string[] = (d.data ?? []).map((m: { id: string }) => m.id).filter((id: string) => !/(whisper|tts|guard|embed|orpheus|playai|distil)/i.test(id));
      const score = (id: string) => (/llama.*(70b|versatile)/i.test(id) ? 3 : /gpt-oss-120b/i.test(id) ? 2 : /llama/i.test(id) ? 1 : 0);
      return ids.sort((a, b) => score(b) - score(a)).slice(0, 3);
    }
  } catch { /* none */ }
  return [];
}

function mergeTurns(turns: Turn[]): Turn[] {
  const out: Turn[] = [];
  for (const t of turns) {
    const last = out[out.length - 1];
    if (last && last.role === t.role) last.text += '\n' + t.text; else out.push({ ...t });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

export async function callAI(system: string, turns: Turn[], json: boolean): Promise<{ text: string | null; engine: string; errors: string[] }> {
  const errors: string[] = [];
  const history = mergeTurns(turns);
  if (!history.length) return { text: null, engine: 'none', errors: ['empty history'] };

  const gk = env('GEMINI_API_KEY');
  if (gk) {
    for (const model of await geminiModels(gk)) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': gk },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: history.map((t) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.text }] })),
            generationConfig: { temperature: 0.6, maxOutputTokens: 1200, ...(json ? { responseMimeType: 'application/json' } : {}) },
          }),
        });
        const d = await r.json();
        if (!r.ok) { errors.push(`gemini ${model}: ${String(d?.error?.message ?? r.status).slice(0, 100)}`); continue; }
        const text = d?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('');
        if (text) return { text, engine: `gemini:${model}`, errors };
        errors.push(`gemini ${model}: empty (${d?.candidates?.[0]?.finishReason ?? d?.promptFeedback?.blockReason ?? 'unknown'})`);
      } catch (e) { errors.push(`gemini ${model}: ${String(e).slice(0, 80)}`); }
    }
  }

  const qk = env('GROQ_API_KEY');
  if (qk) {
    for (const model of await groqModels(qk)) {
      try {
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST', headers: { Authorization: `Bearer ${qk}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model, temperature: 0.6, max_tokens: 900,
            messages: [{ role: 'system', content: system }, ...history.map((t) => ({ role: t.role, content: t.text }))],
            ...(json ? { response_format: { type: 'json_object' } } : {}),
          }),
        });
        const d = await r.json();
        if (!r.ok) { errors.push(`groq ${model}: ${String(d?.error?.message ?? r.status).slice(0, 100)}`); continue; }
        const text = d?.choices?.[0]?.message?.content;
        if (typeof text === 'string' && text) return { text, engine: `groq:${model}`, errors };
      } catch (e) { errors.push(`groq ${model}: ${String(e).slice(0, 80)}`); }
    }
  }
  if (!gk && !qk) errors.push('No GEMINI_API_KEY or GROQ_API_KEY set');
  return { text: null, engine: 'none', errors };
}
