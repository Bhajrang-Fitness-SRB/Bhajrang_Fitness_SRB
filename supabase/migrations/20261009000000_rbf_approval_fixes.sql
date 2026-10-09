/*
# Pending approval fixes
- Public form can only create PENDING applications (was: any status).
- admin_update_pending_approval: staff/owner can correct an applicant's details before approving.
- admin_reject_pending_approval: reject with a reason (status REJECTED).
- approve_member: blocks invalid mobile numbers and duplicates (unless explicitly allowed),
  and now returns {member_id, passcode} so staff can give the member their login.
*/

alter table public.pending_approvals add column if not exists review_note text;
alter table public.pending_approvals add column if not exists reviewed_at timestamptz;

drop policy if exists anon_insert_pending_approvals on public.pending_approvals;
create policy anon_insert_pending_approvals on public.pending_approvals
  for insert to anon, authenticated with check (status = 'PENDING');

create or replace function public._norm_mobile(p text)
returns text language sql immutable as $$
  select case
    when length(d) = 10 then d
    when length(d) = 12 and d like '91%' then substr(d, 3)
    when length(d) = 11 and d like '0%' then substr(d, 2)
    else d end
  from (select regexp_replace(coalesce(p,''), '\D', '', 'g') d) x;
$$;

create or replace function public.admin_update_pending_approval(p_passcode text, p_id integer, p_changes jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_allowed text[] := array['name','mobile','whatsapp','email','dob','gender','blood_group','marital_status','father_name',
    'govt_id','occupation','gym_experience_years','address','city','state','pin','goal','height_cm','weight_kg','medical_conditions'];
  k text; v text;
begin
  if public.verify_admin_access(p_passcode) is null then raise exception 'Access denied.'; end if;
  if not exists (select 1 from public.pending_approvals where id = p_id and status = 'PENDING') then
    raise exception 'Application not found or already handled.';
  end if;
  for k in select jsonb_object_keys(p_changes) loop
    continue when not (k = any(v_allowed));
    v := nullif(trim(p_changes->>k), '');
    if k in ('mobile','whatsapp') and v is not null then
      v := public._norm_mobile(v);
      if v !~ '^[6-9][0-9]{9}$' then raise exception 'Enter a valid 10-digit mobile number for %.', k; end if;
    elsif k = 'email' and v is not null and v !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'Enter a valid email address.';
    elsif k = 'name' and (v is null or length(v) < 2) then
      raise exception 'Name is required.';
    end if;
    if k = 'dob' then
      execute 'update public.pending_approvals set dob = $1::date where id = $2' using v, p_id;
    elsif k in ('height_cm','weight_kg') then
      execute format('update public.pending_approvals set %I = $1::numeric where id = $2', k) using v, p_id;
    else
      execute format('update public.pending_approvals set %I = $1 where id = $2', k) using v, p_id;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function public.admin_reject_pending_approval(p_passcode text, p_id integer, p_reason text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if public.verify_admin_access(p_passcode) is null then raise exception 'Access denied.'; end if;
  update public.pending_approvals set status = 'REJECTED', review_note = left(p_reason, 300), reviewed_at = now()
    where id = p_id and status = 'PENDING';
  if not found then raise exception 'Application not found or already handled.'; end if;
  return true;
end;
$$;

drop function if exists public.approve_member(text, integer, text, integer, integer, integer, integer, date, date);

create or replace function public.approve_member(
  p_passcode text, p_approval_id integer, p_package_name text, p_amount integer, p_package_months integer,
  p_discount integer default 0, p_paid integer default null, p_joining_date date default null, p_expiry_date date default null,
  p_allow_duplicate boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_approval record; v_member_id text; v_join date; v_expiry date; v_passcode text; v_net integer; v_paid integer;
  v_mobile text; v_dup text;
begin
  if public.verify_admin_access(p_passcode) is null then raise exception 'Access denied.'; end if;
  select * into v_approval from public.pending_approvals where id = p_approval_id and status = 'PENDING' for update;
  if not found then raise exception 'No pending approval with id % (missing or already processed)', p_approval_id; end if;

  v_mobile := public._norm_mobile(v_approval.mobile);
  if v_mobile !~ '^[6-9][0-9]{9}$' then raise exception 'INVALID_MOBILE: fix the mobile number (10 digits) before approving.'; end if;
  if not p_allow_duplicate then
    select member_id into v_dup from public.members where public._norm_mobile(phone) = v_mobile limit 1;
    if v_dup is not null then raise exception 'DUPLICATE_MOBILE: this number already belongs to member %', v_dup; end if;
  end if;

  v_member_id := 'SRB929' || lpad(nextval('public.member_id_seq')::text, 5, '0');
  v_join := coalesce(p_joining_date, current_date);
  v_expiry := coalesce(p_expiry_date, v_join + (p_package_months || ' months')::interval);
  v_passcode := lpad((floor(random() * 10000))::text, 4, '0');
  v_net := greatest(p_amount - coalesce(p_discount, 0), 0);
  v_paid := coalesce(p_paid, v_net);

  insert into public.members
    (member_id, name, father_name, dob, gender, blood_group, govt_id, occupation, marital_status, phone, whatsapp, email,
     address, city, state, pin, gym_experience_years, profile_pic, joining_date, package, expiry_date, goal, height_cm, weight_kg, medical_conditions)
  values
    (v_member_id, v_approval.name, v_approval.father_name, v_approval.dob, v_approval.gender, v_approval.blood_group, v_approval.govt_id,
     v_approval.occupation, v_approval.marital_status, v_mobile, public._norm_mobile(coalesce(nullif(v_approval.whatsapp,''), v_approval.mobile)),
     v_approval.email, v_approval.address, v_approval.city, v_approval.state, v_approval.pin, v_approval.gym_experience_years, v_approval.photo_base64,
     v_join, p_package_name, v_expiry::text, v_approval.goal, v_approval.height_cm, v_approval.weight_kg, v_approval.medical_conditions);

  insert into public.ghost_vault (name, member_id, mobile, passcode, join_date)
  values (v_approval.name, v_member_id, v_mobile, v_passcode, v_join::text);

  insert into public.billing (member_id, package_name, amount, discount, paid, due, payment_date, expiry_date)
  values (v_member_id, p_package_name, p_amount, coalesce(p_discount, 0), v_paid, greatest(v_net - v_paid, 0), v_join, v_expiry::text);

  update public.pending_approvals set status = 'APPROVED', reviewed_at = now() where id = p_approval_id;
  return jsonb_build_object('member_id', v_member_id, 'passcode', v_passcode);
end;
$$;

grant execute on function public.admin_update_pending_approval(text, integer, jsonb) to anon, authenticated;
grant execute on function public.admin_reject_pending_approval(text, integer, text) to anon, authenticated;
grant execute on function public.approve_member(text, integer, text, integer, integer, integer, integer, date, date, boolean) to anon, authenticated;
revoke all on function public._norm_mobile(text) from public;
grant execute on function public._norm_mobile(text) to anon, authenticated;
