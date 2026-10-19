import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const dir = process.env.PG_TEST_DIR || '/var/lib/postgresql/gymtest'; // must be writable by the 'postgres' OS user
fs.rmSync(dir, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'pw', port: 54329, persistent: false });
await server.initialise(); await server.start();
await server.createDatabase('gym');
const db = new pg.Client({ host: 'localhost', port: 54329, user: 'postgres', password: 'pw', database: 'gym' });
await db.connect();
const q = (s, p) => db.query(s, p);
const asRole = async (role, fn) => { await q(`set role ${role}`); try { return await fn(); } finally { await q('reset role'); } };
const fails = async (fn, re) => { try { await fn(); } catch (e) { assert.match(String(e.message), re, e.message); return; } assert.fail('expected an error matching ' + re); };

// ---- stand-ins for what already exists in the real project
await q(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  create table public.members (member_id text primary key, name text, phone text, whatsapp text, package text, expiry_date text, goal text);
  create table public.staff (id serial primary key, name text, role text, passcode text, active boolean default true);
  create function public.verify_owner_passcode(p text) returns boolean language sql as $$ select p = '295592' $$;
  create function public.verify_admin_access(p_passcode text) returns jsonb language plpgsql security definer set search_path = public as $$
  declare v_staff record; begin
    if p_passcode is null or trim(p_passcode) = '' then return null; end if;
    select * into v_staff from public.staff where passcode = trim(p_passcode) and active = true limit 1;
    if found then return jsonb_build_object('role','staff','name',v_staff.name); end if;
    if public.verify_owner_passcode(p_passcode) then return jsonb_build_object('role','owner','name','Owner'); end if;
    return null; end $$;
  grant execute on function public.verify_admin_access(text) to anon, authenticated;
  insert into public.staff (name, role, passcode) values ('Reception', 'reception', '1111');
  insert into public.members values ('RB001','Rahul Das','98765 43210','','Monthly',to_char((now() at time zone 'Asia/Kolkata')::date + 3,'YYYY-MM-DD'),'fat loss'),
    ('RB002','Old Member','9811122233','+91 98111-22233','Quarterly',to_char((now() at time zone 'Asia/Kolkata')::date - 40,'YYYY-MM-DD'),'strength'),
    ('RB003','Far Future','9000000003','','Yearly',to_char((now() at time zone 'Asia/Kolkata')::date + 200,'YYYY-MM-DD'),''),
    ('RB004','Bad Date','9000000004','','Monthly','soon',''),
    ('RB005','No Phone','','','Monthly',to_char((now() at time zone 'Asia/Kolkata')::date + 2,'YYYY-MM-DD'),'');`);

const dirM = new URL('../../supabase/migrations/', import.meta.url).pathname;
for (const f of ['20261017000000_rbf_social_sales_agent.sql', '20261018000000_rbf_social_inbox_rpcs.sql']) await q(fs.readFileSync(dirM + f, 'utf8'));
await q(`select 1`);
console.log('migrations applied cleanly');

// re-run is idempotent (migrations must be safe to run twice)
for (const f of ['20261017000000_rbf_social_sales_agent.sql', '20261018000000_rbf_social_inbox_rpcs.sql']) await q(fs.readFileSync(dirM + f, 'utf8'));
console.log('migrations are re-runnable');

// ---- seed private data as the database owner
const c1 = (await q(`insert into sa_conversations (channel,external_id,display_name,stage,needs_attention,attention_reason,last_inbound_at,member_id) values ('whatsapp','919876543210','Rahul','hot',true,'dose question', now() - interval '1 hour','RB001') returning id`)).rows[0].id;
const c2 = (await q(`insert into sa_conversations (channel,external_id,display_name,stage,last_inbound_at) values ('instagram','IG1','Priya','interested', now() - interval '30 hours') returning id`)).rows[0].id;
await q(`insert into sa_conversations (channel,external_id,human_takeover) values ('facebook','FB1',true)`);
await q(`insert into sa_messages (conversation_id,direction,body,created_at) values ($1,'in','hello',now()-interval '70 min'),($1,'out','Hi Rahul!',now()-interval '69 min'),($1,'in','how much creatine',now()-interval '60 min')`, [c1]);
await q(`insert into sa_messages (conversation_id,direction,body,by_human) values ($1,'out','Owner says hi',true)`, [c2]);
const b1 = (await q(`insert into sa_bookings (conversation_id,kind,customer_name,contact,channel,preferred_time) values ($1,'trial','Rahul','+919876543210','whatsapp','kal 6pm') returning id`, [c1])).rows[0].id;
const f1 = (await q(`insert into sa_followups (member_id,kind,expiry_date,message,status,wa_link) values ('RB001','renew_3','2026-10-20','Hi Rahul','DRAFT','https://wa.me/1'),('RB002','lapsed_30','2026-09-01','Hi Old','SENT',null) returning id`)).rows[0].id;

const OWNER = '295592';
const call = (name, ...args) => q(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as r`, args).then(r => r.rows[0].r);

