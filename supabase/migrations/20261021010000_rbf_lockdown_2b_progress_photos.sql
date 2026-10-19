/*
# Lock-down step 2b: member progress photos through passcode-checked functions
The member portal uses progress photos, so they cannot be closed until the app calls these functions.
Only ADDS functions (safe to run before the new app is live). Step 3 then closes the table.
Each function checks the member's OWN passcode, so a member can only see/add/delete their own photos.
*/
create or replace function public.member_list_progress_photos(p_member_id text, p_passcode text)
returns setof public.progress_photos language plpgsql security definer set search_path = public as $$
begin
  if not public._member_pass_ok(p_member_id, p_passcode) then raise exception 'Access denied.'; end if;
  return query select * from public.progress_photos where member_id = upper(trim(p_member_id)) order by taken_at desc, created_at desc limit 200;
end; $$;

create or replace function public.member_add_progress_photo(p_member_id text, p_passcode text, p_photo_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._member_pass_ok(p_member_id, p_passcode) then raise exception 'Access denied.'; end if;
  if coalesce(trim(p_photo_url), '') = '' or length(p_photo_url) > 2000 then raise exception 'Bad photo link.'; end if;
  insert into public.progress_photos (member_id, photo_url) values (upper(trim(p_member_id)), trim(p_photo_url));
end; $$;

create or replace function public.member_delete_progress_photo(p_member_id text, p_passcode text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._member_pass_ok(p_member_id, p_passcode) then raise exception 'Access denied.'; end if;
  delete from public.progress_photos where id = p_id and member_id = upper(trim(p_member_id));
end; $$;

revoke all on function public.member_list_progress_photos(text, text) from public;
revoke all on function public.member_add_progress_photo(text, text, text) from public;
revoke all on function public.member_delete_progress_photo(text, text, uuid) from public;
grant execute on function public.member_list_progress_photos(text, text) to anon, authenticated;
grant execute on function public.member_add_progress_photo(text, text, text) to anon, authenticated;
grant execute on function public.member_delete_progress_photo(text, text, uuid) to anon, authenticated;
