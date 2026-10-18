import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyFailure, msUntilIstMidnight, orderChain, lastResort, runChain, pickModel, outputWarnings, slugKey, catalogEntry, CATALOG } from '../../supabase/functions/_shared/hub.ts';

const NOW = new Date('2026-10-18T10:00:00Z');                       // 15:30 in India
const P = (key, priority, o = {}) => ({ key, enabled: true, priority, model: null, state: 'ok', cooldown_until: null, last_error: null, ...o });
const ALL = { gemini: true, groq: true, openrouter: true, cerebras: false, mistral: false };

test('failure classification: rate limit vs daily quota vs bad key vs outage', () => {
  const rl = classifyFailure(429, 'Rate limit reached for requests per minute', 20, NOW);
  assert.deepEqual([rl.health, rl.cooldownMs], ['rate_limited', 30_000]);
  assert.equal(classifyFailure(429, 'Too many requests', null, NOW).cooldownMs, 120_000);
  const q = classifyFailure(429, 'You exceeded your current quota (free tier requests per day)', null, NOW);
  assert.equal(q.health, 'quota_out'); assert.ok(q.cooldownMs > 3600_000 && q.cooldownMs <= 12 * 3600_000);
  assert.equal(classifyFailure(429, '{"error":{"status":"RESOURCE_EXHAUSTED","message":"quota exceeded per day"}}', null, NOW).health, 'quota_out');
  assert.equal(classifyFailure(402, 'insufficient credits', null, NOW).health, 'quota_out');
  assert.equal(classifyFailure(400, 'API key not valid. Please pass a valid API key.', null, NOW).health, 'bad_key');
  assert.equal(classifyFailure(401, '', null, NOW).health, 'bad_key');
  assert.deepEqual(classifyFailure(422, 'empty answer (SAFETY)', null, NOW).health + classifyFailure(422, 'x', null, NOW).cooldownMs, 'ok0', 'a blocked prompt does not cool the provider down');
  assert.equal(classifyFailure(503, 'overloaded', null, NOW).health, 'error');
  assert.equal(classifyFailure(0, 'fetch failed', null, NOW).cooldownMs, 180_000);
  assert.equal(classifyFailure(429, 'rate limit', 99999, NOW).cooldownMs, 2 * 3600_000, 'Retry-After is capped');
});

test('IST midnight maths', () => {
  assert.equal(msUntilIstMidnight(NOW), 8.5 * 3600_000);              // 15:30 IST -> 8.5h left
  assert.equal(msUntilIstMidnight(new Date('2026-10-18T18:29:00Z')), 60_000, 'never less than a minute');
});

test('chain order: priority, skips disabled / unconfigured / cooling', () => {
  const states = [P('groq', 20), P('gemini', 10), P('openrouter', 30, { enabled: false }), P('cerebras', 40),
    P('mistral', 50, { cooldown_until: '2026-10-18T11:00:00Z' })];
  assert.deepEqual(orderChain(states, { ...ALL, mistral: true }, NOW).map((p) => p.key), ['gemini', 'groq']);
  assert.deepEqual(orderChain([P('gemini', 10, { cooldown_until: '2026-10-18T09:00:00Z' })], ALL, NOW).map((p) => p.key), ['gemini'], 'expired cooldown is healthy again');
});

test('failover: first provider out of quota -> second answers; first is cooled down and recorded', async () => {
  const rec = []; const calls = [];
  const out = await runChain({
    states: [P('gemini', 10), P('groq', 20)], configured: ALL, now: () => NOW,
    call: async (p) => { calls.push(p.key); return p.key === 'gemini' ? { ok: false, status: 429, body: 'quota exceeded per day' } : { ok: true, text: 'hello from groq', model: 'llama-x' }; },
    record: async (p, r) => { rec.push([p.key, r.ok ? 'ok' : r.failure.health]); },
  });
  assert.deepEqual(calls, ['gemini', 'groq']);
  assert.deepEqual([out.ok, out.provider, out.text], [true, 'groq', 'hello from groq']);
  assert.deepEqual(rec, [['gemini', 'quota_out'], ['groq', 'ok']]);
  assert.deepEqual(out.attempts.map((a) => [a.provider, a.ok]), [['gemini', false], ['groq', true]]);
});

test('failover: a thrown network error counts as a failure, not a crash', async () => {
  const out = await runChain({ states: [P('gemini', 10), P('groq', 20)], configured: ALL, now: () => NOW,
    call: async (p) => { if (p.key === 'gemini') throw new Error('socket hang up'); return { ok: true, text: 'ok' }; }, record: async () => {} });
  assert.equal(out.provider, 'groq'); assert.equal(out.attempts[0].health, 'error');
});

test('all providers failing returns a clear error with every attempt listed', async () => {
  const out = await runChain({ states: [P('gemini', 10), P('groq', 20)], configured: ALL, now: () => NOW,
    call: async () => ({ ok: false, status: 429, body: 'rate limit' }), record: async () => {} });
  assert.equal(out.ok, false); assert.equal(out.attempts.length, 2); assert.match(out.error, /out of free quota|failed/);
});

test('nothing configured -> helpful message; all cooling -> probe the one recovering soonest', async () => {
  const none = await runChain({ states: [P('gemini', 10)], configured: { gemini: false }, now: () => NOW, call: async () => assert.fail('must not call'), record: async () => {} });
  assert.match(none.error, /No AI provider is connected/);
  const states = [P('gemini', 10, { cooldown_until: '2026-10-18T12:00:00Z', state: 'quota_out' }), P('groq', 20, { cooldown_until: '2026-10-18T10:30:00Z', state: 'rate_limited' })];
  assert.equal(lastResort(states, ALL).key, 'groq');
  const out = await runChain({ states, configured: ALL, now: () => NOW, call: async (p) => ({ ok: true, text: p.key }), record: async () => {} });
  assert.deepEqual([out.ok, out.provider], [true, 'groq']);
  const bad = await runChain({ states: [P('gemini', 10, { state: 'bad_key', cooldown_until: '2026-10-18T16:00:00Z' })], configured: ALL, now: () => NOW, call: async () => assert.fail('bad key must not be probed'), record: async () => {} });
  assert.match(bad.error, /bad key/);
});

test('model discovery prefers the right family and ignores non-chat models', () => {
  assert.equal(pickModel(['whisper-large-v3', 'llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'meta-llama/llama-guard-4'], catalogEntry('groq')), 'llama-3.3-70b-versatile');
  assert.equal(pickModel(['gemini-2.5-flash-image', 'gemini-2.5-flash', 'gemini-2.5-pro'], catalogEntry('gemini')), 'gemini-2.5-flash');
  assert.equal(pickModel(['a/model', 'b/model:free', 'c/model:free'], catalogEntry('openrouter')), 'c/model:free');
  assert.equal(pickModel(['mistral-embed'], catalogEntry('mistral')), null);
});

test('catalog is consistent', () => {
  assert.equal(new Set(CATALOG.map((c) => c.key)).size, CATALOG.length);
  for (const c of CATALOG) { assert.match(c.envKey, /_API_KEY$/); assert.ok(c.style === 'gemini' || c.base?.startsWith('https://')); }
});

test('output warnings and slugs', () => {
  assert.equal(outputWarnings('Join today! Whey protein Rs 2500, we open at 5am.').length, 0);
  assert.equal(outputWarnings('Take 5 mg daily, 100% guaranteed results').length, 2);
  assert.equal(slugKey(' Event Planner Agent! '), 'event-planner-agent'); assert.equal(slugKey('বাংলা'), '');
});
