/*
# Lock-down step 2 of 3: passcode-checked functions that replace direct table access
Only ADDS functions. Safe to run before the new app is live; nothing is closed here.
Staff / owner functions check the staff or owner passcode (verify_admin_access).
Member functions check the member's own passcode.
*/
create or replace function public.lock_require_staff(p_passcode text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.verify_admin_access(p_passcode) is null then raise exception 'Access denied.'; end if;
end; $$;
revoke all on function public.lock_require_staff(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- attendance
create or replace function public.admin_list_attendance(p_passcode text, p_limit int default 2000)
returns setof public.attendance_logs language plpgsql security definer set search_path = public as $$
begin
  perform public.lock_require_staff(p_passcode);
  return query select * from public.attendance_logs order by punch_in_time desc nulls last limit greatest(1, least(coalesce(p_limit, 2000), 5000));
end; $$;

create or replace function public.admin_attendance_check_in(p_passcode text, p_member_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.lock_require_staff(p_passcode);
  if not exists (select 1 from public.members where member_id = upper(trim(p_member_id))) then raise exception 'Unknown member.'; end if;
  insert into public.attendance_logs (member_id, status) values (upper(trim(p_member_id)), 'CHECKED_IN');
end; $$;

create or replace function public.admin_attendance_check_out(p_passcode text, p_id int)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.lock_require_staff(p_passcode);
  update public.attendance_logs set punch_out_time = now(), status = 'CHECKED_OUT' where id = p_id;
end; $$;

create or replace function public.member_my_attendance(p_member_id text, p_passcode text, p_limit int default 8)
returns setof public.attendance_logs language plpgsql security definer set search_path = public as $$
begin
  if not public._member_pass_ok(p_member_id, p_passcode) then raise exception 'Access denied.'; end if;
  return query select * from public.attendance_logs where member_id = upper(trim(p_member_id)) order by punch_in_time desc nulls last limit greatest(1, least(coalesce(p_limit, 8), 100));
end; $$;

-- ---------------------------------------------------------------- diary
create or replace function public.admin_diary_list(p_passcode text)
returns setof public.diary_entries language plpgsql security definer set search_path = public as $$
begin
  perform public.lock_require_staff(p_passcode);
  return query select * from public.diary_entries order by entry_date desc, created_at desc limit 1000;
end; $$;
create or replace function public.admin_diary_add(p_passcode text, p_author text, p_tag text, p_title text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.lock_require_staff(p_passcode);
  if coalesce(trim(p_title), '') = '' then raise exception 'Title required.'; end if;
  insert into public.diary_entries (author, tag, title, note)
  values (left(coalesce(nullif(trim(p_author), ''), 'Staff'), 80), left(coalesce(nullif(trim(p_tag), ''), 'General'), 40), left(trim(p_title), 200), left(coalesce(p_note, ''), 4000));
end; $$;
create or replace function public.admin_diary_delete(p_passcode text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.lock_require_staff(p_passcode);
  delete from public.diary_entries where id = p_id;
end; $$;

-- ---------------------------------------------------------------- inventory
create or replace function public.admin_inventory_list(p_passcode text)
returns setof public.inventory language plpgsql security definer set search_path = public as $$
begin
  perform public.lock_require_staff(p_passcode);
  return query select * from public.inventory order by item_name asc;
end; $$;
create or replace function public.admin_inventory_add(p_passcode text, p_item_name text, p_category text, p_quantity int, p_reorder_level int, p_unit_price int)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.lock_require_staff(p_passcode);
  if coalesce(trim(p_item_name), '') = '' then raise exception 'Item name required.'; end if;
  insert into public.inventory (item_name, category, quantity, reorder_level, unit_price, last_restocked)
  values (left(trim(p_item_name), 120), left(coalesce(p_category, 'Supplement'), 40), greatest(0, coalesce(p_quantity, 0)), greatest(0, coalesce(p_reorder_level, 5)), greatest(0, coalesce(p_unit_price, 0)), current_date);
end; $$;
create or replace function public.admin_inventory_set_quantity(p_passcode text, p_id uuid, p_quantity int)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.lock_require_staff(p_passcode);
  update public.inventory set quantity = greatest(0, coalesce(p_quantity, 0)) where id = p_id;
end; $$;
create or replace function public.admin_inventory_delete(p_passcode text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.lock_require_staff(p_passcode);
  delete from public.inventory where id = p_id;
end; $$;

-- ---------------------------------------------------------------- notices (members still READ active notices directly) + freeze requests
create or replace function public.admin_notice_list(p_passcode text)
returns setof public.notices language plpgsql security definer set search_path = public as $$
begin
  perform public.lock_require_staff(p_passcode);
  return query select * from public.notices order by created_at desc limit 200;
end; $$;
create or replace function public.admin_notice_add(p_passcode text, p_title text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.lock_require_staff(p_passcode);
  if coalesce(trim(p_title), '') = '' then raise exception 'Title required.'; end if;
  insert into public.notices (title, body, active) values (left(trim(p_title), 200), left(coalesce(p_body, ''), 2000), true);
end; $$;
create or replace function public.admin_notice_set_active(p_passcode text, p_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.lock_require_staff(p_passcode);
  update public.notices set active = coalesce(p_active, false) where id = p_id;
end; $$;

create or replace function public.admin_freeze_list_pending(p_passcode text)
returns setof public.freeze_requests language plpgsql security definer set search_path = public as $$
begin
  perform public.lock_require_staff(p_passcode);
  return query select * from public.freeze_requests where status = 'PENDING' order by requested_at desc limit 200;
end; $$;
create or replace function public.admin_freeze_resolve(p_passcode text, p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.lock_require_staff(p_passcode);
  if p_status not in ('APPROVED', 'DECLINED') then raise exception 'Unknown status.'; end if;
  update public.freeze_requests set status = p_status, resolved_at = now() where id = p_id;
end; $$;
create or replace function public.member_request_freeze(p_member_id text, p_passcode text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._member_pass_ok(p_member_id, p_passcode) then raise exception 'Access denied.'; end if;
  if exists (select 1 from public.freeze_requests where member_id = upper(trim(p_member_id)) and status = 'PENDING') then
    raise exception 'You already have a freeze request waiting.';
  end if;
  insert into public.freeze_requests (member_id, reason) values (upper(trim(p_member_id)), left(coalesce(p_reason, ''), 500));
end; $$;

-- ---------------------------------------------------------------- selling products (hides cost prices from the public key)
create or replace function public.selling_list_products(p_owner_passcode text default null, p_staff_passcode text default null, p_phone text default null, p_active_only boolean default false)
returns setof public.selling_products language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean := false;
begin
  if p_owner_passcode is not null and public.verify_selling_owner(p_owner_passcode) then ok := true;
  elsif p_staff_passcode is not null and p_phone is not null and exists (
    select 1 from public.selling_staff where phone = trim(p_phone) and passcode = trim(p_staff_passcode) and approved = true and active = true) then ok := true;
  end if;
  if not ok then raise exception 'Access denied.'; end if;
  return query select * from public.selling_products where (not coalesce(p_active_only, false)) or active order by name asc;
end; $$;

do $$
declare f text;
begin
  foreach f in array array[
    'admin_list_attendance(text,int)', 'admin_attendance_check_in(text,text)', 'admin_attendance_check_out(text,int)', 'member_my_attendance(text,text,int)',
    'admin_diary_list(text)', 'admin_diary_add(text,text,text,text,text)', 'admin_diary_delete(text,uuid)',
    'admin_inventory_list(text)', 'admin_inventory_add(text,text,text,int,int,int)', 'admin_inventory_set_quantity(text,uuid,int)', 'admin_inventory_delete(text,uuid)',
    'admin_notice_list(text)', 'admin_notice_add(text,text,text)', 'admin_notice_set_active(text,uuid,boolean)',
    'admin_freeze_list_pending(text)', 'admin_freeze_resolve(text,uuid,text)', 'member_request_freeze(text,text,text)',
    'selling_list_products(text,text,text,boolean)']
  loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;