// ---- 1. the public key can NOT read the private tables directly
for (const t of ['sa_conversations', 'sa_messages', 'sa_bookings', 'sa_followups', 'sa_knowledge'])
  await asRole('anon', () => fails(() => q(`select * from public.${t}`), /permission denied/));
await asRole('authenticated', () => fails(() => q(`select * from public.sa_messages`), /permission denied/));
await asRole('anon', () => fails(() => q(`insert into public.sa_bookings (kind) values ('trial')`), /permission denied/));
await asRole('anon', () => fails(() => q(`select public.sa_require_owner('295592')`), /permission denied/));
await asRole('anon', () => fails(() => q(`select * from public.sa_find_member('9876543210')`), /permission denied/));
console.log('1 ok: anon/authenticated cannot touch private tables or internal functions');

// ---- 2. only the owner passcode opens the RPCs (wrong, empty, null, staff all refused)
const RPCS = [['admin_sa_inbox'], ['admin_sa_thread', c1], ['admin_sa_bookings'], ['admin_sa_followups'], ['admin_sa_knowledge'],
  ['admin_sa_set_conversation', c1], ['admin_sa_set_booking', b1, 'DONE'], ['admin_sa_mark_followup', f1, 'SENT'], ['admin_sa_set_knowledge', 'offers', 'x']];
for (const bad of ['wrong', '', null, '1111', ' ']) for (const [name, ...rest] of RPCS)
  await asRole('anon', () => fails(() => call(name, bad, ...rest), /Only the owner/));
console.log('2 ok: wrong / empty / null / STAFF passcode refused on all 9 functions');

// ---- 3. inbox
const inbox = await asRole('anon', () => call('admin_sa_inbox', OWNER, 'all', 50));
assert.deepEqual(inbox.counts, { needs_attention: 1, new_bookings: 1, draft_reminders: 1, hot: 1 });
assert.equal(inbox.conversations.length, 3);
assert.equal(inbox.conversations[0].id, c1, 'needs-attention chat sorts first');
assert.equal(inbox.conversations[0].last_message, 'how much creatine'); assert.equal(inbox.conversations[0].last_direction, 'in');
const names = async (f) => (await asRole('anon', () => call('admin_sa_inbox', OWNER, f, 50))).conversations.map(c => c.channel).sort();
assert.deepEqual(await names('attention'), ['whatsapp']); assert.deepEqual(await names('takeover'), ['facebook']);
assert.deepEqual(await names('hot'), ['whatsapp']); assert.deepEqual(await names('instagram'), ['instagram']);
assert.equal((await asRole('anon', () => call('admin_sa_inbox', OWNER, "x'; drop table sa_messages;--", 50))).conversations.length, 3, 'unknown filter acts as all, no injection');
assert.equal((await asRole('anon', () => call('admin_sa_inbox', OWNER, 'all', 1))).conversations.length, 1);
console.log('3 ok: inbox counts, ordering, filters, limit');

// ---- 4. thread: order, member join, 24h window
const t1 = await asRole('anon', () => call('admin_sa_thread', OWNER, c1, 100));
assert.deepEqual(t1.messages.map(m => m.body), ['hello', 'Hi Rahul!', 'how much creatine']);
assert.equal(t1.window_open, true); assert.equal(t1.conversation.member_name, 'Rahul Das'); assert.equal(t1.conversation.member_package, 'Monthly');
const t2 = await asRole('anon', () => call('admin_sa_thread', OWNER, c2, 100));
assert.equal(t2.window_open, false, '30h since last customer message -> reply locked'); assert.equal(t2.messages[0].by_human, true);
await asRole('anon', () => fails(() => call('admin_sa_thread', OWNER, '00000000-0000-0000-0000-000000000000', 10), /not found/));
console.log('4 ok: thread order, member join, 24h window');

