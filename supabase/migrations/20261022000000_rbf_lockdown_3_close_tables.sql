/*
# Lock-down step 3 of 3: close the tables. RUN ONLY AFTER the updated app (that uses the step-2 functions) is live.
If you run this before deploying the new app, staff screens (attendance, diary, inventory, notices, freeze requests,
selling products) will show empty / fail until the app is updated.
What stays open on purpose: notices (members READ active notices), gym_settings (public pay/brochure info),
packages (read), pending_approvals + members (INSERT only: public sign-up / CSV import).
*/
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' and tablename in ('attendance_logs', 'diary_entries', 'inventory', 'freeze_requests', 'selling_products', 'progress_photos')
  loop execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename); end loop;
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'notices' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  loop execute format('drop policy if exists %I on public.notices', r.policyname); end loop;

  for r in select unnest(array['attendance_logs', 'diary_entries', 'inventory', 'freeze_requests', 'selling_products', 'progress_photos']) as t
  loop execute format('revoke all on table public.%I from anon, authenticated', r.t); end loop;
  revoke insert, update, delete on table public.notices from anon, authenticated;
end $$;
