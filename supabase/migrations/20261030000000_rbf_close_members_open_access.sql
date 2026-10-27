-- Final lock-down of the member table.
-- Members are only ever read or changed through passcode-checked functions (admin_list_members,
-- admin_update_member, walkin_join_member, ...). Nobody with only the public key may touch the table directly.
drop policy if exists anon_insert_members on public.members;
drop policy if exists anon_update_members on public.members;
drop policy if exists anon_select_members on public.members;
drop policy if exists anon_delete_members on public.members;
revoke all on public.members from anon, authenticated;

-- Same for the other legacy open tables (no-ops when they are already closed)
revoke all on public.attendance_logs, public.diary_entries, public.freeze_requests, public.inventory, public.progress_photos from anon, authenticated;
revoke insert, update, delete on public.notices, public.gym_settings, public.packages, public.selling_products from anon, authenticated;
