// Referral + streak SQL checks on a real Postgres (needs: npm i embedded-postgres pg). Small stand-in tables, same names as the app.
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const dir = process.env.PG_TEST_DIR || '/tmp/gymtest_referrals';
fs.rmSync(dir, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'pw', port: 54342, persistent: false });
await server.initialise(); await server.start(); await server.createDatabase('gym');
const db = new pg.Client({ host: 'localhost', port: 54342, user: 'postgres', password: 'pw', database: 'gym' }); await db.connect();
const q = (s, p) => db.query(s, p);
const T = `(now() at time zone 'Asia/Kolkata')::date`;
const day = (n) => `(${T} + (${n}))::text`;
await q(`create role anon nologin; create role authenticated nologin; grant usage on schema public to anon, authenticated;
 create table members (member_id text primary key, name text, phone text, whatsapp text, package text, expiry_date text, joining_date text);
 create table attendance_logs (id serial primary key, member_id text, punch_in_time timestamptz);
 create table ghost_vault (member_id text, passcode text);
 create table staff (passcode text, name text, active boolean default true);
 create function verify_admin_access(p text) returns jsonb language sql as $$ select case when p = 'staff1' then '{"role":"staff","name":"Desk"}'::jsonb when p = 'own' then '{"role":"owner","name":"Owner"}'::jsonb end $$;
 create function _member_pass_ok(p_member_id text, p_passcode text) returns boolean language sql security definer as $$ select exists (select 1 from ghost_vault where member_id = upper(trim(p_member_id)) and passcode = trim(coalesce(p_passcode,''))) $$;
 insert into members values
  ('RB001','Rahul Das','9000000001',null,'Monthly',${day(1)},${day(-200)}),
  ('RB002','Priya Sen','9000000002',null,'Monthly',${day(3)},${day(-100)}),
  ('RB003','Amit Shah','9000000003',null,'Monthly',${day(30)},${day(-100)}),
  ('RB004','Dev','9000000004',null,'Monthly',${day(30)},${day(-100)}),
  ('RB007','Neha Roy','9000000007',null,'Monthly',${day(-5)},${day(-3)}),
  ('RB008','Old Timer','9000000008',null,'Monthly',${day(30)},${day(-100)}),
  ('RB009','Same Phone','9000000002',null,'Monthly',${day(30)},${day(-2)}),
  ('RB010','Kiran Rao','9000000010',null,'Monthly',${day(20)},${day(-1)}),
  ('RB011','Zoya Khan','9000000011',null,'Monthly',${day(20)},${day(-1)}),
  ('RB012','Dev Joshi','9000000012',null,'Monthly',${day(20)},${day(-1)});
 insert into ghost_vault values ('RB001','1111'),('RB002','2222'),('RB003','3333'),('RB004','4444');`);
const mig = fs.readFileSync(new URL('../../supabase/migrations/20261024000000_rbf_referrals_streaks.sql', import.meta.url), 'utf8');
await q(mig); await q(mig);   // twice = safe
const asRole = async (role, fn) => { await q(`set role ${role}`); try { return await fn(); } finally { await q('reset role'); } };
const call = (n, ...a) => asRole('anon', async () => (await q(`select public.${n}(${a.map((_, i) => '$' + (i + 1)).join(',')}) as r`, a)).rows[0].r);
const fails = (re, fn) => assert.rejects(fn, re);
const punch = (m, dateSql) => q(`insert into attendance_logs (member_id, punch_in_time) values ($1, ((${dateSql})::timestamp + time '10:00') at time zone 'Asia/Kolkata')`, [m]);
const W = `date_trunc('week', ${T})::date`;
const one = async (sql) => (await q(sql)).rows[0].v;

