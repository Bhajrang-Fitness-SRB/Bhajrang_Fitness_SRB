// Registration approval on a real Postgres: reproduces the old crash, then proves the fix (needs: npm i embedded-postgres pg).
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const dir = process.env.PG_TEST_DIR || '/tmp/gymtest_approval';
fs.rmSync(dir, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'pw', port: 54352, persistent: false });
await server.initialise(); await server.start(); await server.createDatabase('gym');
const db = new pg.Client({ host: 'localhost', port: 54352, user: 'postgres', password: 'pw', database: 'gym' }); await db.connect();
const q = (s, p) => db.query(s, p);
await q(`create role anon nologin; create role authenticated nologin; grant usage on schema public to anon, authenticated;
 create sequence member_id_seq;
 create function _norm_mobile(t text) returns text language sql immutable as $$ select right(regexp_replace(coalesce(t,''),'\\D','','g'),10) $$;
 create function _today_ist() returns date language sql as $$ select (now() at time zone 'Asia/Kolkata')::date $$;
 create function verify_admin_access(p text) returns jsonb language sql as $$ select case when p in ('staff1','own') then '{"role":"staff"}'::jsonb end $$;
 create table pending_approvals (id serial primary key, name text, mobile text, email text, dob date, address text, photo_base64 text, status text default 'PENDING', father_name text, gender text, blood_group text, govt_id text, occupation text, marital_status text, whatsapp text, city text, state text, pin text, gym_experience_years text, goal text, height_cm numeric, weight_kg numeric, medical_conditions text, reviewed_at timestamptz);
 create table members (member_id text primary key, name text, father_name text, dob date, gender text, blood_group text, govt_id text, occupation text, marital_status text, phone text, whatsapp text, email text, address text, city text, state text, pin text, gym_experience_years text, profile_pic text, joining_date date, package text, expiry_date text, goal text, height_cm numeric, weight_kg numeric, medical_conditions text, pt_package text, pt_expiry_date text);
 create table ghost_vault (name text, member_id text, mobile text, passcode text, join_date text);
 create table billing (id serial primary key, member_id text, package_name text, amount int, discount int, paid int, due int, payment_date date, start_date date, expiry_date text, kind text);
 create table packages (id serial primary key, name text, duration_months int, price int, description text, category text);
 insert into packages (name, duration_months, price, category) values ('Monthly', 1, 1500, 'GYM'), ('PT Gold', 3, 6000, 'PT');
 insert into pending_approvals (name, mobile, whatsapp) values ('Plain Person','+91 98765 00001',''),('Pt Person','9876500002','9876500002'),('Bad Mobile','12345',''),('Dup Person','9876500001',''),('Partial Pay','9876500005',''),('No Pt Found','9876500006','');`);
// 1) the function exactly as it was running live (the bug)
const live = fs.readFileSync(new URL('./live_before.sql', import.meta.url), 'utf8');
await q(live);
const call = (id, extra = {}) => { const a = { pc: 'staff1', id, pkg: 'Monthly', amt: 1500, months: 1, disc: 0, paid: null, pt: null, ...extra };
  return q(`select public.approve_member($1,$2,$3,$4,$5,$6,$7,null,null,false,$8) as r`, [a.pc, a.id, a.pkg, a.amt, a.months, a.disc, a.paid, a.pt]); };
await assert.rejects(() => call(1), (e) => e.code === '55000' && /v_pt/.test(e.message), 'old function reproduces the live crash');
assert.equal((await q(`select count(*)::int c from members`)).rows[0].c, 0, 'crash left nothing half-saved');
console.log('1 ok: old function crashes exactly like live (55000 v_pt)');
// 2) the fix
await q(fs.readFileSync(new URL('../../supabase/migrations/20261025000000_rbf_fix_approve_member_pt.sql', import.meta.url), 'utf8'));
await q(fs.readFileSync(new URL('../../supabase/migrations/20261025000000_rbf_fix_approve_member_pt.sql', import.meta.url), 'utf8'));   // twice = safe
await q('set role anon');
const r1 = (await call(1)).rows[0].r;
assert.match(r1.member_id, /^SRB929\d{5}$/); assert.match(r1.passcode, /^\d{4}$/);
await q('reset role');
const m = (await q(`select * from members where member_id=$1`, [r1.member_id])).rows[0];
assert.equal(m.phone, '9876500001'); assert.equal(m.package, 'Monthly'); assert.equal(m.pt_package, null);
assert.equal((await q(`select count(*)::int c from ghost_vault where member_id=$1 and passcode=$2`, [r1.member_id, r1.passcode])).rows[0].c, 1, 'passcode saved so the member can log in');
const b1 = (await q(`select * from billing where member_id=$1`, [r1.member_id])).rows; assert.equal(b1.length, 1); assert.equal(b1[0].kind, 'Membership'); assert.equal(b1[0].paid, 1500); assert.equal(b1[0].due, 0);
assert.equal((await q(`select status from pending_approvals where id=1`)).rows[0].status, 'APPROVED');
console.log('2 ok: approval without a PT package works (member, passcode, billing, status)');
// 3) with a PT package
const r2 = (await call(2, { pt: 'pt gold ' })).rows[0].r;
const b2 = (await q(`select kind, amount, paid, due from billing where member_id=$1 order by kind`, [r2.member_id])).rows; assert.deepEqual(b2.map((x) => x.kind), ['Membership', 'PT']); assert.equal(b2[1].amount, 6000);
assert.equal((await q(`select pt_package from members where member_id=$1`, [r2.member_id])).rows[0].pt_package, 'PT Gold');
console.log('3 ok: approval with a PT package adds the PT bill and PT fields');
// 4) guards give clear messages and save nothing
const before = (await q(`select (select count(*) from members)::int m, (select count(*) from billing)::int b`)).rows[0];
await assert.rejects(() => call(3), /INVALID_MOBILE/);
await assert.rejects(() => call(4), /DUPLICATE_MOBILE/);
await assert.rejects(() => call(1), /No pending approval/);
await assert.rejects(() => call(6, { pt: 'Nope' }), /PT package not found/);
await assert.rejects(() => call(5, { pc: 'wrong' }), /Access denied/);
await assert.rejects(() => call(5, { pkg: '  ' }), /PACKAGE_REQUIRED/);
await assert.rejects(() => call(5, { amt: null }), /INVALID_AMOUNT/);
await assert.rejects(() => call(5, { amt: -1 }), /INVALID_AMOUNT/);
const after = (await q(`select (select count(*) from members)::int m, (select count(*) from billing)::int b`)).rows[0]; assert.deepEqual(after, before, 'refusals saved nothing');
console.log('4 ok: bad mobile, duplicate, already approved, wrong passcode, missing package/amount all refused cleanly');
// 5) partial payment + discount
const r5 = (await call(5, { amt: 2000, disc: 500, paid: 700 })).rows[0].r;
const b5 = (await q(`select amount, discount, paid, due from billing where member_id=$1`, [r5.member_id])).rows[0]; assert.deepEqual(b5, { amount: 2000, discount: 500, paid: 700, due: 800 });
console.log('5 ok: discount and part payment leave the right amount due');
await db.end(); await server.stop(); console.log('ALL APPROVAL CHECKS PASSED');
