// Run:  npx -y tsx --test tests/agent-hub/hub.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { routeChat, classifyError, pickModels, isAvailable, AllFailed, type Provider } from '../../supabase/functions/agent-hub/router.ts';
import { applyEdits, checkPath, checkSql, extractBlocks, parseJsonLoose } from '../../supabase/functions/agent-hub/guard.ts';

const mk = (o: Partial<Provider>): Provider => ({ id: 'id', slot_name: 'p', kind: 'openai', base_url: 'https://x.test/v1', models: ['m1'], models_cache: [], model_filter: null, priority: 1, enabled: true, status: 'unknown', cooldown_until: null, daily_limit: null, usage_day: '2000-01-01', req_today: 0, ...o });
const ok = (text: string) => new Response(JSON.stringify({ choices: [{ message: { content: text } }], usage: { total_tokens: 9 } }), { status: 200 });
const err = (status: number, body = '{}', h: Record<string, string> = {}) => new Response(body, { status, headers: h });

function harness(providers: Provider[], routes: Record<string, () => Response>) {
  const records: any[] = []; const called: string[] = [];
  const fetchFn = (async (url: string) => { const host = new URL(url).host; called.push(host); const r = routes[host]; if (!r) throw new Error('no route ' + host); return r(); }) as unknown as typeof fetch;
  return { records, called, run: (extra: any = {}) => routeChat({ providers, getKey: async () => 'k', msgs: [{ role: 'user', content: 'hi' }], fetchFn, record: async (p, x) => { records.push({ id: p.id, ...x }); }, ...extra }) };
}

