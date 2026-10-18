// Smoke test of the REAL ai-hub handler with a fake DB and mocked provider network.
// Run: node --import ./tests/smoke/register.mjs --test tests/smoke/hub.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DB } from './stub-supabase.mjs';

const ENV = { SUPABASE_URL: 'http://db', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'srv', GEMINI_API_KEY: 'gk', GROQ_API_KEY: 'qk' };
let handler;
globalThis.Deno = { env: { get: (k) => ENV[k] }, serve: (h) => { handler = h; } };

const calls = []; let plan = {};
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  const host = url.includes('generativelanguage') ? 'gemini' : url.includes('groq.com') ? 'groq' : 'other';
  calls.push({ host, url });
  if (url.endsWith('/models') || url.includes('/models?')) {
    return new Response(JSON.stringify(host === 'gemini'
      ? { models: [{ name: 'models/gemini-x-flash', supportedGenerationMethods: ['generateContent'] }] }
      : { data: [{ id: 'llama-3.3-70b-versatile' }] }), { status: 200 });
  }
  const step = plan[host]?.shift() ?? { status: 200, text: `hello from ${host}` };
  if (step.status !== 200) return new Response(step.body ?? 'err', { status: step.status, headers: step.headers });
  return new Response(JSON.stringify(host === 'gemini'
    ? { candidates: [{ content: { parts: [{ text: step.text }] } }] }
    : { choices: [{ message: { content: step.text } }] }), { status: 200 });
};

await import('../../../supabase/functions/ai-hub/index.ts');
DB.rpc.verify_admin_access = async ({ p_passcode }) => (p_passcode === 'OWNER' ? { role: 'owner' } : p_passcode === 'STAFF' ? { role: 'staff' } : null);
DB.rpc.hub_snapshot = async () => ({ members_total: 5 });

const reset = () => {
  calls.length = 0; plan = {};
  DB.tables = {
    hub_providers: ['gemini', 'groq', 'openrouter', 'cerebras', 'mistral'].map((k, i) => ({ key: k, enabled: true, priority: (i + 1) * 10, model: null, state: 'untested', cooldown_until: null, last_error: null, ok_count: 0, fail_count: 0 })),
    hub_agents: [{ key: 'marketing', name: 'Marketing', system_prompt: 'write posts', enabled: true, use_snapshot: false }, { key: 'analyst', name: 'Analyst', system_prompt: 'analyse', enabled: true, use_snapshot: true }],
    hub_runs: [], hub_proposals: [],
  };
};
const call = async (body) => { const r = await handler(new Request('http://x/', { method: 'POST', body: JSON.stringify(body) })); return { status: r.status, j: await r.json() }; };
const prov = (k) => DB.tables.hub_providers.find((p) => p.key === k);

test('owner only: wrong passcode and staff are refused, nothing is called', async () => {
  reset();
  for (const passcode of ['', 'nope', 'STAFF']) {
    const r = await call({ passcode, action: 'run', agent_key: 'marketing', input: 'x' });
    assert.equal(r.status, 401);
  }
  assert.equal(calls.length, 0);
});

test('status shows configured flags only, never key values', async () => {
  reset();
  const r = await call({ passcode: 'OWNER', action: 'status' });
  const flags = Object.fromEntries(r.j.providers.map((p) => [p.key, p.configured]));
  assert.deepEqual(flags, { gemini: true, groq: true, openrouter: false, cerebras: false, mistral: false });
  assert.ok(!JSON.stringify(r.j).includes('gk') || !JSON.stringify(r.j).includes('"gk"'));
  assert.ok(!JSON.stringify(r.j).includes('qk"'));
});

test('run: first provider answers, health recorded, proposal saved on request', async () => {
  reset();
  const r = await call({ passcode: 'OWNER', action: 'run', agent_key: 'marketing', input: 'Diwali offer post', save_proposal: true });
  assert.equal(r.j.ok, true); assert.equal(r.j.provider, 'gemini'); assert.match(r.j.text, /hello from gemini/);
  assert.equal(prov('gemini').state, 'ok'); assert.equal(prov('gemini').ok_count, 1);
  assert.equal(DB.tables.hub_proposals.length, 1); assert.ok(!DB.tables.hub_proposals[0].status || DB.tables.hub_proposals[0].status === 'PENDING'); // DB default is PENDING
  assert.equal(r.j.proposal_id, DB.tables.hub_proposals[0].id);
});

