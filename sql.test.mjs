// Kiosk dual screen: the kiosk's gym QR feed and the manual (ID/mobile + passcode) check-in, on a real Postgres.
// Needs `embedded-postgres` and `pg` (npm i --no-save embedded-postgres pg). Run: node tests/kiosk/sql.test.mjs
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const dir = '/tmp/gymtest_kiosk';
fs.rmSync(dir, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'pw', port: 54339, persistent: false });
await server.initialise(); await server.start(); await server.createDatabase('gym');
const db = new pg.Client({ host: 'localhost', port: 54339, user: 'postgres', password: 'pw', database: 'gym' }); await db.connect();
const q = (s, p) => db.query(s, p);
const asAnon = async (fn) => { await q('set role anon'); try { return await fn(); } finally { await q('reset role'); } };
const call = (sql, p) => asAnon(async () => (await q(sql, p)).rows[0]);
let pass = 0; const ok = (name) => { pass++; console.log('ok -', name); };

// ---- the live shape (functions copied from the live database)
await q(`create role anon nologin; create role authenticated nologin;
 create schema if not exists extensions;
 grant usage on schema public, extensions to anon, authenticated;
 create table members (member_id varchar primary key, name text, phone text, whatsapp text, profile_pic text, expiry_date text, package text);
 create table ghost_vault (member_id varchar primary key, passcode text);
 create table kiosk_devices (device_id uuid primary key, device_name text, approved boolean default false, last_seen timestamptz, created_at timestamptz default now());
 create table attendance_logs (id serial primary key, member_id varchar, status text, punch_in_time timestamptz default now(), punch_out_time timestamptz);
 create table billing (member_id text, due numeric);
 create or replace function public._norm_mobile(p text) returns text language sql immutable set search_path to 'public','pg_temp' as $f$
   select case when length(d)=10 then d when length(d)=12 and d like '91%' then substr(d,3) when length(d)=11 and d like '0%' then substr(d,2) else d end
   from (select regexp_replace(coalesce(p,''),'\\D','','g') d) x; $f$;
 create or replace function public._member_pass_ok(p_member_id text, p_passcode text) returns boolean language sql security definer set search_path to 'public' as $f$
   select exists (select 1 from public.ghost_vault where member_id = upper(trim(p_member_id)) and passcode = trim(coalesce(p_passcode,''))); $f$;
 create or replace function public.kiosk_scan(p_member_id text) returns jsonb language plpgsql security definer set search_path to 'public' as $f$
 declare v_member record; v_open record; v_action text; v_day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
 begin
   select member_id, name, profile_pic, expiry_date into v_member from public.members where member_id = upper(trim(p_member_id)) limit 1;
   if not found then return jsonb_build_object('found', false); end if;
   select id, punch_out_time into v_open from public.attendance_logs where member_id = v_member.member_id and punch_in_time >= v_day_start and punch_out_time is null order by punch_in_time desc limit 1;
   if found then update public.attendance_logs set punch_out_time = now(), status = 'CHECKED_OUT' where id = v_open.id; v_action := 'CHECK-OUT';
   else insert into public.attendance_logs (member_id, status) values (v_member.member_id, 'CHECKED_IN'); v_action := 'CHECK-IN'; end if;
   return jsonb_build_object('found', true, 'member_id', v_member.member_id, 'name', v_member.name, 'profile_pic', v_member.profile_pic, 'action', v_action,
     'expired', (v_member.expiry_date is not null and v_member.expiry_date::date < current_date));
 end; $f$;
 create or replace function public.kiosk_scan_device(p_device_id uuid, p_member_id text) returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $f$
 declare v_member record; v_last timestamptz;
 begin
   if not exists (select 1 from public.kiosk_devices where device_id = p_device_id and approved = true) then raise exception 'Device not approved.'; end if;
   update public.kiosk_devices set last_seen = now() where device_id = p_device_id;
   select member_id, name, profile_pic, expiry_date into v_member from public.members where member_id = upper(trim(p_member_id)) limit 1;
   if not found then return jsonb_build_object('found', false); end if;
   select max(greatest(punch_in_time, coalesce(punch_out_time, punch_in_time))) into v_last from public.attendance_logs where member_id = v_member.member_id;
   if v_last is not null and v_last > now() - interval '30 seconds' then
     return jsonb_build_object('found', true, 'cooldown', true, 'member_id', v_member.member_id, 'name', v_member.name, 'profile_pic', v_member.profile_pic, 'action', 'ALREADY-SCANNED',
       'expired', (v_member.expiry_date is not null and v_member.expiry_date::date < current_date));
   end if;
   return public.kiosk_scan(v_member.member_id);
 end; $f$;
 revoke all on function public.kiosk_scan(text), public.kiosk_scan_device(uuid, text) from public;
 grant execute on function public.kiosk_scan_device(uuid, text) to anon;`);

