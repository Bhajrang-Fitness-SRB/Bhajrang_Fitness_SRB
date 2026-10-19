// Retention Desk SQL check on a real Postgres (needs: npm i embedded-postgres pg). Uses small stand-in tables.
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const dir = '/tmp/gymtest_retention';
fs.rmSync(dir, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'pw', port: 54332, persistent: false });
await server.initialise(); await server.start(); await server.createDatabase('gym');
const db = new pg.Client({ host: 'localhost', port: 54332, user: 'postgres', password: 'pw', database: 'gym' }); await db.connect();
const q = (s, p) => db.query(s, p);
const day = (n) => `((now() at time zone 'Asia/Kolkata')::date + (${n}))::text`;
await q(`create role anon nologin; create role authenticated nologin;
 create table members (member_id text primary key, name text, phone text, whatsapp text, package text, expiry_date text, joining_date text);
 create table packages (name text, price int);
 create table attendance_logs (id serial primary key, member_id text, punch_in_time timestamptz, status text);
 create table staff (passcode text, active boolean);
 create function verify_admin_access(p text) returns jsonb language sql as $$ select case when p = 'staff1' then '{"role":"staff"}'::jsonb end $$;
 insert into packages values ('Monthly', 1500), ('Quarterly', 4000);
 insert into members values
  ('RB001','Soon7','9000000001',null,'Monthly',${day(3)},${day(-100)}),
  ('RB002','Soon20','9000000002','9100000002','Quarterly',${day(20)},${day(-100)}),
  ('RB003','Expired5','9000000003',null,'Monthly',${day(-5)},${day(-100)}),
  ('RB004','Away10','9000000004',null,'Monthly',${day(25)},${day(-100)}),
  ('RB005','Regular','9000000005',null,'Monthly',${day(25)},${day(-100)}),
  ('RB006','NeverCame','9000000006',null,'Monthly',${day(25)},${day(-20)}),
  ('RB007','NoPrice','9000000007',null,'Mystery',${day(2)},${day(-100)}),
  ('RB008','LongGone','9000000008',null,'Monthly',${day(-90)},${day(-300)});
 insert into attendance_logs (member_id, punch_in_time) values
  ('RB001', now() - interval '1 day'), ('RB004', now() - interval '10 days'), ('RB005', now() - interval '2 days'), ('RB005', now() - interval '9 days'), ('RB003', now() - interval '12 days');`);
await q(fs.readFileSync(new URL('../../supabase/migrations/20261023000000_rbf_retention_desk.sql', import.meta.url), 'utf8'));
await q(fs.readFileSync(new URL('../../supabase/migrations/20261023000000_rbf_retention_desk.sql', import.meta.url), 'utf8')); // twice = safe
const asRole = async (role, fn) => { await q(`set role ${role}`); try { return await fn(); } finally { await q('reset role'); } };
const call = (n, ...a) => asRole('anon', async () => (await q(`select public.${n}(${a.map((_, i) => '$' + (i + 1)).join(',')}) as r`, a)).rows[0].r);
const refused = async (fn) => { try { await fn(); assert.fail('should have been refused'); } catch (e) { assert.match(String(e.message), /Access denied|permission denied/i); } };

// access
await refused(() => call('admin_retention_overview', 'wrong', 7));
await refused(() => call('admin_retention_overview', '', 7));
await refused(() => call('admin_retention_overview', null, 7));
await refused(() => call('admin_retention_log_contact', 'wrong', 'RB001', 'churn'));
await asRole('anon', () => refused(() => q('select * from retention_contacts')));   // log table is private

// numbers
let o = await call('admin_retention_overview', 'staff1', 7);
const ids = (a) => a.map((x) => x.member_id).sort();
assert.deepEqual(ids(o.renewals), ['RB001', 'RB002', 'RB003', 'RB004', 'RB005', 'RB006', 'RB007'], 'renewals window is -30..+30 days; long-gone RB008 is left out');
assert.equal(o.totals.expected_7d, 1500, 'only RB001 (priced) expires within 7 days; RB007 has no price');
assert.equal(o.totals.expected_30d, 1500 + 4000 + 1500 * 3);
assert.equal(o.totals.count_7d, 2); assert.equal(o.totals.count_30d, 6);
assert.equal(o.totals.expired_30d, 1); assert.equal(o.totals.expired_value_30d, 1500);
assert.equal(o.totals.unpriced, 1, 'unmatched package is flagged, not guessed');
assert.equal(o.renewals.find((r) => r.member_id === 'RB002').phone, '9100000002', 'prefers WhatsApp number');
assert.equal(o.renewals.find((r) => r.member_id === 'RB001').phone, '9000000001');
assert.deepEqual(ids(o.churn), ['RB002', 'RB004', 'RB006', 'RB007'], 'active members with no recent visit (RB002/RB007/RB006 never logged one); RB001/RB005 came recently; RB003/RB008 expired so are not churn');
assert.equal(o.churn.find((r) => r.member_id === 'RB004').days_away, 10);
assert.equal(o.churn.find((r) => r.member_id === 'RB006').never_visited, true);
assert.equal(o.totals.churn_count, 4); assert.equal(o.totals.churn_at_risk_30d, 4000 + 1500 + 1500, 'unpriced RB007 adds nothing');

// churn window setting (clamped 3..60)
o = await call('admin_retention_overview', 'staff1', 14); assert.deepEqual(ids(o.churn), ['RB002', 'RB006', 'RB007'], 'with 14 days, RB004 (10 days away) is fine');
o = await call('admin_retention_overview', 'staff1', 1); assert.equal(o.churn_days, 3);
o = await call('admin_retention_overview', 'staff1', 999); assert.equal(o.churn_days, 60);

// contact log
await call('admin_retention_log_contact', 'staff1', 'rb004', 'churn');
await assert.rejects(() => call('admin_retention_log_contact', 'staff1', 'RB004', 'spam'), /Unknown kind/);
await assert.rejects(() => call('admin_retention_log_contact', 'staff1', 'NOPE', 'churn'), /Unknown member/);
o = await call('admin_retention_overview', 'staff1', 7);
assert.ok(o.churn.find((r) => r.member_id === 'RB004').last_contact, 'contact remembered');
assert.equal(o.churn.find((r) => r.member_id === 'RB006').last_contact, null);
assert.equal(o.renewals.find((r) => r.member_id === 'RB001').last_contact, null, 'churn contact does not mark renewals as messaged');

await db.end(); await server.stop(); console.log('RETENTION DESK SQL CHECKS PASSED');
