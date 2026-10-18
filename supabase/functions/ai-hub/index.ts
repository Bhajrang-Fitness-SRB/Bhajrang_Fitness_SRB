// AI Agent Hub: runs an agent through the free AI providers with automatic fail-over.
// Deploy with:  supabase functions deploy ai-hub --no-verify-jwt
// Owner passcode only. Agents only write / analyse / propose: this function never changes the app or sends messages.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { CATALOG, HUB_RULES, outputWarnings, runChain, type Failure, type ProviderState } from '../_shared/hub.ts';
import { callProvider } from '../_shared/hubcall.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const MAX_INPUT = 6000;
const MAX_RUNS_PER_HOUR = 120;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  let b: { passcode?: string; action?: string; provider?: string; agent_key?: string; input?: string; save_proposal?: boolean; title?: string };
  try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400); }

  // owner only
  const anon = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { auth: { persistSession: false } });
  const { data: who } = await anon.rpc('verify_admin_access', { p_passcode: b.passcode ?? '' });
  if (!who || (who as { role?: string }).role !== 'owner') return json({ error: 'Only the owner can use the Agent Hub.' }, 401);

  const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const configured: Record<string, boolean> = Object.fromEntries(CATALOG.map((c) => [c.key, !!env(c.envKey)]));

  if (b.action === 'status') {
    return json({ providers: CATALOG.map((c) => ({ key: c.key, label: c.label, envKey: c.envKey, configured: configured[c.key], signup: c.signup })) });
  }

  async function loadStates(): Promise<ProviderState[]> {
    const { data } = await sb.from('hub_providers').select('key,enabled,priority,model,state,cooldown_until,last_error');
    return (data ?? []) as ProviderState[];
  }
  const record = (agent: string | null, startedAt: number) => async (p: ProviderState, r: { ok: true; model?: string } | { ok: false; failure: Failure }) => {
    const { data: cur } = await sb.from('hub_providers').select('ok_count,fail_count').eq('key', p.key).maybeSingle();
    if (r.ok) {
      await sb.from('hub_providers').update({ state: 'ok', cooldown_until: null, last_error: null, last_ok_at: new Date().toISOString(), ok_count: (cur?.ok_count ?? 0) + 1, updated_at: new Date().toISOString() }).eq('key', p.key);
    } else {
      const f = r.failure;
      await sb.from('hub_providers').update({
        ...(f.health === 'ok' ? {} : { state: f.health, cooldown_until: new Date(Date.now() + f.cooldownMs).toISOString() }),
        last_error: f.message, fail_count: (cur?.fail_count ?? 0) + 1, updated_at: new Date().toISOString(),
      }).eq('key', p.key);
    }
    await sb.from('hub_runs').insert({ agent_key: agent, provider: p.key, ok: r.ok, ms: Date.now() - startedAt });
  };

  // ---- connection test for one provider (ignores cool-down; uses a tiny prompt)
  if (b.action === 'test') {
    const key = String(b.provider ?? '');
    if (!configured[key]) return json({ ok: false, error: `No key saved yet. Add ${CATALOG.find((c) => c.key === key)?.envKey ?? 'the key'} in Supabase secrets.` });
    const st = (await loadStates()).find((s) => s.key === key);
    if (!st) return json({ ok: false, error: 'Unknown provider.' });
    const t0 = Date.now();
    const out = await runChain({
      states: [{ ...st, enabled: true, cooldown_until: null }], configured,
      call: (p) => callProvider(p, 'Reply with the single word OK.', 'ping', 20),
      record: record(null, t0),
    });
    return json({ ok: out.ok, provider: key, reply: out.text?.slice(0, 40), model: out.attempts.at(-1)?.model, error: out.ok ? undefined : out.attempts.at(-1)?.message ?? out.error, ms: Date.now() - t0 });
  }

  // ---- run an agent
  if (b.action === 'run') {
    const input = String(b.input ?? '').trim();
    if (!b.agent_key || !input) return json({ error: 'Choose an agent and write what you want it to do.' }, 400);
    if (input.length > MAX_INPUT) return json({ error: `Too long (max ${MAX_INPUT} characters).` }, 400);

    const { data: agent } = await sb.from('hub_agents').select('key,name,system_prompt,enabled,use_snapshot').eq('key', b.agent_key).maybeSingle();
    if (!agent) return json({ error: 'That agent does not exist.' }, 404);
    if (!agent.enabled) return json({ error: 'That agent is switched off.' }, 400);

    const { count } = await sb.from('hub_runs').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 3600_000).toISOString());
    if ((count ?? 0) > MAX_RUNS_PER_HOUR) return json({ error: 'Too many requests this hour. Please wait a little.' }, 429);

    let system = `${HUB_RULES}\n\nYOUR ROLE (${agent.name}):\n${agent.system_prompt}`;
    if (agent.use_snapshot) {
      const { data: snap } = await sb.rpc('hub_snapshot');
      system += `\n\nGYM SNAPSHOT (anonymous counts only):\n${JSON.stringify(snap ?? {})}`;
    }
    const t0 = Date.now();
    const out = await runChain({
      states: await loadStates(), configured,
      call: (p) => callProvider(p, system, `INPUT:\n${input}`),
      record: record(agent.key, t0),
    });
    if (!out.ok || !out.text) return json({ ok: false, error: out.error, attempts: out.attempts });

    let proposalId: string | null = null;
    if (b.save_proposal) {
      const title = (b.title?.trim() || `${agent.name}: ${input.replace(/\s+/g, ' ').slice(0, 70)}`).slice(0, 160);
      const ins = await sb.from('hub_proposals').insert({ agent_key: agent.key, title, detail: out.text.slice(0, 8000), provider: out.provider }).select('id').single();
      proposalId = ins.data?.id ?? null;
    }
    return json({ ok: true, text: out.text, provider: out.provider, attempts: out.attempts, warnings: outputWarnings(out.text), proposal_id: proposalId });
  }

  return json({ error: 'Unknown action.' }, 400);
});
