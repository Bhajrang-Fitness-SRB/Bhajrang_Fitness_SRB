// CSV member import on a real Postgres (needs: npm i embedded-postgres pg).
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const dir = process.env.PG_TEST_DIR || '/tmp/gymtest_import';
fs.rmSync(dir, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'pw', port: 54372, persistent: false });
await server.initialise(); await server.start(); await server.createDatabase('gym');
const db = new pg.Client({ host: 'localhost', port: 54372, user: 'postgres', password: 'pw', database: 'gym' }); await db.connect();
const q = (s, p) => db.query(s, p);
await q(`create role anon nologin; create role authenticated nologin; grant usage on schema public to anon, authenticated;
 create function _norm_mobile(t text) returns text language sql immutable as $$ select right(regexp_replace(coalesce(t,''),'\\D','','g'),10) $$;
 create function _today_ist() returns date language sql as $$ select (now() at time zone 'Asia/Kolkata')::date $$;
 create function verify_admin_access(p text) returns jsonb language sql as $$ select case when p = 'staff1' then '{"role":"staff"}'::jsonb end $$;
 create table members (member_id text primary key, name text not null, phone text not null, whatsapp text, email text, dob date, gender text, blood_group text, marital_status text, father_name text, govt_id text, occupation text, address text, city text, state text, pin text, gym_experience_years text, joining_date date, package text, expiry_date text, goal text, height_cm numeric, weight_kg numeric, medical_conditions text, profile_pic text);
 create table ghost_vault (name text, member_id text, mobile text, passcode text, join_date text);
 insert into members (member_id, name, phone, joining_date, package, city) values ('RB001','Old Joiner','9000000001','2025-01-15','Monthly','Pune'), ('RB002','Other Person','9000000002','2025-03-01','Quarterly','Delhi');
 insert into ghost_vault values ('Old Joiner','RB001','9000000001','1111','2025-01-15');`);
const mig = fs.readFileSync(new URL('../../supabase/migrations/20261027000000_rbf_admin_import_members.sql', import.meta.url), 'utf8');
await q(mig); await q(mig);
const imp = async (rows, pc = 'staff1') => { await q('set role anon'); try { return (await q(`select public.admin_import_members($1, $2::jsonb) r`, [pc, JSON.stringify(rows)])).rows[0].r; } finally { await q('reset role'); } };
const one = async (sql, p) => (await q(sql, p)).rows[0];
// access + shape
await assert.rejects(() => imp([{ member_id: 'X' }], 'wrong'), /Access denied/);
await assert.rejects(() => imp({ a: 1 }), /list of members/);
await assert.rejects(() => imp(Array.from({ length: 1001 }, (_, i) => ({ member_id: 'M' + i }))), /Too many rows/);
console.log('1 ok: passcode required, bad shape and oversize refused');
// update only what is given: joining date and everything else untouched
let r = await imp([{ member_id: ' rb001 ', phone: '+91 98765-43210', city: 'Mumbai', joining_date: '' }]);
assert.deepEqual([r.inserted, r.updated, r.failed.length], [0, 1, 0]);
let m = await one(`select * from members where member_id='RB001'`);
assert.equal(m.phone, '9876543210'); assert.equal(m.city, 'Mumbai'); assert.equal(String(m.joining_date.toISOString?.().slice(0, 10) ?? m.joining_date), '2025-01-15'); assert.equal(m.package, 'Monthly');
assert.equal((await one(`select mobile from ghost_vault where member_id='RB001'`)).mobile, '9876543210', 'login record phone follows');
assert.equal((await one(`select passcode from ghost_vault where member_id='RB001'`)).passcode, '1111', 'existing passcode untouched');
console.log('2 ok: update changes only the given columns (joining date NOT reset), phone cleaned');
// single-column update, multi-column update
r = await imp([{ member_id: 'RB002', package: 'Yearly' }]); assert.equal(r.updated, 1);
assert.equal((await one(`select package, city from members where member_id='RB002'`)).city, 'Delhi');
r = await imp([{ member_id: 'RB002', name: 'Renamed', height_cm: '172.5', dob: '1999-04-02' }]); assert.equal(r.updated, 1);
m = await one(`select name, height_cm, dob from members where member_id='RB002'`); assert.equal(m.name, 'Renamed'); assert.equal(Number(m.height_cm), 172.5);
console.log('3 ok: single and multi column updates, numbers and dates cast');
// new member
const today = (await one(`select (now() at time zone 'Asia/Kolkata')::date::text d`)).d;
r = await imp([{ member_id: 'new100', name: 'Fresh Face', phone: '98111 22233', package: 'Monthly' }]);
assert.deepEqual([r.inserted, r.updated, r.failed.length], [1, 0, 0]); assert.equal(r.created[0].member_id, 'NEW100'); assert.match(r.created[0].passcode, /^\d{4}$/);
m = await one(`select phone, joining_date::text jd from members where member_id='NEW100'`); assert.equal(m.phone, '9811122233'); assert.equal(m.jd, today, 'new member joining date defaults to today');
assert.equal((await one(`select count(*)::int c from ghost_vault where member_id='NEW100' and passcode=$1`, [r.created[0].passcode])).c, 1, 'new member can log in');
console.log('4 ok: new member created with phone, default joining date and a login passcode');
// refusals are per row; good rows still saved
r = await imp([
  { member_id: 'RB001', city: 'Kept' },                             // fine
  { member_id: 'NEW200', phone: '9000000002', name: 'Dup Phone' },   // phone of RB002
  { member_id: 'NEW201', name: 'No Phone' },                          // new needs phone
  { member_id: 'NEW202', phone: '9811100000' },                       // new needs name
  { member_id: '', name: 'No Id', phone: '9811100001' },
  { member_id: 'NEW203', name: 'Bad Phone', phone: '12345' },
  { member_id: 'RB001', dob: 'not-a-date' },                          // bad value
  { member_id: 'RB001', phone: '9000000002' },                        // taking another member's phone
  { member_id: 'NEW204', name: 'Good One', phone: '9811100004' }]);
assert.equal(r.updated, 1); assert.equal(r.inserted, 1); assert.equal(r.failed.length, 7);
assert.ok(r.failed.some((f) => /already belongs to member RB002/.test(f.error))); assert.ok(r.failed.some((f) => /needs a name/.test(f.error))); assert.ok(r.failed.some((f) => /10-digit/.test(f.error)));
assert.equal((await one(`select city from members where member_id='RB001'`)).city, 'Kept');
assert.equal((await one(`select count(*)::int c from members where member_id in ('NEW200','NEW201','NEW202','NEW203')`)).c, 0, 'failed rows saved nothing');
console.log('5 ok: bad rows reported one by one, good rows still saved, nothing half-saved');
// unknown / dangerous keys are ignored, a member can keep their own phone
r = await imp([{ member_id: 'RB002', 'name); drop table members; --': 'x', profile_pic: 'hack.jpg', status: 'x', phone: '9000000002', city: 'Safe' }]);
assert.deepEqual([r.updated, r.failed.length], [1, 0]); assert.equal((await one(`select count(*)::int c from members`)).c, 4); assert.equal((await one(`select profile_pic from members where member_id='RB002'`)).profile_pic, null);
console.log('6 ok: unknown columns ignored (no SQL injection, no photo overwrite), own phone allowed');
await db.end(); await server.stop(); console.log('ALL IMPORT CHECKS PASSED');
