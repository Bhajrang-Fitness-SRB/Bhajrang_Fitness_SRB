/*
# Security hardening: real server-side login checks, locked-down tables

## Why this migration exists
The app previously had:
1. The owner "Villain Vault" passcode hardcoded in the shipped JavaScript
   bundle — readable by anyone who viewed page source.
2. Every table (including `ghost_vault` and `staff`, which store every
   member's and staff member's plain-text login passcode) fully readable
   and writable by the public `anon` key with no restriction at all.
3. The main reception/admin dashboard at `/` with no login of any kind.
4. `gym_settings` (which holds the gym's UPI payment ID shown on every
   QR code) writable by anyone — meaning anyone could redirect member
   payments to their own UPI account.

This migration moves every sensitive check into the database itself via
SECURITY DEFINER functions, so the actual secret never has to live in the
browser. It does NOT remove the passcode-based login model (this app has
no real user accounts), but it makes every check happen on the server,
where it can't be read out of the JS bundle or bypassed by a direct table
read.

## What changes
- New `owner_credentials` table holding a hashed (not plain-text) owner
  passcode. Not readable by anyone directly, ever — only through
  `verify_owner_passcode`.
- `ghost_vault` and `staff` are fully locked down: no direct anon/
  authenticated access at all. All reads/writes go through functions
  below.
- `pending_approvals`: anon keeps INSERT only (so the public /join form
  still works) but loses direct SELECT/UPDATE/DELETE — admins now list
  it via `admin_list_pending_approvals`.
- `gym_settings`: anon keeps SELECT (QR codes need to read the VPA) but
  loses INSERT/UPDATE/DELETE — saved only via `admin_save_settings`.

## IMPORTANT — do this immediately after running this migration
The owner passcode is seeded here with the SAME value the app already
used (925529) purely so nothing breaks the moment you run this. That
passcode has already been sitting in public JavaScript, so treat it as
compromised. Log into the Villain Vault and use the new "Change owner
passcode" option immediately, or run:
  select set_owner_passcode('925529', 'your-new-passcode-here');
*/

create extension if not exists pgcrypto;

-- ============================================================
-- 1. Owner credentials (hashed, never directly readable)
-- ============================================================
create table if not exists public.owner_credentials (
  id boolean primary key default true,
  passcode_hash text not null,
  updated_at timestamptz not null default now(),
  constraint owner_credentials_single_row check (id)
);
alter table public.owner_credentials enable row level security;
-- Intentionally: no GRANT to anon/authenticated, no policies.
-- This table is reachable ONLY through the SECURITY DEFINER functions below.

insert into public.owner_credentials (id, passcode_hash)
values (true, crypt('925529', gen_salt('bf')))
on conflict (id) do nothing;

-- ============================================================
-- 2. Lock down ghost_vault and staff completely
-- ============================================================
revoke all on table public.ghost_vault from anon, authenticated;
drop policy if exists "anon_select_ghost_vault" on public.ghost_vault;
drop policy if exists "anon_insert_ghost_vault" on public.ghost_vault;
drop policy if exists "anon_update_ghost_vault" on public.ghost_vault;
drop policy if exists "anon_delete_ghost_vault" on public.ghost_vault;

revoke all on table public.staff from anon, authenticated;
drop policy if exists "anon_select_staff" on public.staff;
drop policy if exists "anon_insert_staff" on public.staff;
drop policy if exists "anon_update_staff" on public.staff;
drop policy if exists "anon_delete_staff" on public.staff;

-- ============================================================
-- 3. pending_approvals: public can submit, nobody can browse directly
-- ============================================================
revoke select, update, delete on table public.pending_approvals from anon, authenticated;
drop policy if exists "anon_select_pending_approvals" on public.pending_approvals;
drop policy if exists "anon_update_pending_approvals" on public.pending_approvals;
drop policy if exists "anon_delete_pending_approvals" on public.pending_approvals;
-- anon_insert_pending_approvals policy is kept as-is so /join still works.

-- ============================================================
-- 4. gym_settings: publicly readable (needed for QR codes), not writable
-- ============================================================
revoke insert, update, delete on table public.gym_settings from anon, authenticated;
drop policy if exists "anon_all_settings" on public.gym_settings;
drop policy if exists "anon_select_settings" on public.gym_settings;
create policy "anon_select_settings" on public.gym_settings for select to anon, authenticated using (true);

-- ============================================================
-- 5. Verification & admin-action functions (all SECURITY DEFINER)
-- ============================================================

create or replace function public.verify_owner_passcode(p_passcode text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.owner_credentials
    where id = true and passcode_hash = crypt(coalesce(p_passcode, ''), passcode_hash)
  );
end;
$$;
grant execute on function public.verify_owner_passcode(text) to anon, authenticated;