// ---- 5. change a chat
await asRole('anon', () => call('admin_sa_set_conversation', OWNER, c1, true, null, null));
let row = (await q(`select human_takeover, needs_attention, stage, attention_reason from sa_conversations where id=$1`, [c1])).rows[0];
assert.deepEqual([row.human_takeover, row.needs_attention, row.stage], [true, true, 'hot'], 'only the given field changes');
await asRole('anon', () => call('admin_sa_set_conversation', OWNER, c1, null, false, 'customer'));
row = (await q(`select human_takeover, needs_attention, stage, attention_reason from sa_conversations where id=$1`, [c1])).rows[0];
assert.deepEqual([row.human_takeover, row.needs_attention, row.stage, row.attention_reason], [true, false, 'customer', null]);
await asRole('anon', () => fails(() => call('admin_sa_set_conversation', OWNER, c1, null, null, 'vip'), /Unknown stage/));
assert.equal(await asRole('anon', () => call('admin_sa_set_conversation', OWNER, '00000000-0000-0000-0000-000000000000', true, null, null)), false);
console.log('5 ok: partial updates, stage validation');

// ---- 6. bookings / followups / knowledge
const bl = await asRole('anon', () => call('admin_sa_bookings', OWNER)); assert.equal(bl.length, 1); assert.equal(bl[0].status, 'NEW');
await asRole('anon', () => fails(() => call('admin_sa_set_booking', OWNER, b1, 'HACKED'), /Unknown status/));
await asRole('anon', () => call('admin_sa_set_booking', OWNER, b1, 'CONFIRMED'));
assert.equal((await q(`select status from sa_bookings where id=$1`, [b1])).rows[0].status, 'CONFIRMED');
const fl = await asRole('anon', () => call('admin_sa_followups', OWNER)); assert.equal(fl[0].status, 'DRAFT'); assert.equal(fl[0].member_name, 'Rahul Das');
assert.equal(await asRole('anon', () => call('admin_sa_mark_followup', OWNER, f1, 'SENT')), true);
assert.equal(await asRole('anon', () => call('admin_sa_mark_followup', OWNER, f1, 'SENT')), false, 'already sent: cannot be flipped again');
await asRole('anon', () => fails(() => call('admin_sa_mark_followup', OWNER, f1, 'DRAFT'), /Unknown status/));
await asRole('anon', () => call('admin_sa_set_knowledge', OWNER, 'offers', 'Quarterly Rs 200 off till 31 Oct'));
assert.equal((await q(`select content from sa_knowledge where key='offers'`)).rows[0].content, 'Quarterly Rs 200 off till 31 Oct');
await asRole('anon', () => call('admin_sa_set_knowledge', OWNER, 'auto_send_followups', ' YES '));
assert.equal((await q(`select content from sa_knowledge where key='auto_send_followups'`)).rows[0].content, 'yes');
await asRole('anon', () => fails(() => call('admin_sa_set_knowledge', OWNER, 'auto_send_followups', 'maybe'), /yes or no/));
await asRole('anon', () => fails(() => call('admin_sa_set_knowledge', OWNER, 'default_language', 'fr'), /en, bn or bn-roman/));
assert.equal(await asRole('anon', () => call('admin_sa_set_knowledge', OWNER, 'not_a_key', 'x')), false, 'cannot invent new keys');
console.log('6 ok: bookings, reminders, knowledge validation');

// ---- 7. agent-side helpers (service role only)
const fm = await asRole('service_role', () => q(`select * from public.sa_find_member('+91 9876543210')`));
assert.equal(fm.rows[0]?.member_id, 'RB001', 'matches despite spaces / +91');
assert.equal((await asRole('service_role', () => q(`select * from public.sa_find_member('12345')`))).rowCount, 0);
assert.equal((await asRole('service_role', () => q(`select * from public.sa_find_member('9811122233')`))).rows[0].member_id, 'RB002', 'matches whatsapp column too');
const cand = (await asRole('service_role', () => q(`select member_id, days_left from public.sa_followup_candidates(7,180)`))).rows;
assert.deepEqual(cand.map(r => r.member_id).sort(), ['RB001', 'RB002'], 'future / bad-date / no-phone members excluded');
assert.equal(cand.find(r => r.member_id === 'RB001').days_left, 3); assert.equal(cand.find(r => r.member_id === 'RB002').days_left, -40);
console.log('7 ok: member lookup + follow-up candidates (bad dates and missing phones handled)');

await db.end(); await server.stop();
console.log('ALL SQL CHECKS PASSED');
