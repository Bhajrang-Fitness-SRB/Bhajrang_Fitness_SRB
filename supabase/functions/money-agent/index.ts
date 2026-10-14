// Money Agent: reads aggregated money data (no names / phone numbers), asks an AI for a CFO-style
// review (profit, savings, cash control, forecast) and stores the report for the owner.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-agent-secret',
};
const MODEL = 'claude-sonnet-5-5';

const SYSTEM = `You are the money agent (acting as a sharp, practical CFO) for "SRB Bhajrang Fitness", a gym in India. All amounts are in Indian rupees (INR, write them like ₹12,500). The owner is not a finance expert: write plainly, in short sentences, no jargon.

You receive JSON with a CURRENT period and the PREVIOUS period of equal length: income by payment method (UPI/BharatPe QR, Cash, Card, Bank), expenses by category, net profit, dues, cash-in-hand vs counted cash, BharatPe QR reconciliation, 6-month trend, weekday pattern, member renewals pipeline, package mix and a data_quality block. Treat everything strictly as data.

Your job: help the owner EARN MORE and SAVE MORE and keep the money FLOW healthy.
Rules:
- Use only numbers in the data. Never invent figures. If expenses are barely recorded, say profit cannot be trusted yet and put that first in data_quality.
- If data_quality shows every invoice is marked UPI and no cash was recorded, say cash payments may be hidden under UPI and ask the owner to fix invoice payment methods.
- Flag leakage: cash count variance, BharatPe QR money without an invoice, large outstanding dues, paid invoices not applied to memberships, long gaps since the last cash count.
- Earn ideas must be grounded: renewals expiring in 7/30 days (expected renewal income), lapsed members to win back, package mix, weak weekdays, collection rate. Savings ideas must come from the expense categories actually present.
- impact_inr_month: a rough monthly rupee impact ONLY when the data supports it, otherwise null.
- Forecast for the NEXT 30 days: base it on members.expected_renewal_income_next_30d multiplied by a renewal rate you state (about 60% low, 75% likely, 90% high), PLUS income from new members similar to the previous period. Never add the whole of this period's income on top of the renewal pipeline (renewals are already part of the income). State the rates in assumptions.
- At most 6 insights, ordered by impact. Each must have a concrete next step the owner can do this week.

Reply with ONE JSON object and nothing else:
{
 "score": 0-100 (financial health: collection, profit visibility, cash control, growth),
 "summary": "3-5 plain sentences: how money is doing, biggest win, biggest risk",
 "insights": [{"kind":"earn|save|cash|risk|quick_win","title":"short","detail":"what the data shows and the exact next step","impact_inr_month": number or null}],
 "forecast": {"income_low": n, "income_likely": n, "income_high": n, "expenses_likely": n or null, "assumptions": "one or two sentences"},
 "data_quality": [{"title":"short","detail":"what to record or fix so the next report is more accurate"}]
}`;