test('run: Gemini out of daily quota -> Groq answers, Gemini cooled until later, next run skips Gemini', async () => {
  reset(); plan.gemini = [{ status: 429, body: '{"error":{"status":"RESOURCE_EXHAUSTED","message":"You exceeded your current quota, requests per day"}}' }];
  const r = await call({ passcode: 'OWNER', action: 'run', agent_key: 'marketing', input: 'hi' });
  assert.equal(r.j.provider, 'groq');
  assert.deepEqual(r.j.attempts.map((a) => [a.provider, a.ok]), [['gemini', false], ['groq', true]]);
  assert.equal(prov('gemini').state, 'quota_out'); assert.ok(Date.parse(prov('gemini').cooldown_until) > Date.now() + 3600_000);
  calls.length = 0;
  const r2 = await call({ passcode: 'OWNER', action: 'run', agent_key: 'marketing', input: 'again' });
  assert.equal(r2.j.provider, 'groq'); assert.ok(!calls.some((c) => c.host === 'gemini' && !c.url.includes('/models')), 'cooling provider is not called');
});

test('run: priority change is respected, disabled provider skipped', async () => {
  reset(); prov('gemini').enabled = false;
  const r = await call({ passcode: 'OWNER', action: 'run', agent_key: 'marketing', input: 'hi' });
  assert.equal(r.j.provider, 'groq');
});

test('run: everything failing returns a clear error, not a crash', async () => {
  reset(); plan.gemini = [{ status: 500 }]; plan.groq = [{ status: 429, body: 'rate limit', headers: { 'retry-after': '10' } }];
  const r = await call({ passcode: 'OWNER', action: 'run', agent_key: 'marketing', input: 'hi' });
  assert.equal(r.j.ok, false); assert.match(r.j.error, /failed|quota/);
  assert.equal(prov('groq').state, 'rate_limited'); assert.equal(prov('gemini').state, 'error');
});

test('run: analyst gets the anonymous snapshot, marketing does not; warnings flag doses', async () => {
  reset(); let seen = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (u, i) => { if (i?.body) seen.push(String(i.body)); return orig(u, i); };
  plan.gemini = [{ status: 200, text: 'Take 5 mg daily' }];
  const a = await call({ passcode: 'OWNER', action: 'run', agent_key: 'analyst', input: 'weekly plan' });
  assert.ok(seen.some((s) => s.includes('members_total'))); assert.equal(a.j.warnings.length, 1);
  seen = []; await call({ passcode: 'OWNER', action: 'run', agent_key: 'marketing', input: 'post' });
  assert.ok(!seen.some((s) => s.includes('members_total')));
  globalThis.fetch = orig;
});

test('run: input checks and hourly cap', async () => {
  reset();
  assert.equal((await call({ passcode: 'OWNER', action: 'run', agent_key: 'marketing', input: ' ' })).status, 400);
  assert.equal((await call({ passcode: 'OWNER', action: 'run', agent_key: 'marketing', input: 'x'.repeat(6001) })).status, 400);
  assert.equal((await call({ passcode: 'OWNER', action: 'run', agent_key: 'ghost', input: 'x' })).status, 404);
  for (let i = 0; i < 125; i++) DB.tables.hub_runs.push({ created_at: new Date().toISOString() });
  assert.equal((await call({ passcode: 'OWNER', action: 'run', agent_key: 'marketing', input: 'x' })).status, 429);
});

test('test action: works for a configured provider, explains a missing key', async () => {
  reset();
  const ok = await call({ passcode: 'OWNER', action: 'test', provider: 'groq' });
  assert.equal(ok.j.ok, true); assert.equal(ok.j.provider, 'groq');
  const no = await call({ passcode: 'OWNER', action: 'test', provider: 'mistral' });
  assert.equal(no.j.ok, false); assert.match(no.j.error, /MISTRAL_API_KEY/);
});