// ---------- streaks ----------
for (let k = 1; k <= 5; k++) for (let d = 0; d < 3; d++) await punch('RB001', `${W} - ${7 * k} + ${d}`);
await punch('RB001', `${W} - 7`);            // second scan on the same day: counts once
await punch('RB001', `${W}`);                 // one visit this week (in progress)
for (const [k, n] of [[1, 3], [2, 2], [3, 3], [4, 3]]) for (let d = 0; d < n; d++) await punch('RB002', `${W} - ${7 * k} + ${d}`);
let s = await call('member_streak', 'RB001', '1111');
assert.equal(s.total_visits, 16, 'distinct days only'); assert.equal(s.this_week, 1);
assert.equal(s.week_streak, 5, 'week in progress does not break a streak'); assert.equal(s.best_week_streak, 5);
const bd = Object.fromEntries(s.badges.map((b) => [b.code, b.earned]));
assert.equal(bd.visits_1, true); assert.equal(bd.visits_10, true); assert.equal(bd.visits_25, false); assert.equal(bd.streak_4, true); assert.equal(bd.streak_8, false);
assert.equal(s.next_visit_goal, 25);
s = await call('member_streak', 'RB002', '2222'); assert.equal(s.week_streak, 1, 'gap week ends the streak'); assert.equal(s.best_week_streak, 2);
await assert.rejects(() => call('member_streak', 'RB001', 'bad'), /Access denied/);
await assert.rejects(() => call('member_streak', 'RB001', '2222'), /Access denied/);
await assert.rejects(() => call('member_streak', 'RB999', '1111'), /Access denied/);
await assert.rejects(() => call('admin_reward_set', 'staff1', 'streak_weekly_target', 1), /Only the owner/);
await call('admin_reward_set', 'own', 'streak_weekly_target', 1);
s = await call('member_streak', 'RB001', '1111'); assert.equal(s.week_streak, 6, 'with a target of 1, this week counts');
s = await call('member_streak', 'RB002', '2222'); assert.equal(s.week_streak, 4);
await call('admin_reward_set', 'own', 'streak_weekly_target', 3);
console.log('1 ok: weekly streaks, same-day scans, badges, passcode checks');

// ---------- leaderboard ----------
await punch('RB003', T); await punch('RB004', T); await punch('RB004', `date_trunc('month', ${T})::date`);
const days = async (m) => Number(await one(`select count(distinct (punch_in_time at time zone 'Asia/Kolkata')::date) v from attendance_logs where member_id='${m}' and punch_in_time >= (date_trunc('month', ${T})::timestamp at time zone 'Asia/Kolkata')`));
let lb = await call('member_leaderboard', 'RB004', '4444');
assert.deepEqual(lb.top, [], 'nobody is listed until they switch it on'); assert.equal(lb.listed, false);
assert.equal(lb.me.days, await days('RB004')); assert.ok(lb.me.rank >= 1 && lb.me.of >= 3);
await call('member_set_leaderboard', 'RB003', '3333', true);
lb = await call('member_leaderboard', 'RB004', '4444'); assert.equal(lb.top.length, 1); assert.equal(lb.top[0].name, 'Amit S.'); assert.equal(lb.top[0].me, false);
assert.ok(!JSON.stringify(lb).includes('Shah') && !JSON.stringify(lb).includes('9000000003'), 'no full names or phones');
await call('member_set_leaderboard', 'RB004', '4444', true);
lb = await call('member_leaderboard', 'RB004', '4444'); assert.deepEqual(lb.top.map((t) => t.name).sort(), ['Amit S.', 'Dev']); assert.equal(lb.listed, true);
assert.ok(lb.top.every((t, i, a) => i === 0 || a[i - 1].days >= t.days), 'ordered by days'); assert.equal(lb.top.find((t) => t.me).name, 'Dev');
await assert.rejects(() => call('member_set_leaderboard', 'RB003', 'bad', false), /Access denied/);
await call('member_set_leaderboard', 'RB003', '3333', false);
assert.equal((await call('member_leaderboard', 'RB004', '4444')).top.length, 1, 'opting out removes you');
console.log('2 ok: leaderboard is opt-in, short names, ordered, opt-out works');

// ---------- member invites ----------
const id1 = await call('member_refer_friend', 'RB001', '1111', 'Amit Kumar', '+91 98765-00001');
await assert.rejects(() => call('member_refer_friend', 'RB002', '2222', 'Someone', '9876500001'), /already invited/);
await assert.rejects(() => call('member_refer_friend', 'RB001', '1111', 'X Y', '+91 90000 00002'), /already a member/);
await assert.rejects(() => call('member_refer_friend', 'RB001', '1111', 'X Y', '123'), /valid phone/);
await assert.rejects(() => call('member_refer_friend', 'RB001', '1111', 'A', '9876500009'), /friend/);
await assert.rejects(() => call('member_refer_friend', 'RB001', 'bad', 'Zed Zed', '9876500009'), /Access denied/);
for (let i = 1; i <= 20; i++) await call('member_refer_friend', 'RB003', '3333', 'Friend ' + i, '91111000' + String(i).padStart(2, '0'));
await assert.rejects(() => call('member_refer_friend', 'RB003', '3333', 'Friend 21', '9111100021'), /20 friends/);
let sum = await call('member_referral_summary', 'RB001', '1111');
assert.equal(sum.code, 'RB001'); assert.equal(sum.invited, 1); assert.equal(sum.reward_days, 7); assert.equal(sum.friends[0].name, 'Amit'); assert.ok(!JSON.stringify(sum).includes('98765'), 'friend phone not echoed');
console.log('3 ok: invites, duplicates, existing members, cap of 20');