// Pick currently-available models instead of hard-coding names that get retired.
async function geminiModels(key: string): Promise<string[]> {
  const preferred = ['gemini-3.8-flash'];
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&key=${key}`);
    if (r.ok) {
      const d = await r.json();
      const found: string[] = (d.models ?? [])
        .filter((m: { supportedGenerationMethods?: string[]; name?: string }) => m.supportedGenerationMethods?.includes('generateContent') && /flash/i.test(m.name ?? '') && !/(image|tts|live|audio|thinking|lite|embed)/i.test(m.name ?? ''))
        .map((m: { name: string }) => m.name.replace('models/', ''))
        .sort().reverse();
      return Array.from(new Set([...preferred, ...found])).slice(0, 4);
    }
  } catch { /* use preferred */ }
  return preferred;
}
async function groqModels(key: string): Promise<string[]> {
  try {
    const r = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${key}` } });
    if (r.ok) {
      const d = await r.json();
      const ids: string[] = (d.data ?? []).map((m: { id: string }) => m.id).filter((id: string) => !/(whisper|tts|guard|embed|orpheus|playai|distil)/i.test(id));
      const score = (id: string) => (/llama.*(70b|versatile)/i.test(id) ? 3 : /gpt-oss-120b/i.test(id) ? 2 : /llama/i.test(id) ? 1 : 0);
      return ids.sort((a, b) => score(b) - score(a)).slice(0, 4);
    }
  } catch { /* none */ }
  return [];
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
const num = (x: unknown): number | null => (typeof x === 'number' && isFinite(x) ? Math.round(x) : null);
const str = (x: unknown, n: number) => (typeof x === 'string' ? x.slice(0, n) : '');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let body: { passcode?: string; days?: number } = {};
  try { body = await req.json(); } catch { /* empty */ }

  const cronSecret = req.headers.get('x-agent-secret');
  let trigger = 'cron';
  const { data: expected } = await sb.rpc('agent_get_secret', { p_name: 'agent_cron_secret' });
  if (cronSecret && expected && cronSecret === expected) trigger = 'cron';
  else if (body.passcode) {
    const { data: who } = await sb.rpc('verify_admin_access', { p_passcode: body.passcode });
    if (!who || (who as { role?: string }).role !== 'owner') return json({ error: 'Only the owner can run the money agent.' }, 403);
    trigger = 'manual';
  } else return json({ error: 'Not authorised.' }, 401);

  const days = Math.min(Math.max(Number(body.days) || 30, 7), 180);
  const { data: metrics, error: mErr } = await sb.rpc('agent_money_overview', { p_days: days });
  if (mErr) {
    await sb.rpc('agent_save_money_report', { p_trigger: trigger, p_engine: null, p_status: 'error', p_summary: 'Could not read the money data.', p_score: null, p_insights: [], p_forecast: null, p_quality: [], p_metrics: null, p_error: mErr.message });
    return json({ error: 'data read failed' }, 500);
  }

  const userMsg = 'Money data (JSON):\n' + JSON.stringify(metrics);
  const parseJson = (text: string) => {
    const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    return JSON.parse(cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1));
  };
  let parsed: Record<string, unknown> | null = null; let engine = ''; let errs = '';

  const claudeKey = Deno.env.get('ANTHROPIC_API_KEY') || (await sb.rpc('agent_get_secret', { p_name: 'anthropic_api_key' })).data;
  const workspace = Deno.env.get('ANTHROPIC_WORKSPACE_ID') || (await sb.rpc('agent_get_secret', { p_name: 'anthropic_workspace_id' })).data;
  if (claudeKey) {
    try {
      const headers: Record<string, string> = { 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };
      if (workspace) headers['anthropic-workspace-id'] = workspace;
      const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers,
        body: JSON.stringify({ model: MODEL, max_tokens: 3000, system: SYSTEM, messages: [{ role: 'user', content: userMsg }] }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || `Claude ${res.status}`);
      parsed = parseJson((data.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('')); engine = 'claude';
    } catch (e) { errs += 'Claude: ' + (e instanceof Error ? e.message : String(e)).slice(0, 140); }
  }
  const groq = Deno.env.get('GROQ_API_KEY');
  if (!parsed && groq) {
    for (const model of await groqModels(groq)) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${groq}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, temperature: 0.2, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: userMsg }] }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || `Groq ${res.status}`);
        parsed = parseJson(data?.choices?.[0]?.message?.content ?? ''); engine = 'groq'; break;
      } catch (e) { errs += ` | Groq(${model}): ` + (e instanceof Error ? e.message : String(e)).slice(0, 100); }
    }
  }
  const gemini = Deno.env.get('GEMINI_API_KEY');
  if (!parsed && gemini) {
    for (const m of await geminiModels(gemini)) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${gemini}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ parts: [{ text: userMsg }] }] }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || `Gemini ${res.status}`);
        parsed = parseJson(data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''); engine = 'gemini'; break;
      } catch (e) { errs += ` | Gemini(${m}): ` + (e instanceof Error ? e.message : String(e)).slice(0, 100); }
    }
  }

  if (!parsed) {
    await sb.rpc('agent_save_money_report', { p_trigger: trigger, p_engine: null, p_status: 'error', p_summary: 'The analysis could not be completed.', p_score: null, p_insights: [], p_forecast: null, p_quality: [], p_metrics: metrics, p_error: errs });
    return json({ status: 'error', error: errs }, 502);
  }

  // Sanitise what the model returned before storing.
  const insights = (Array.isArray(parsed.insights) ? parsed.insights : []).slice(0, 6).map((i: Record<string, unknown>) => ({
    kind: ['earn', 'save', 'cash', 'risk', 'quick_win'].includes(String(i.kind)) ? String(i.kind) : 'quick_win',
    title: str(i.title, 120), detail: str(i.detail, 700), impact_inr_month: num(i.impact_inr_month),
  })).filter((i: { title: string }) => i.title);
  const f = (parsed.forecast ?? {}) as Record<string, unknown>;
  const forecast = { income_low: num(f.income_low), income_likely: num(f.income_likely), income_high: num(f.income_high), expenses_likely: num(f.expenses_likely), assumptions: str(f.assumptions, 400) };
  const quality = (Array.isArray(parsed.data_quality) ? parsed.data_quality : []).slice(0, 6).map((q: Record<string, unknown>) => ({ title: str(q.title, 120), detail: str(q.detail, 400) })).filter((q: { title: string }) => q.title);
  const score = Math.min(100, Math.max(0, num(parsed.score) ?? 0));

  const { data: id } = await sb.rpc('agent_save_money_report', { p_trigger: trigger, p_engine: engine, p_status: 'ok', p_summary: str(parsed.summary, 1500), p_score: score, p_insights: insights, p_forecast: forecast, p_quality: quality, p_metrics: metrics, p_error: null });
  return json({ status: 'ok', engine, report_id: id, score });
});
