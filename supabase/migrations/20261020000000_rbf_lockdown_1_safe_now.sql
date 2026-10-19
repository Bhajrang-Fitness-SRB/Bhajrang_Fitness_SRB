/*
# Lock-down step 1 of 3: close what the app does NOT use (safe to run right now, no app change)

Found by auditing the live database: the public app key (anon) could still
* read every expense (money) row, read and edit AI plans (progress photos are closed later, in step 3, because the member portal uses them),
* hold TRUNCATE / TRIGGER / REFERENCES rights on many tables (TRUNCATE ignores row security),
* keep a few leftover insert/update policies on packages.
The app never touches expenses or ai_plans directly (it uses passcode functions, or the code is unused),
so closing them cannot break anything. Re-runnable.
*/
do $$
declare r record;
begin
  -- 1. policies the app does not need
  for r in select policyname, tablename from pg_policies
           where schemaname = 'public' and tablename in ('expenses', 'ai_plans')
  loop execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename); end loop;
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'packages' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  loop execute format('drop policy if exists %I on public.packages', r.policyname); end loop;

  -- 2. no direct access at all for these
  for r in select unnest(array['expenses', 'ai_plans', 'billing']) as t
  loop
    if to_regclass('public.' || r.t) is not null then
      execute format('revoke all on table public.%I from anon, authenticated', r.t);
    end if;
  end loop;

  -- 3. dangerous table rights that row security does not control
  for r in select tablename from pg_tables where schemaname = 'public'
  loop execute format('revoke truncate, trigger, references on table public.%I from anon, authenticated', r.tablename); end loop;
  for r in select unnest(array['members', 'billing', 'attendance_logs', 'packages', 'gym_settings', 'notices']) as t
  loop
    if to_regclass('public.' || r.t) is not null then execute format('revoke delete on table public.%I from anon, authenticated', r.t); end if;
  end loop;
  if to_regclass('public.packages') is not null then execute 'revoke insert, update on table public.packages from anon, authenticated'; end if;
  if to_regclass('public.gym_settings') is not null then execute 'revoke insert, update on table public.gym_settings from anon, authenticated'; end if;
end $$;

-- Future tables must be private unless someone opens them on purpose.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
