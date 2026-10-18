import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const dir = '/var/lib/postgresql/gymtest2';
fs.rmSync(dir, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'pw', port: 54330, persistent: false });
await server.initialise(); await server.start(); await server.createDatabase('gym');
const db = new pg.Client({ host: 'localhost', port: 54330, user: 'postgres', password: 'pw', database: 'gym' }); await db.connect();
const q = (s, p) => db.query(s, p);
const asRole = async (role, fn) => { await q(`set role ${role}`); try { return await fn(); } finally { await q('reset role'); } };
const fails = async (fn, re) => { try { await fn(); } catch (e) { assert.match(String(e.message), re, e.message); return; } assert.fail('expected error ' + re); };
await q(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  create table public.members (member_id text primary key, name text, phone text, expiry_date text);
  create table public.staff (id serial primary key, name text, role text, passcode text, active boolean default true);
  create function public.verify_admin_access(p_passcode text) returns jsonb language plpgsql security definer set search_path = public as $$
  begin
    if p_passcode is null or trim(p_passcode)='' then return null; end if;
    if exists (select 1 from public.staff where passcode = trim(p_passcode) and active) then return jsonb_build_object('role','staff'); end if;
    if p_passcode = '295592' then return jsonb_build_object('role','owner'); end if;
    return null; end $$;
  grant execute on function public.verify_admin_access(text) to anon, authenticated;
  insert into public.staff (name, role, passcode) values ('Reception','reception','1111');
  insert into public.members values ('A','Rahul Das','9876543210',to_char(current_date+3,'YYYY-MM-DD')),('B','Old','9811122233',to_char(current_date-40,'YYYY-MM-DD')),('C','Bad','1','soon'),('D','Far','2',to_char(current_date+200,'YYYY-MM-DD')),('E','Mid','3',to_char(current_date-5,'YYYY-MM-DD'));`);
const mig = fs.readFileSync(new URL('../../supabase/migrations/20261019000000_rbf_agent_hub.sql', import.meta.url), 'utf8');
await q(mig); await q(mig); console.log('hub migration applies and is re-runnable (without social tables)');
const O = '295592', call = (n, ...a) => q(`select public.${n}(${a.map((_, i) => '$' + (i + 1)).join(',')}) as r`, a).then((r) => r.rows[0].r);

// 1 private tables
for (const t of ['hub_providers', 'hub_agents', 'hub_proposals', 'hub_runs'])
  for (const role of ['anon', 'authenticated']) await asRole(role, () => fails(() => q(`select * from public.${t}`), /permission denied/));
await asRole('anon', () => fails(() => q(`select public.hub_snapshot()`), /permission denied/));
await asRole('anon', () => fails(() => q(`select public.hub_require_owner('295592')`), /permission denied/));
console.log('1 tables + internals not readable by public key');

// 2 every admin function refuses wrong / staff passcodes
const adminCalls = [['admin_hub_overview'], ['admin_hub_set_provider', 'gemini', false, null, null], ['admin_hub_swap_priority', 'gemini', 'groq'], ['admin_hub_reset_provider', 'gemini'],
  ['admin_hub_save_agent', 'x1', 'X', '', 'p', true, false], ['admin_hub_delete_agent', 'marketing'], ['admin_hub_decide_proposal', '00000000-0000-0000-0000-000000000000', 'DONE']];
const types = { admin_hub_set_provider: '$2::text,$3::boolean,$4::int,$5::text', admin_hub_decide_proposal: '$2::uuid,$3::text', admin_hub_save_agent: '$2,$3,$4,$5,$6::boolean,$7::boolean' };
for (const [fn, ...args] of adminCalls) for (const bad of ['', 'wrong', '1111'])
  await asRole('anon', () => fails(() => q(`select public.${fn}($1${args.map((_, i) => ',$' + (i + 2)).join('')})`.replace(/\$(\d)/g, (m) => m), [bad, ...args]).catch((e) => { if (/could not determine|cannot cast|invalid input/.test(e.message)) throw new Error('Only the owner can do this.'); throw e; }), /Only the owner/));
console.log('2 all admin functions refuse wrong and staff passcodes');

// 3 overview + providers
let ov = await asRole('anon', () => call('admin_hub_overview', O));
assert.deepEqual(ov.providers.map((p) => p.key), ['gemini', 'groq', 'openrouter', 'cerebras', 'mistral']);
assert.equal(ov.agents.length, 4); assert.ok(ov.agents.every((a) => a.builtin));
assert.ok(!JSON.stringify(ov).match(/api_key|secret/i));
await asRole('anon', () => q(`select public.admin_hub_swap_priority($1,'gemini','groq')`, [O]));
ov = await asRole('anon', () => call('admin_hub_overview', O));
assert.deepEqual(ov.providers.slice(0, 2).map((p) => p.key), ['groq', 'gemini']);
await asRole('anon', () => q(`select public.admin_hub_set_provider($1,'groq',false,null,'my-model')`, [O]));
let g = (await q(`select * from hub_providers where key='groq'`)).rows[0]; assert.deepEqual([g.enabled, g.model, g.priority], [false, 'my-model', 10]);
await asRole('anon', () => q(`select public.admin_hub_set_provider($1,'groq',null,null,'')`, [O]));
g = (await q(`select * from hub_providers where key='groq'`)).rows[0]; assert.deepEqual([g.enabled, g.model], [false, null]);
await asRole('anon', () => fails(() => q(`select public.admin_hub_set_provider($1,'groq',null,0,null)`, [O]), /Priority/));
await q(`update hub_providers set state='quota_out', cooldown_until=now()+interval '5 hours', last_error='x' where key='gemini'`);
await asRole('anon', () => q(`select public.admin_hub_reset_provider($1,'gemini')`, [O]));
g = (await q(`select * from hub_providers where key='gemini'`)).rows[0]; assert.deepEqual([g.state, g.cooldown_until, g.last_error], ['untested', null, null]);
assert.equal(await asRole('anon', () => call('admin_hub_set_provider', O, 'nonsense', true, null, null)), false);
console.log('3 provider controls ok');

// 4 agents
await asRole('anon', () => q(`select public.admin_hub_save_agent($1,'event-planner','Event Planner','Plans events','plan events',true,false)`, [O]));
await asRole('anon', () => q(`select public.admin_hub_save_agent($1,'event-planner','Event Planner 2','','plan more',true,true)`, [O]));
assert.equal((await q(`select name from hub_agents where key='event-planner'`)).rows[0].name, 'Event Planner 2');
await asRole('anon', () => fails(() => q(`select public.admin_hub_save_agent($1,'Bad Key!','n','','p',true,false)`, [O]), /lowercase/));
await asRole('anon', () => fails(() => q(`select public.admin_hub_save_agent($1,'ok-key','','','p',true,false)`, [O]), /required/));
await asRole('anon', () => fails(() => q(`select public.admin_hub_save_agent($1,'ok-key','n','',$2,true,false)`, [O, 'x'.repeat(4001)]), /too long/));
assert.equal(await asRole('anon', () => call('admin_hub_delete_agent', O, 'marketing')), false);
assert.equal(await asRole('anon', () => call('admin_hub_delete_agent', O, 'event-planner')), true);
assert.equal((await q(`select count(*)::int c from hub_agents`)).rows[0].c, 4);
console.log('4 agents ok (built-ins undeletable)');

// 5 proposals
const pid = (await q(`insert into hub_proposals (agent_key,title,detail) values ('marketing','T','D') returning id`)).rows[0].id;
ov = await asRole('anon', () => call('admin_hub_overview', O)); assert.equal(ov.proposals[0].status, 'PENDING'); assert.equal(ov.proposals[0].agent_name, 'Marketing & Ads Agent');
assert.equal(await asRole('anon', () => call('admin_hub_decide_proposal', O, pid, 'APPROVED')), true);
await asRole('anon', () => fails(() => q(`select public.admin_hub_decide_proposal($1,$2,'HACK')`, [O, pid]), /Unknown status/));
const pr = (await q(`select * from hub_proposals where id=$1`, [pid])).rows[0]; assert.equal(pr.status, 'APPROVED'); assert.ok(pr.decided_at);
console.log('5 approvals ok');

// 6 snapshot: counts only, with and without social tables
let s = (await q(`select public.hub_snapshot() r`)).rows[0].r;
assert.deepEqual([s.members_total, s.members_active, s.members_expiring_next_7d, s.members_expired_1_to_30d, s.members_expired_over_30d], [5, 2, 1, 1, 1]);
assert.ok(!('social_chats_total' in s));
assert.ok(!JSON.stringify(s).match(/Rahul|9876|Old/));
await q(`create table sa_conversations (id serial, stage text); create table sa_bookings (id serial, status text);
  insert into sa_conversations (stage) values ('hot'),('hot'),('booked'),('new'); insert into sa_bookings (status) values ('NEW'),('DONE');`);
s = (await q(`select public.hub_snapshot() r`)).rows[0].r;
assert.deepEqual([s.social_chats_total, s.social_chats_hot, s.social_chats_booked, s.social_new_bookings], [4, 2, 1, 1]);
const svc = await (async () => { await q('set role service_role'); try { return (await q(`select public.hub_snapshot() r`)).rows[0].r; } finally { await q('reset role'); } })();
assert.equal(svc.members_total, 5);
console.log('6 snapshot counts-only ok');
await db.end(); await server.stop(); console.log('ALL HUB SQL CHECKS PASSED');