test('first healthy provider answers', async () => {
  const h = harness([mk({ id: 'a', base_url: 'https://a.test/v1' }), mk({ id: 'b', priority: 2, base_url: 'https://b.test/v1' })], { 'a.test': () => ok('A'), 'b.test': () => ok('B') });
  const r = await h.run(); assert.equal(r.text, 'A'); assert.deepEqual(h.called, ['a.test']);
});
test('free limit ends (429 daily) -> next provider answers, first goes to cool-down', async () => {
  const h = harness([mk({ id: 'a', base_url: 'https://a.test/v1' }), mk({ id: 'b', priority: 2, base_url: 'https://b.test/v1' })], { 'a.test': () => err(429, 'Quota exceeded for requests per day'), 'b.test': () => ok('B') });
  const r = await h.run(); assert.equal(r.text, 'B');
  const rec = h.records.find(x => x.id === 'a'); assert.equal(rec.status, 'cooldown'); assert.ok(rec.cooldownUntil.getTime() - Date.now() > 3 * 3600e3);
});
test('per-minute 429 only rests ~90s', async () => {
  const c = classifyError(429, 'Rate limit reached, try again'); assert.equal(c.kind, 'rate'); assert.equal(c.cooldownMs, 90e3);
  assert.equal(classifyError(429, 'x', 30).cooldownMs, 30e3);
});
test('rejected key marks provider invalid and moves on', async () => {
  const h = harness([mk({ id: 'a', base_url: 'https://a.test/v1' }), mk({ id: 'b', priority: 2, base_url: 'https://b.test/v1' })], { 'a.test': () => err(401, '{"error":{"message":"Invalid API key"}}'), 'b.test': () => ok('B') });
  await h.run(); assert.equal(h.records.find(x => x.id === 'a').status, 'invalid');
});
test('providers in cool-down / invalid / disabled / over daily cap are skipped without a call', async () => {
  const now = new Date('2026-10-16T10:00:00Z');
  const ps = [mk({ id: 'a', base_url: 'https://a.test/v1', cooldown_until: '2026-10-16T12:00:00Z' }), mk({ id: 'b', priority: 2, base_url: 'https://b.test/v1', status: 'invalid' }), mk({ id: 'c', priority: 3, base_url: 'https://c.test/v1', enabled: false }), mk({ id: 'd', priority: 4, base_url: 'https://d.test/v1', daily_limit: 5, usage_day: '2026-10-16', req_today: 5 }), mk({ id: 'e', priority: 5, base_url: 'https://e.test/v1' })];
  const h = harness(ps, { 'e.test': () => ok('E') });
  const r = await h.run({ now }); assert.equal(r.text, 'E'); assert.deepEqual(h.called, ['e.test']);
  assert.equal(isAvailable(ps[0], new Date('2026-10-16T13:00:00Z')).ok, true); // cool-down over
});
test('all failed -> AllFailed with attempts', async () => {
  const h = harness([mk({ base_url: 'https://a.test/v1' })], { 'a.test': () => err(500, 'boom') });
  await assert.rejects(h.run(), (e: any) => e instanceof AllFailed && e.attempts.length === 1);
});
test('no providers ready -> friendly message', async () => {
  const h = harness([mk({ enabled: false })], {});
  await assert.rejects(h.run(), /No AI is ready/);
});
test('retired model: rediscovers models once then succeeds', async () => {
  let chat = 0;
  const h = harness([mk({ id: 'a', base_url: 'https://a.test/v1', models: [], models_cache: ['old-model'] })], {});
  const fetchFn = (async (url: string) => { if (url.endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'new-70b-versatile' }, { id: 'whisper-large' }] })); chat++; return chat === 1 ? err(404, '{"error":{"message":"The model old-model does not exist"}}') : ok('fresh'); }) as unknown as typeof fetch;
  const saved: string[][] = [];
  const r = await routeChat({ providers: [mk({ id: 'a', base_url: 'https://a.test/v1', models: [], models_cache: ['old-model'] })], getKey: async () => 'k', msgs: [{ role: 'user', content: 'x' }], fetchFn, record: async () => {}, saveModels: async (_p, m) => { saved.push(m); } });
  assert.equal(r.text, 'fresh'); assert.deepEqual(saved[0], ['new-70b-versatile']); void h;
});
test('gemini adapter shape', async () => {
  let seen: any;
  const fetchFn = (async (url: string, init: any) => { seen = { url, body: JSON.parse(init.body), key: init.headers['x-goog-api-key'] }; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'G' }] } }], usageMetadata: { totalTokenCount: 5 } })); }) as unknown as typeof fetch;
  const r = await routeChat({ providers: [mk({ kind: 'gemini', base_url: '', models: ['gemini-x'] })], getKey: async () => 'KEY', msgs: [{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }, { role: 'assistant', content: 'A' }], fetchFn, record: async () => {} });
  assert.equal(r.text, 'G'); assert.equal(seen.key, 'KEY'); assert.equal(seen.body.systemInstruction.parts[0].text, 'S'); assert.equal(seen.body.contents[1].role, 'model'); assert.ok(!seen.url.includes('KEY'));
});
test('pickModels ranks big chat models and drops audio/guard', () => {
  assert.deepEqual(pickModels(['whisper-large-v3', 'llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'llama-guard-4'], null, 2), ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']);
  assert.deepEqual(pickModels(['a:free', 'b', 'c:free'], ':free$'), ['a:free', 'c:free']);
});

// ---------------- guards
test('sql guard blocks protected things and flags destructive', () => {
  for (const s of ['select * from agent_hub_providers', 'select * from vault.secrets', 'create policy x on members using (true)', 'grant select on members to anon', 'alter role postgres password \'x\'', 'update ghost_vault set passcode=\'1\'', 'drop schema public cascade', 'select pg_read_file(\'/etc/passwd\')', 'set role postgres', 'alter table members disable row level security'])
    assert.equal(checkSql(s).ok, false, s);
  assert.equal(checkSql('create table if not exists t(id int); alter table members add column if not exists x text;').destructive, false);
  assert.equal(checkSql('grant execute on function public.f(text) to anon, authenticated;').ok, true);
  assert.equal(checkSql('delete from members').destructive, true);
  assert.equal(checkSql('delete from members where member_id = \'x\'').destructive, false);
  assert.equal(checkSql('update members set name = \'x\'').destructive, true);
  assert.equal(checkSql('drop table old_things').destructive, true);
  assert.equal(checkSql("insert into t values ('delete from x; drop table y')").destructive, false); // text inside a string
});
test('path guard', () => {
  for (const p of ['src/App.tsx', 'site/index.html', 'supabase/functions/foo/index.ts']) assert.equal(checkPath(p), null, p);
  for (const p of ['supabase/functions/agent-hub/index.ts', 'src/agent-hub/AgentHub.tsx', '.env', 'src/.env.local', 'package.json', '../x', '/etc/passwd', 'render.yaml', '.github/workflows/a.yml', 'node_modules/x.js', 'public/sw.js'])
    assert.notEqual(checkPath(p), null, p);
});
test('patch edits must match exactly once', () => {
  assert.deepEqual(applyEdits('a b c', [{ find: 'b', replace: 'X' }]), { ok: true, content: 'a X c' });
  assert.equal(applyEdits('a b b', [{ find: 'b', replace: 'X' }]).ok, false);
  assert.equal(applyEdits('a', [{ find: 'z', replace: 'X' }]).ok, false);
  assert.equal(applyEdits('a', []).ok, false);
});
test('block extraction', () => {
  const t = 'Hello\n```proposal\n{"kind":"content"}\n```\nBye\n```read\n{"files":[]}\n```';
  const r = extractBlocks(t); assert.equal(r.blocks.length, 2); assert.equal(r.clean, 'Hello\n\nBye');
  assert.deepEqual(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonLoose('here: {"a":2} thanks'), { a: 2 });
});
