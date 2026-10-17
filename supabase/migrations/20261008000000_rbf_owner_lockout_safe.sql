/*
# Owner passcode lockout (safe version)

Supersedes 20260923000000. That version counted every failed
verify_owner_passcode call, but verify_admin_access called it BEFORE checking
staff passcodes, so staff logins counted as owner failures.

Fix: verify_admin_access now checks the staff passcode first; the guarded
owner check only runs when it is not a valid staff passcode. A correct login
(owner or staff) never counts. Any wrong passcode counts, so the owner
passcode cannot be brute-forced through either entry point.
5 failures -> 15 minute lockout; counter resets after the lockout ends.
*/

create table if not exists public.owner_login_guard (
  id boolean primary key default true,
  fail_count int not null default 0,
  locked_until timestamptz,
  constraint owner_login_guard_singleton check (id)
);
insert into public.owner_login_guard (id) values (true) on conflict (id) do nothing;
alter table public.owner_login_guard enable row level security;
revoke all on table public.owner_login_guard from anon, authenticated;

create or replace function public.owner_lockout_seconds_remaining()
returns int
language sql
security definer
set search_path = public
as $$
  select coalesce(greatest(0, ceil(extract(epoch from (locked_until - now())))::int), 0)
  from public.owner_login_guard where id = true;
$$;
grant execute on function public.owner_lockout_seconds_remaining() to anon, authenticated;

create or replace function public.verify_owner_passcode(p_passcode text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_locked_until timestamptz;
  v_ok boolean;
begin
  select locked_until into v_locked_until from public.owner_login_guard where id = true for update;
  if v_locked_until is not null and v_locked_until > now() then
    return false;
  end if;
  if v_locked_until is not null then
    update public.owner_login_guard set fail_count = 0, locked_until = null where id = true;
  end if;

  select exists (
    select 1 from public.owner_credentials
    where id = true and passcode_hash = crypt(coalesce(p_passcode, ''), passcode_hash)
  ) into v_ok;

  if v_ok then
    update public.owner_login_guard set fail_count = 0, locked_until = null where id = true;
  else
    update public.owner_login_guard
      set fail_count = fail_count + 1,
          locked_until = case when fail_count + 1 >= 5 then now() + interval '15 minutes' else null end
      where id = true;
  end if;
  return v_ok;
end;
$$;
grant execute on function public.verify_owner_passcode(text) to anon, authenticated;

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
  select * into v_staff from public.staff where passcode = trim(p_passcode) and active = true limit 1;
  if found then
    return jsonb_build_object('role', 'staff', 'name', v_staff.name, 'staff_role', v_staff.role);
  end if;
  if public.verify_owner_passcode(p_passcode) then
    return jsonb_build_object('role', 'owner', 'name', 'Owner');
  end if;
  return null;
end;
$$;