create or replace function public.set_owner_passcode(p_current_passcode text, p_new_passcode text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.verify_owner_passcode(p_current_passcode) then
    return false;
  end if;
  if p_new_passcode is null or length(trim(p_new_passcode)) < 4 then
    raise exception 'New passcode must be at least 4 characters.';
  end if;
  update public.owner_credentials
    set passcode_hash = crypt(p_new_passcode, gen_salt('bf')), updated_at = now()
    where id = true;
  return true;
end;
$$;
grant execute on function public.set_owner_passcode(text, text) to anon, authenticated;

-- Returns {"role":"owner"} or {"role":"staff","name":...,"staff_role":...} or null.
create or replace function public.verify_admin_access(p_passcode text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff record;
begin
  if p_passcode is null or trim(p_passcode) = '' then
    return null;
  end if;
  if public.verify_owner_passcode(p_passcode) then
    return jsonb_build_object('role', 'owner', 'name', 'Owner');
  end if;
  select * into v_staff from public.staff where passcode = trim(p_passcode) and active = true limit 1;
  if found then
    return jsonb_build_object('role', 'staff', 'name', v_staff.name, 'staff_role', v_staff.role);
  end if;
  return null;
end;
$$;
grant execute on function public.verify_admin_access(text) to anon, authenticated;

-- Member portal login: never exposes the ghost_vault row, only the member profile on success.
create or replace function public.verify_member_login(p_member_id text, p_passcode text)
returns setof public.members
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.ghost_vault
    where member_id = upper(trim(p_member_id)) and passcode = trim(p_passcode)
  ) then
    return query select * from public.members where member_id = upper(trim(p_member_id));
  end if;
  return;
end;
$$;
grant execute on function public.verify_member_login(text, text) to anon, authenticated;

create or replace function public.admin_list_pending_approvals(p_passcode text)
returns setof public.pending_approvals
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.verify_admin_access(p_passcode) is null then
    raise exception 'Access denied.';
  end if;
  return query select * from public.pending_approvals where status = 'PENDING' order by created_at desc;
end;
$$;
grant execute on function public.admin_list_pending_approvals(text) to anon, authenticated;

create or replace function public.admin_list_staff(p_passcode text)
returns setof public.staff
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.verify_owner_passcode(p_passcode) then
    raise exception 'Access denied.';
  end if;
  return query select * from public.staff order by created_at desc;
end;
$$;
grant execute on function public.admin_list_staff(text) to anon, authenticated;

create or replace function public.admin_add_staff(p_passcode text, p_name text, p_role text, p_phone text, p_staff_passcode text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if not public.verify_owner_passcode(p_passcode) then
    raise exception 'Access denied.';
  end if;
  v_code := coalesce(nullif(trim(p_staff_passcode), ''), lpad((floor(random() * 10000))::text, 4, '0'));
  insert into public.staff (name, role, phone, passcode, active) values (p_name, p_role, p_phone, v_code, true);
  return v_code;
end;
$$;
grant execute on function public.admin_add_staff(text, text, text, text, text) to anon, authenticated;

create or replace function public.admin_toggle_staff(p_passcode text, p_staff_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.verify_owner_passcode(p_passcode) then
    raise exception 'Access denied.';
  end if;
  update public.staff set active = not active where id = p_staff_id;
  return true;
end;
$$;
grant execute on function public.admin_toggle_staff(text, uuid) to anon, authenticated;

create or replace function public.admin_remove_staff(p_passcode text, p_staff_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.verify_owner_passcode(p_passcode) then
    raise exception 'Access denied.';
  end if;
  delete from public.staff where id = p_staff_id;
  return true;
end;
$$;
grant execute on function public.admin_remove_staff(text, uuid) to anon, authenticated;

create or replace function public.admin_save_settings(p_passcode text, p_upi_vpa text, p_gym_address text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.verify_admin_access(p_passcode) is null then
    raise exception 'Access denied.';
  end if;
  insert into public.gym_settings (key, value) values ('upi_vpa', p_upi_vpa)
    on conflict (key) do update set value = excluded.value;
  insert into public.gym_settings (key, value) values ('gym_address', p_gym_address)
    on conflict (key) do update set value = excluded.value;
  return true;
end;
$$;
grant execute on function public.admin_save_settings(text, text, text) to anon, authenticated;

-- Walk-in join, done server-side so ghost_vault can stay fully locked down.
create or replace function public.walkin_join_member(
  p_passcode text, p_name text, p_phone text, p_dob text, p_gender text,
  p_package text, p_amount integer, p_months integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id text;
  v_passcode  text;
  v_expiry    date;
begin
  if public.verify_admin_access(p_passcode) is null then
    raise exception 'Access denied.';
  end if;
  v_member_id := 'SRB' || (floor(90000000 + random() * 9999999))::bigint::text;
  v_passcode  := lpad((floor(random() * 10000))::text, 4, '0');
  v_expiry    := current_date + (coalesce(p_months, 1) || ' months')::interval;

  insert into public.members (member_id, name, phone, dob, gender, joining_date, package, expiry_date)
  values (v_member_id, p_name, p_phone, nullif(p_dob, ''), p_gender, current_date::text, p_package, v_expiry::text);

  insert into public.ghost_vault (member_id, passcode, name, mobile, join_date)
  values (v_member_id, v_passcode, p_name, p_phone, current_date::text);

  insert into public.billing (member_id, package_name, amount, discount, paid, due, payment_date, expiry_date)
  values (v_member_id, p_package, p_amount, 0, p_amount, 0, current_date::text, v_expiry::text);

  return jsonb_build_object('member_id', v_member_id, 'passcode', v_passcode);
end;
$$;
grant execute on function public.walkin_join_member(text, text, text, text, text, text, integer, integer) to anon, authenticated;
