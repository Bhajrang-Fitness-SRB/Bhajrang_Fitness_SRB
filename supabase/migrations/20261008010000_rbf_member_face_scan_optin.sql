/*
# Member-chosen face scan (opt-in, admin-approved)

Members decide for themselves whether to use face scan at the kiosk.
- member_request_face_scan: member captures their own face in the app and sends
  a request (needs their passcode). It stays PENDING and is NOT used by the kiosk.
- admin_list_face_scan_requests / admin_resolve_face_scan_request: staff or owner
  approves or declines. Approval copies the face into member_face_descriptors,
  which is what the kiosk matches against.
- member_disable_face_scan: a member can switch face scan off at any time
  (deletes their stored face and any pending request) with no approval needed.
- member_face_scan_status: 'off' | 'pending' | 'approved'.
*/

create table if not exists public.face_scan_requests (
  id uuid primary key default gen_random_uuid(),
  member_id text not null references public.members(member_id) on delete cascade,
  descriptor jsonb not null,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','DECLINED')),
  requested_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index if not exists face_scan_requests_one_pending
  on public.face_scan_requests (member_id) where status = 'PENDING';
alter table public.face_scan_requests enable row level security;
revoke all on table public.face_scan_requests from anon, authenticated;

create or replace function public._member_pass_ok(p_member_id text, p_passcode text)
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.ghost_vault
    where member_id = upper(trim(p_member_id)) and passcode = trim(coalesce(p_passcode,'')));
$$;
revoke all on function public._member_pass_ok(text, text) from public, anon, authenticated;

create or replace function public.member_face_scan_status(p_member_id text, p_passcode text)
returns text language plpgsql security definer set search_path = public as $$
declare v_id text := upper(trim(p_member_id));
begin
  if not public._member_pass_ok(v_id, p_passcode) then raise exception 'Access denied.'; end if;
  if exists (select 1 from public.member_face_descriptors where member_id = v_id) then return 'approved'; end if;
  if exists (select 1 from public.face_scan_requests where member_id = v_id and status = 'PENDING') then return 'pending'; end if;
  return 'off';
end;
$$;

create or replace function public.member_request_face_scan(p_member_id text, p_passcode text, p_descriptor jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_id text := upper(trim(p_member_id));
begin
  if not public._member_pass_ok(v_id, p_passcode) then raise exception 'Access denied.'; end if;
  if p_descriptor is null or jsonb_typeof(p_descriptor) <> 'array' or jsonb_array_length(p_descriptor) <> 128 then
    raise exception 'Invalid face data.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_descriptor) e where jsonb_typeof(e) <> 'number') then
    raise exception 'Invalid face data.';
  end if;
  update public.face_scan_requests set status = 'DECLINED', resolved_at = now()
    where member_id = v_id and status = 'PENDING';
  insert into public.face_scan_requests (member_id, descriptor) values (v_id, p_descriptor);
  return true;
end;
$$;

create or replace function public.member_disable_face_scan(p_member_id text, p_passcode text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_id text := upper(trim(p_member_id));
begin
  if not public._member_pass_ok(v_id, p_passcode) then raise exception 'Access denied.'; end if;
  delete from public.member_face_descriptors where member_id = v_id;
  update public.face_scan_requests set status = 'DECLINED', resolved_at = now()
    where member_id = v_id and status = 'PENDING';
  return true;
end;
$$;

create or replace function public.admin_list_face_scan_requests(p_passcode text)
returns table (id uuid, member_id text, name text, profile_pic text, requested_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if public.verify_admin_access(p_passcode) is null then raise exception 'Access denied.'; end if;
  return query
    select r.id, r.member_id, m.name, m.profile_pic, r.requested_at
    from public.face_scan_requests r join public.members m on m.member_id = r.member_id
    where r.status = 'PENDING' order by r.requested_at desc;
end;
$$;

create or replace function public.admin_resolve_face_scan_request(p_passcode text, p_request_id uuid, p_approve boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_req record;
begin
  if public.verify_admin_access(p_passcode) is null then raise exception 'Access denied.'; end if;
  select * into v_req from public.face_scan_requests where id = p_request_id and status = 'PENDING';
  if not found then raise exception 'Request not found or already handled.'; end if;
  if p_approve then
    insert into public.member_face_descriptors (member_id, descriptor, enrolled_by)
    values (v_req.member_id, v_req.descriptor, 'member')
    on conflict (member_id) do update set descriptor = excluded.descriptor, enrolled_at = now(), enrolled_by = 'member';
  end if;
  update public.face_scan_requests
    set status = case when p_approve then 'APPROVED' else 'DECLINED' end, resolved_at = now()
    where id = p_request_id;
  return true;
end;
$$;

grant execute on function public.member_face_scan_status(text, text) to anon, authenticated;
grant execute on function public.member_request_face_scan(text, text, jsonb) to anon, authenticated;
grant execute on function public.member_disable_face_scan(text, text) to anon, authenticated;
grant execute on function public.admin_list_face_scan_requests(text) to anon, authenticated;
grant execute on function public.admin_resolve_face_scan_request(text, uuid, boolean) to anon, authenticated;
