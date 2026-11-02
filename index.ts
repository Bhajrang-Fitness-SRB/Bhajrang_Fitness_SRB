import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// Every outside call gets a hard time limit so one slow AI service can never hang the function (HTTP 546).
const CALL_TIMEOUT_MS = 20000;   // per AI call
const LIST_TIMEOUT_MS = 5000;    // per model-list call
const TOTAL_BUDGET_MS = 100000;  // whole request
const MAX_MODELS_PER_ENGINE = 2;

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const url = Deno.env.get('SUPABASE_URL'); const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anon) return null;
  const r = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(LIST_TIMEOUT_MS * 2),
  });
  if (!r.ok) return null;
  return await r.json().catch(() => null);
}

// Allowed callers: admin/staff (body.passcode) OR a logged-in member (body.member_id + body.member_passcode).
async function isAllowed(b: Record<string, unknown>): Promise<boolean> {
  try {
    if (typeof b.passcode === 'string' && b.passcode.trim()) {
      const v = await rpc('verify_admin_access', { p_passcode: b.passcode });
      if (v !== null && v !== false && v !== undefined) return true;
    }
    if (typeof b.member_id === 'string' && typeof b.member_passcode === 'string' && b.member_id && b.member_passcode) {
      const rows = await rpc('verify_member_login', { p_member_id: b.member_id, p_passcode: b.member_passcode });
      if (Array.isArray(rows) && rows.length > 0) return true;
    }
  } catch { /* treat as not allowed */ }
  return false;
}

// Pick currently-available models instead of hard-coding names that get retired.
async function geminiModels(key: string): Promise<string[]> {
  const preferred = 'gemini-3.8-flash';
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100', {
      headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
    });
    if (r.ok) {
      const d = await r.json();
      const found: string[] = (d.models ?? [])
        .filter((m: { supportedGenerationMethods?: string[]; name?: string }) => m.supportedGenerationMethods?.includes('generateContent') && /flash/i.test(m.name ?? '') && !/(image|tts|live|audio|thinking|lite|embed)/i.test(m.name ?? ''))
        .map((m: { name: string }) => m.name.replace('models/', ''))
        .sort().reverse();
      if (found.length) {
        // Only real, listed models; put the preferred one first when it exists.
        const ordered = found.includes(preferred) ? [preferred, ...found.filter((m) => m !== preferred)] : found;
        return ordered.slice(0, MAX_MODELS_PER_ENGINE);
      }
    }
  } catch { /* use preferred */ }
  return [preferred];
}
async function groqModels(key: string): Promise<string[]> {
  try {
    const r = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(LIST_TIMEOUT_MS) });
    if (r.ok) {
      const d = await r.json();
      const ids: string[] = (d.data ?? []).map((m: { id: string }) => m.id).filter((id: string) => !/(whisper|tts|guard|embed|orpheus|playai|distil)/i.test(id));
      const score = (id: string) => (/llama.*(70b|versatile)/i.test(id) ? 3 : /gpt-oss-120b/i.test(id) ? 2 : /llama/i.test(id) ? 1 : 0);
      return ids.sort((a, b) => score(b) - score(a)).slice(0, MAX_MODELS_PER_ENGINE);
    }
  } catch { /* none */ }
  return [];
}

const SYSTEM = 'You are a professional gym fitness and nutrition coach. Be concise, practical, and safe. Never give medical diagnoses.';

async function tryGemini(apiKey: string, prompt: string, errors: string[], deadline: number): Promise<string | null> {
  for (const model of await geminiModels(apiKey)) {
    if (Date.now() > deadline) { errors.push('gemini: out of time'); break; }
    try {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      });
      const data = await resp.json();
      if (!resp.ok) { errors.push(`gemini ${model}: ${String(data?.error?.message ?? resp.status).slice(0, 120)}`); continue; }
      const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('');
      if (text) return text;
    } catch (e) { errors.push(`gemini ${model}: ${String(e).slice(0, 80)}`); }
  }
  return null;
}

async function tryGroq(apiKey: string, prompt: string, errors: string[], deadline: number): Promise<string | null> {
  for (const model of await groqModels(apiKey)) {
    if (Date.now() > deadline) { errors.push('groq: out of time'); break; }
    try {
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }] }),
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      });
      const data = await resp.json();
      if (!resp.ok) { errors.push(`groq ${model}: ${String(data?.error?.message ?? resp.status).slice(0, 120)}`); continue; }
      const text = data?.choices?.[0]?.message?.content;
      if (typeof text === 'string' && text) return text;
    } catch (e) { errors.push(`groq ${model}: ${String(e).slice(0, 80)}`); }
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const deadline = Date.now() + TOTAL_BUDGET_MS;
    const body = await req.json();
    if (!(await isAllowed(body))) return json({ error: 'Unauthorized: admin passcode or member login required.' }, 401);

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    const groqKey = Deno.env.get('GROQ_API_KEY');
    if (!geminiKey && !groqKey) {
      return json({ configured: false, reason: 'No Gemini or Groq API key set yet.' });
    }

    const prompt = typeof body.prompt === 'string' ? body.prompt : '';
    if (!prompt) return json({ error: 'Missing prompt' }, 400);
    if (prompt.length > 6000) return json({ error: 'Prompt too long (max 6000 characters).' }, 400);

    const errors: string[] = [];
    if (geminiKey) {
      const text = await tryGemini(geminiKey, prompt, errors, deadline);
      if (text) return json({ configured: true, engine: 'gemini', text });
    }
    if (groqKey) {
      const text = await tryGroq(groqKey, prompt, errors, deadline);
      if (text) return json({ configured: true, engine: 'groq', text });
    }
    return json({ configured: true, ok: false, reason: 'Both Gemini and Groq failed to respond. ' + errors.join(' | ') });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