// ---------- admin: link, create, reward ----------
await assert.rejects(() => call('admin_referral_create', 'wrong', 'RB002', 'RB007'), /Access denied/);
const id2 = await call('admin_referral_create', 'staff1', 'RB002', 'RB007');
await assert.rejects(() => call('admin_referral_create', 'staff1', 'RB003', 'RB007'), /already linked/);
await assert.rejects(() => call('admin_referral_create', 'staff1', 'RB002', 'RB002'), /themselves/);
await assert.rejects(() => call('admin_referral_create', 'staff1', 'RB002', 'RB008'), /not a new member/);
await assert.rejects(() => call('admin_referral_create', 'staff1', 'RB002', 'RB009'), /Same phone/);
await assert.rejects(() => call('admin_referral_create', 'staff1', 'RB002', 'RB777'), /not found/);
await call('admin_referral_link', 'staff1', id1, 'RB010');
await assert.rejects(() => call('admin_referral_link', 'staff1', id1, 'RB011'), /Only an invited/);
await assert.rejects(() => call('admin_referral_reward', 'staff1', id2), /Only the owner/);
await assert.rejects(() => call('admin_referral_reward', 'wrong', id2), /Only the owner/);
const r2 = await call('admin_referral_reward', 'own', id2);
assert.equal(r2.days, 7);
assert.equal(r2.referrer_expiry, await one(`select ${day(10)} v`), 'RB002 had 3 days left: +7');
assert.equal(r2.referred_expiry, await one(`select ${day(7)} v`), 'RB007 was expired: counts from today');
await assert.rejects(() => call('admin_referral_reward', 'own', id2), /only once/);
const r1 = await call('admin_referral_reward', 'own', id1);
assert.equal(r1.referrer_expiry, await one(`select ${day(8)} v`)); assert.equal(r1.referred_expiry, await one(`select ${day(27)} v`));
assert.equal(await one(`select expiry_date v from members where member_id='RB002'`), await one(`select ${day(10)} v`), 'members table really updated');
sum = await call('member_referral_summary', 'RB001', '1111'); assert.equal(sum.rewarded, 1); assert.equal(sum.free_days_earned, 7);
console.log('4 ok: link/create guards, owner-only reward, both expiries extended once');

// ---------- cap, void, settings ----------
await call('admin_reward_set', 'own', 'referral_monthly_cap', 1);
const id3 = await call('admin_referral_create', 'staff1', 'RB002', 'RB011');
await assert.rejects(() => call('admin_referral_reward', 'own', id3), /Monthly reward limit/);
await call('admin_reward_set', 'own', 'referral_monthly_cap', 5);
await call('admin_referral_reward', 'own', id3);
const id4 = await call('admin_referral_create', 'staff1', 'RB003', 'RB012');
await assert.rejects(() => call('admin_referral_void', 'staff1', id4), /Only the owner/);
await call('admin_referral_void', 'own', id4);
await assert.rejects(() => call('admin_referral_void', 'own', id4), /Nothing to cancel/);
await assert.rejects(() => call('admin_referral_void', 'own', id2), /Nothing to cancel/);
await call('admin_referral_create', 'staff1', 'RB003', 'RB012');   // after cancelling, the friend can be linked again
for (const [k, v] of [['referral_reward_days', 0], ['referral_reward_days', 31], ['streak_weekly_target', 8], ['unknown', 1]]) await assert.rejects(() => call('admin_reward_set', 'own', k, v), /not allowed/);
console.log('5 ok: monthly cap, cancel rules, settings limits');

// ---------- overview + privacy ----------
let ov = await call('admin_referral_overview', 'staff1'); assert.equal(ov.is_owner, false);
ov = await call('admin_referral_overview', 'own'); assert.equal(ov.is_owner, true); assert.equal(ov.settings.referral_reward_days, 7);
assert.ok(ov.referrals.length >= 4 && ov.referrals.some((r) => r.referrer_name === 'Priya Sen' && r.status === 'rewarded'));
await assert.rejects(() => call('admin_referral_overview', 'wrong'), /Access denied/);
for (const t of ['referrals', 'reward_settings', 'member_social_prefs']) await asRole('anon', () => assert.rejects(() => q(`select * from ${t}`), /permission denied/));
await asRole('anon', () => assert.rejects(() => q(`select public._admin_role('own')`), /permission denied/));
console.log('6 ok: overview roles, tables and helpers closed to the public key');

await db.end(); await server.stop(); console.log('ALL REFERRAL + STREAK CHECKS PASSED');
