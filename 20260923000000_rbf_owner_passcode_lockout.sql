/*
# Brute-force lockout on the owner passcode

## Why
`verify_owner_passcode` is a SECURITY DEFINER function granted to `anon`
with no rate limiting. It is correctly hashed and server-side (see the
20260913 hardening migrations), but a 6-digit numeric passcode only has
~1,000,000 combinations — with no attempt limit, a script hitting the
Supabase REST endpoint directly could exhaust that keyspace. This
migration adds a global failed-attempt counter with a cooldown lockout.

This is a SINGLE shared secret (no per-user accounts), so the lockout is
global rather than per-IP — simpler, and correct for this app's model:
if someone is actively guessing, locking the vault for everyone
(including you) for a few minutes is the safer default; you'll know
immediately something is wrong the next time you try to log in.
*/

create table if not exists public.owner_login_guard (
  id boolean primary key default true,
  fail_count int not null default 0,
  locked_until timestamptz,
  constraint owner_login_guard_singleton check (id)
);
insert into public.owner_login_guard (id) values (true) on conflict (id) do nothing;
revoke all on table public.owner_login_guard from anon, authenticated;

create or replace function public.owner_lockout_seconds_remaining()
returns int
language sql
security definer
set search_path = public
as $$
  select greatest(0, ceil(extract(epoch from (locked_until - now())))::int)
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
  select locked_until into v_locked_until from public.owner_login_guard where id = true;
  if v_locked_until is not null and v_locked_until > now() then
    return false; -- still locked out, don't even check the passcode
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
          locked_until = case when fail_count + 1 >= 5 then now() + interval '15 minutes' else locked_until end
      where id = true;
  end if;

  return v_ok;
end;
$$;
-- grant already exists from the hardening migration, re-stated for safety
grant execute on function public.verify_owner_passcode(text) to anon, authenticated;