for (const f of ['supabase/migrations/20261028000000_rbf_gate_qr_attendance.sql', 'supabase/migrations/20261029000000_rbf_kiosk_dual_screen.sql']) await q(fs.readFileSync(f, 'utf8'));
await q(fs.readFileSync('supabase/migrations/20261029000000_rbf_kiosk_dual_screen.sql', 'utf8')); // twice = safe

const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222'; // A approved, B not
await q(`insert into kiosk_devices (device_id, approved) values ('${A}', true), ('${B}', false);
 insert into members (member_id, name, phone, whatsapp, expiry_date) values
   ('RBF001','Asha','98765 43210',null,'2099-01-01'), ('RBF002','Ravi','+91 90000 11111','9000011111','2099-01-01'),
   ('RBF003','Sam','9000011111',null,'2020-01-01'), ('RBF004','Dev','7000000000',null,'2099-01-01');
 insert into ghost_vault values ('RBF001','1234'), ('RBF002','2222'), ('RBF003','3333'), ('RBF004','4444');`);
const reset = () => q(`delete from attendance_logs; delete from gate_scan_log;`);

// ---- 1. the gym QR feed
{
  await assert.rejects(call(`select kiosk_gate_token($1)`, [B]), /not approved/i); ok('unapproved kiosk cannot get the gym QR');
  let r = (await call(`select kiosk_gate_token($1) t`, [A])).t;
  assert.equal(r.location_set, false); assert.match(r.token, /^[0-9a-f]{10}$/); ok('approved kiosk gets a 10-char token (location not set yet)');
  await q(`update gate_settings set latitude = 22.5, longitude = 88.3 where id`);
  r = (await call(`select kiosk_gate_token($1) t`, [A])).t;
  assert.equal(r.location_set, true); assert.equal(r.radius_ft, 20);
  const adminTok = (await q(`select public._gate_token(public._gate_window()) t`)).rows[0].t;
  assert.equal(r.token, adminTok); ok('kiosk token is the same code a phone scan accepts');
}

