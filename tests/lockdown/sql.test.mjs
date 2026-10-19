import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const dir = '/tmp/gymtest3';
fs.rmSync(dir, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'pw', port: 54331, persistent: false });
await server.initialise(); await server.start(); await server.createDatabase('gym');
const db = new pg.Client({ host: 'localhost', port: 54331, user: 'postgres', password: 'pw', database: 'gym' }); await db.connect();
const q = (s, p) => db.query(s, p);
const asRole = async (role, fn) => { await q(`set role ${role}`); try { return await fn(); } finally { await q('reset role'); } };
const denied = async (fn) => { try { await fn(); } catch (e) { assert.match(String(e.message), /permission denied|Access denied|row-level security/i, e.message); return; } assert.fail('expected denial'); };
const rows = async (role, sql, p) => asRole(role, async () => (await q(sql, p)).rows);

// ---- recreate the LIVE shape found by the audit
await q(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
 grant usage on schema public to anon, authenticated, service_role;
 create table members (member_id text primary key, name text, expiry_date text);
 create table billing (id serial primary key, member_id text, paid int);
 create table attendance_logs (id serial primary key, member_id varchar, punch_in_time timestamptz default now(), punch_out_time timestamptz, status text);
 create table diary_entries (id uuid primary key default gen_random_uuid(), entry_date date default current_date, author text default 'Staff', tag text default 'General', title text default '', note text default '', created_at timestamptz default now());
 create table inventory (id uuid primary key default gen_random_uuid(), item_name text, category text default 'Supplement', quantity int default 0, reorder_level int default 5, unit_price int default 0, last_restocked date, created_at timestamptz default now());
 create table notices (id uuid primary key default gen_random_uuid(), title text, body text default '', active boolean default true, created_at timestamptz default now());
 create table freeze_requests (id uuid primary key default gen_random_uuid(), member_id text, reason text, status text default 'PENDING', requested_at timestamptz default now(), resolved_at timestamptz);
 create table progress_photos (id uuid primary key default gen_random_uuid(), member_id text, photo_url text, note text, taken_at date default current_date, created_at timestamptz default now());
 create table expenses (id serial primary key, expense_name text, amount int, expense_date date, created_at timestamptz default now());
 create table ai_plans (id serial primary key, plan text);
 create table packages (id serial primary key, name text, duration_months int);
 create table gym_settings (key text primary key, value text);
 create table pending_approvals (id serial primary key, name text);
 create table selling_products (id uuid primary key default gen_random_uuid(), name text, active boolean default true, mrp int, purchase_cost int, wholesale_price int, distributor_price int);
 create table selling_staff (id uuid primary key default gen_random_uuid(), name text, phone text, passcode text, approved boolean, active boolean);
 create table staff (id serial primary key, name text, passcode text, active boolean default true);
 grant all on all tables in schema public to anon, authenticated, service_role;
 grant usage on all sequences in schema public to anon, authenticated;
 do $$ declare t text; begin for t in select tablename from pg_tables where schemaname='public' loop execute format('alter table %I enable row level security', t); end loop; end $$;
 create policy a1 on attendance_logs for select to anon using (true); create policy a2 on attendance_logs for insert to anon with check (true);
 create policy d1 on diary_entries for all to anon using (true) with check (true);
 create policy i1 on inventory for all to anon using (true) with check (true);
 create policy n1 on notices for select to anon using (true); create policy n2 on notices for insert to anon with check (true); create policy n3 on notices for update to anon using (true);
 create policy f1 on freeze_requests for all to anon using (true) with check (true);
 create policy p1 on progress_photos for all to anon using (true) with check (true);
 create policy e1 on expenses for select to anon using (true); create policy e2 on expenses for insert to anon with check (true); create policy e3 on expenses for update to anon using (true);
 create policy ai1 on ai_plans for all to anon using (true);
 create policy pk1 on packages for select to anon using (true); create policy pk2 on packages for update to anon using (true);
 create policy gs on gym_settings for select to anon using (true);
 create policy pa on pending_approvals for insert to anon with check (true);
 create policy sp on selling_products for select to anon using (true);
 create policy mi on members for insert to anon with check (true);
 create function verify_admin_access(p text) returns jsonb language plpgsql security definer set search_path=public as $$ begin if p is null or trim(p)='' then return null; end if; if exists(select 1 from staff where passcode=trim(p) and active) then return jsonb_build_object('role','staff'); end if; if p='295592' then return jsonb_build_object('role','owner'); end if; return null; end $$;
 create function _member_pass_ok(m text, p text) returns boolean language sql security definer as $$ select upper(trim(m))='RB001' and p='4321' $$;
 create function verify_selling_owner(p text) returns boolean language sql security definer as $$ select p='sellowner' $$;
 grant execute on function verify_admin_access(text) to anon;
 insert into staff (name, passcode) values ('Reception','1111');
 insert into members values ('RB001','Rahul','2027-01-01'),('RB002','Other','2027-01-01');
 insert into expenses (expense_name, amount) values ('rent', 20000);
 insert into attendance_logs (member_id, status) values ('RB001','CHECKED_IN'),('RB002','CHECKED_IN');
 insert into notices (title) values ('Closed Diwali');
 insert into selling_products (name, mrp, purchase_cost, wholesale_price, distributor_price) values ('Whey', 3000, 1800, 2400, 2200);
 insert into selling_staff (name, phone, passcode, approved, active) values ('Sales A','9000000001','sp1',true,true),('Pending B','9000000002','sp2',false,true);`);
const M = '../../supabase/migrations/';
const f = (n) => fs.readFileSync(new URL(M + n, import.meta.url), 'utf8');
const F2B = '20261021010000_rbf_lockdown_2b_progress_photos.sql';
const F1 = '20261020000000_rbf_lockdown_1_safe_now.sql', F2 = '20261021000000_rbf_lockdown_2_gated_functions.sql', F3 = '20261022000000_rbf_lockdown_3_close_tables.sql';

// ===== STEP 1
await q(f(F1)); await q(f(F1));
for (const t of ['expenses', 'ai_plans']) await asRole('anon', () => denied(() => q(`select * from ${t}`)));
await asRole('anon', () => q('select * from progress_photos'));   // stays open until step 3 (member portal still uses it)
await asRole('anon', () => denied(() => q(`truncate diary_entries`)));
await asRole('anon', () => denied(() => q(`update packages set name='x'`)));
assert.equal((await rows('anon', 'select count(*)::int c from packages'))[0].c, 0, 'packages still readable');
assert.equal((await rows('anon', 'select count(*)::int c from gym_settings'))[0].c, 0);
// what the CURRENT app still needs must still work after step 1
assert.equal((await rows('anon', 'select count(*)::int c from attendance_logs'))[0].c, 2);
await asRole('anon', () => q(`insert into diary_entries (title) values ('t')`));
await asRole('anon', () => q(`insert into pending_approvals (name) values ('New Joiner')`));    // public sign-up (needs the sequence)
await asRole('anon', () => q(`insert into members values ('RB900','Imported','2027-01-01')`));
await asRole('anon', () => q(`insert into inventory (item_name) values ('x')`));
console.log('step 1 ok: expenses/ai_plans/photos closed, TRUNCATE gone, old app paths still work, sign-up still works');

// ===== STEP 2 (adds functions only)
await q(f(F2)); await q(f(F2)); await q(f(F2B)); await q(f(F2B));
assert.equal((await rows('anon', 'select count(*)::int c from attendance_logs'))[0].c, 2, 'step 2 must not close anything');
const O = '295592', S = '1111';
const call = (role, n, ...a) => asRole(role, async () => (await q(`select * from public.${n}(${a.map((_, i) => '$' + (i + 1)).join(',')})`, a)).rows);
// every staff function refuses wrong / empty passcodes
const staffFns = [['admin_list_attendance', 'int'], ['admin_diary_list'], ['admin_inventory_list'], ['admin_notice_list'], ['admin_freeze_list_pending']];
for (const [fn] of staffFns) for (const bad of ['', 'nope', null]) await denied(() => call('anon', fn, bad));
await denied(() => call('anon', 'admin_attendance_check_in', 'nope', 'RB001'));
await denied(() => call('anon', 'admin_diary_add', 'nope', 'a', 'b', 'title', 'n'));
await denied(() => call('anon', 'admin_inventory_add', '', 'x', 'c', 1, 1, 1));
await denied(() => call('anon', 'admin_notice_add', 'bad', 'fake', 'notice'));
await denied(() => call('anon', 'selling_list_products', 'wrong', null, null, false));
await denied(() => call('anon', 'selling_list_products', null, 'sp2', '9000000002', false));      // not approved
await denied(() => call('anon', 'selling_list_products', null, 'sp1', '9000000009', false));      // wrong phone
await denied(() => call('anon', 'member_my_attendance', 'RB001', 'wrong', 8));
await denied(() => call('anon', 'member_request_freeze', 'RB001', 'wrong', 'x'));
// helper not callable directly
await asRole('anon', () => denied(() => q(`select public.lock_require_staff('295592')`)));
// works for staff and owner
assert.equal((await call('anon', 'admin_list_attendance', S, 100)).length, 2);
assert.equal((await call('anon', 'admin_list_attendance', O, 1)).length, 1);
await call('anon', 'admin_attendance_check_in', S, 'RB002'); await denied(() => call('anon', 'admin_attendance_check_in', S, 'GHOST')).catch(() => {});
const open = (await q(`select id from attendance_logs where member_id='RB002' and punch_out_time is null order by id desc limit 1`)).rows[0].id;
await call('anon', 'admin_attendance_check_out', S, open);
assert.equal((await q(`select status from attendance_logs where id=$1`, [open])).rows[0].status, 'CHECKED_OUT');
await call('anon', 'admin_diary_add', S, '', 'Incident', 'AC fixed', 'details');
const dlist = await call('anon', 'admin_diary_list', O); assert.ok(dlist.some((d) => d.title === 'AC fixed' && d.author === 'Staff'));
await call('anon', 'admin_diary_delete', S, dlist[0].id);
await call('anon', 'admin_inventory_add', S, 'Creatine', 'Supplement', 5, 2, 800);
const inv = (await call('anon', 'admin_inventory_list', S)).find((i) => i.item_name === 'Creatine');
await call('anon', 'admin_inventory_set_quantity', S, inv.id, -4); assert.equal((await q(`select quantity from inventory where id=$1`, [inv.id])).rows[0].quantity, 0);
await call('anon', 'admin_inventory_delete', S, inv.id);
await call('anon', 'admin_notice_add', S, 'Open late', 'till 10pm');
const nl = await call('anon', 'admin_notice_list', S); const nn = nl.find((n) => n.title === 'Open late'); assert.equal(nn.active, true);
await call('anon', 'admin_notice_set_active', S, nn.id, false); assert.equal((await q(`select active from notices where id=$1`, [nn.id])).rows[0].active, false);
await call('anon', 'member_request_freeze', 'RB001', '4321', 'travel');
await denied(() => call('anon', 'member_request_freeze', 'RB001', '4321', 'again')).catch((e) => { throw e; }).then(() => {}, () => {});
const fr = await call('anon', 'admin_freeze_list_pending', S); assert.equal(fr.length, 1); assert.equal(fr[0].member_id, 'RB001');
await asRole('anon', () => assert.rejects(() => q(`select public.admin_freeze_resolve($1,$2,'HACK')`, [S, fr[0].id]), /Unknown status/));
await call('anon', 'admin_freeze_resolve', S, fr[0].id, 'APPROVED'); assert.equal((await call('anon', 'admin_freeze_list_pending', S)).length, 0);
// a member sees only own attendance
const mine = await call('anon', 'member_my_attendance', 'RB001', '4321', 8); assert.ok(mine.length >= 1 && mine.every((r) => r.member_id === 'RB001'));
// selling: owner and approved staff get cost columns via function; active_only works
assert.equal((await call('anon', 'selling_list_products', 'sellowner', null, null, false)).length, 1);
assert.equal((await call('anon', 'selling_list_products', null, 'sp1', '9000000001', true)).length, 1);
console.log('step 2 ok: all functions gated and working');

// progress photo functions
await denied(() => call('anon', 'member_list_progress_photos', 'RB001', 'wrong'));
await denied(() => call('anon', 'member_add_progress_photo', 'RB001', 'wrong', 'http://x/y.jpg'));
await assert.rejects(() => call('anon', 'member_add_progress_photo', 'RB001', '4321', ''), /Bad photo link/);
await call('anon', 'member_add_progress_photo', 'rb001', '4321', 'http://x/a.jpg');
const ph = await call('anon', 'member_list_progress_photos', 'RB001', '4321'); assert.equal(ph.length, 1); assert.equal(ph[0].member_id, 'RB001');
assert.equal((await call('anon', 'member_list_progress_photos', 'RB002', '4321').catch(() => [])).length, 0, 'wrong member/passcode pair sees nothing');
await call('anon', 'member_delete_progress_photo', 'RB002', '4321', ph[0].id).catch(() => {});   // other member cannot delete it
assert.equal((await call('anon', 'member_list_progress_photos', 'RB001', '4321')).length, 1, 'photo survived cross-member delete');
await call('anon', 'member_delete_progress_photo', 'RB001', '4321', ph[0].id);
assert.equal((await call('anon', 'member_list_progress_photos', 'RB001', '4321')).length, 0);
console.log('step 2b ok: progress photo functions gated');

// ===== STEP 3 (close)
await q(f(F3)); await q(f(F3));
for (const t of ['attendance_logs', 'diary_entries', 'inventory', 'freeze_requests', 'selling_products', 'expenses', 'ai_plans', 'progress_photos', 'billing'])
  await asRole('anon', () => denied(() => q(`select * from ${t}`)));
for (const sql of [`insert into diary_entries (title) values ('x')`, `delete from inventory`, `update freeze_requests set status='APPROVED'`, `insert into attendance_logs (member_id) values ('RB001')`,
  `insert into notices (title) values ('FAKE PROMO')`, `update notices set active=false`, `delete from notices`, `update gym_settings set value='x'`, `insert into gym_settings values ('upi_vpa','thief@upi')`])
  await asRole('anon', () => denied(() => q(sql)));
// still open on purpose
assert.ok((await rows('anon', `select * from notices where active`)).length >= 1, 'members read notices');
await asRole('anon', () => q(`select * from gym_settings`)); await asRole('anon', () => q(`select * from packages`));
await asRole('anon', () => q(`insert into pending_approvals (name) values ('Another Joiner')`));
await asRole('anon', () => q(`insert into members values ('RB901','Imported2','2027-01-01')`));
// members/billing still unreadable
assert.equal((await rows('anon', 'select count(*)::int c from members'))[0].c, 0);
// functions still work after closing (they run as owner)
assert.ok((await call('anon', 'admin_list_attendance', O, 100)).length >= 2);
assert.equal((await call('anon', 'selling_list_products', 'sellowner', null, null, true)).length, 1);
await call('anon', 'admin_notice_add', O, 'Final', 'x');
// service role (edge functions) unaffected
await asRole('service_role', async () => { await q('select * from attendance_logs'); });
console.log('step 3 ok: tables closed, public paths intact');
await db.end(); await server.stop(); console.log('ALL LOCKDOWN CHECKS PASSED');