// ---- 2. manual check-in
{
  await reset();
  await assert.rejects(call(`select kiosk_manual_checkin($1,'RBF001','1234')`, [B]), /not approved/i); ok('unapproved kiosk cannot check anyone in');

  let r = (await call(`select kiosk_manual_checkin($1,'rbf001','1234') r`, [A])).r;
  assert.equal(r.ok, true); assert.equal(r.action, 'CHECK-IN'); assert.equal(r.member_id, 'RBF001'); ok('member ID (any case) + passcode checks in');

  await q(`delete from attendance_logs`); // skip the 30 s double-scan guard
  r = (await call(`select kiosk_manual_checkin($1,'98765-43210','1234') r`, [A])).r;
  assert.equal(r.ok, true); assert.equal(r.member_id, 'RBF001'); assert.equal(r.action, 'CHECK-IN'); ok('mobile number with spaces/dashes + passcode checks in');

  r = (await call(`select kiosk_manual_checkin($1,'RBF001','1234') r`, [A])).r;
  assert.equal(r.action, 'ALREADY-SCANNED'); ok('scanning twice within 30 s is not recorded twice');
  await q(`update attendance_logs set punch_in_time = now() - interval '5 minutes'`);
  r = (await call(`select kiosk_manual_checkin($1,'+91 98765 43210','1234') r`, [A])).r;
  assert.equal(r.action, 'CHECK-OUT'); ok('next entry checks out (+91 mobile format works)');

  // wrong / unknown all look the same
  const bad = [['RBF001', '9999'], ['RBF999', '1234'], ['5550001111', '1234'], ['RBF001', '']].map(([i, p]) => [i, p]);
  const msgs = new Set();
  for (const [i, p] of bad.slice(0, 3)) { const x = (await call(`select kiosk_manual_checkin($1,$2,$3) r`, [A, i, p])).r; assert.equal(x.ok, false); assert.equal(x.reason, 'bad_login'); msgs.add(x.message); }
  assert.equal(msgs.size, 1); ok('wrong passcode, unknown ID and unknown mobile give the identical message');
  const empty = (await call(`select kiosk_manual_checkin($1,'RBF001','') r`, [A])).r; assert.equal(empty.ok, false); ok('empty passcode is refused');

  // shared mobile: Ravi and Sam share 9000011111 - only the one whose passcode matches gets in
  await reset();
  r = (await call(`select kiosk_manual_checkin($1,'9000011111','2222') r`, [A])).r; assert.equal(r.member_id, 'RBF002');
  await q(`delete from attendance_logs`);
  r = (await call(`select kiosk_manual_checkin($1,'9000011111','3333') r`, [A])).r; assert.equal(r.member_id, 'RBF003'); assert.equal(r.expired, true); ok('shared mobile picks the member whose passcode matches; expired member is flagged');
  const lg = (await q(`select count(*)::int c from attendance_logs where member_id='RBF003'`)).rows[0].c; assert.equal(lg, 1); ok('expired member is still recorded (same as the kiosk)');
}

// ---- 3. attempt limits
{
  await reset();
  for (let i = 0; i < 10; i++) await call(`select kiosk_manual_checkin($1,'RBF004','0000')`, [A]);
  let r = (await call(`select kiosk_manual_checkin($1,'RBF004','4444') r`, [A])).r;
  assert.equal(r.ok, false); assert.equal(r.reason, 'too_many_attempts'); ok('10 wrong tries block that member, even with the right passcode');
  r = (await call(`select kiosk_manual_checkin($1,'RBF001','1234') r`, [A])).r; assert.equal(r.ok, true); ok('other members are not affected');

  await reset();
  for (let i = 0; i < 30; i++) await call(`select kiosk_manual_checkin($1,$2,'0000')`, [A, `55500${String(i).padStart(5, '0')}`]);
  r = (await call(`select kiosk_manual_checkin($1,'RBF001','1234') r`, [A])).r;
  assert.equal(r.reason, 'too_many_attempts'); ok('30 wrong tries on one kiosk (guessing mobiles) block that kiosk for 10 minutes');

  await reset();
  await q(`insert into gate_scan_log (member_id, ok, reason) select 'RBF001', false, 'bad_login' from generate_series(1,10)`); // from the phone QR path
  r = (await call(`select kiosk_manual_checkin($1,'RBF001','1234') r`, [A])).r;
  assert.equal(r.reason, 'too_many_attempts'); ok('wrong tries made on phones count toward the same limit');
}

// ---- 4. privacy / permissions
{
  await reset();
  await call(`select kiosk_manual_checkin($1,'RBF001','1234')`, [A]);
  await call(`select kiosk_manual_checkin($1,'RBF001','0000')`, [A]);
  const cols = (await q(`select column_name from information_schema.columns where table_name='gate_scan_log'`)).rows.map(r => r.column_name);
  assert.ok(!cols.some(c => /pass|lat|lng/i.test(c))); ok('the log never stores passcodes or coordinates');
  const logged = (await q(`select ok, reason from gate_scan_log order by id`)).rows;
  assert.deepEqual(logged.map(l => l.reason), ['kiosk_manual', 'bad_login']); ok('both outcomes are logged for the Recent scans list');
  await assert.rejects(asAnon(() => q(`select * from gate_scan_log`)), /permission denied/); ok('phones/kiosks cannot read the log directly');
  await assert.rejects(asAnon(() => q(`select * from ghost_vault`)).then(r => { if (r.rows.length) throw new Error('permission denied'); }), /permission denied/); ok('passcodes are not readable by the app key');
}
console.log(`\n${pass} checks passed`);
await db.end(); await server.stop();
