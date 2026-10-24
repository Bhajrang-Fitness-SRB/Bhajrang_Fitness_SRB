/*
# Fix: approving a registration crashed (HTTP 500: record "v_pt" is not assigned yet)
The function checked `v_pt.id is not null` even when NO personal-training package was chosen, so v_pt was never filled in
and Postgres refused to read it. Every approval without a PT package failed. Now a plain flag (v_has_pt) is used.
Also: a missing package name or a missing/negative amount now gives a clear message instead of a confusing database error.
Same signature, same permissions. Safe to run twice.
*/
create or replace function public.approve_member(p_passcode text, p_approval_id integer, p_package_name text, p_amount integer, p_package_months integer, p_discount integer default 0, p_paid integer default null::integer, p_joining_date date default null::date, p_expiry_date date default null::date, p_allow_duplicate boolean default false, p_pt_package text default null::text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_approval record; v_member_id text; v_join date; v_expiry date; v_passcode text; v_net integer; v_paid integer;
  v_mobile text; v_dup text; v_pt record; v_has_pt boolean := false; v_pt_net int := 0; v_pt_paid int := 0; v_all_paid int; v_pt_end date;
begin
  if public.verify_admin_access(p_passcode) is null then raise exception 'Access denied.'; end if;
  if nullif(btrim(coalesce(p_package_name, '')), '') is null then raise exception 'PACKAGE_REQUIRED: choose a membership package before approving.'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'INVALID_AMOUNT: enter the package amount (0 or more) before approving.'; end if;
  select * into v_approval from public.pending_approvals where id = p_approval_id and status = 'PENDING' for update;
  if not found then raise exception 'No pending approval with id % (missing or already processed)', p_approval_id; end if;
  v_mobile := public._norm_mobile(v_approval.mobile);
  if v_mobile !~ '^[6-9][0-9]{9}$' then raise exception 'INVALID_MOBILE: fix the mobile number (10 digits) before approving.'; end if;
  select member_id into v_dup from public.members where public._norm_mobile(phone) = v_mobile limit 1;
  if v_dup is not null then raise exception 'DUPLICATE_MOBILE: this number already belongs to member %', v_dup; end if;
  if nullif(btrim(coalesce(p_pt_package, '')), '') is not null then
    select * into v_pt from public.packages where category = 'PT' and lower(btrim(name)) = lower(btrim(p_pt_package)) limit 1;
    if not found then raise exception 'PT package not found.'; end if;
    v_has_pt := true;
    v_pt_net := v_pt.price;
  end if;

  v_member_id := 'SRB929' || lpad(nextval('public.member_id_seq')::text, 5, '0');
  v_join := coalesce(p_joining_date, public._today_ist());
  v_expiry := coalesce(p_expiry_date, (v_join + make_interval(months => greatest(coalesce(p_package_months, 1), 1)))::date);
  v_passcode := lpad((floor(random() * 10000))::text, 4, '0');
  v_net := greatest(p_amount - coalesce(p_discount, 0), 0);
  v_all_paid := least(greatest(coalesce(p_paid, v_net + v_pt_net), 0), v_net + v_pt_net);
  v_paid := least(v_all_paid, v_net);
  v_pt_paid := v_all_paid - v_paid;

  insert into public.members
    (member_id, name, father_name, dob, gender, blood_group, govt_id, occupation, marital_status, phone, whatsapp, email,
     address, city, state, pin, gym_experience_years, profile_pic, joining_date, package, expiry_date, goal, height_cm, weight_kg, medical_conditions)
  values
    (v_member_id, v_approval.name, v_approval.father_name, v_approval.dob, v_approval.gender, v_approval.blood_group, v_approval.govt_id,
     v_approval.occupation, v_approval.marital_status, v_mobile, public._norm_mobile(coalesce(nullif(v_approval.whatsapp,''), v_approval.mobile)),
     v_approval.email, v_approval.address, v_approval.city, v_approval.state, v_approval.pin, v_approval.gym_experience_years, v_approval.photo_base64,
     v_join, btrim(p_package_name), v_expiry::text, v_approval.goal, v_approval.height_cm, v_approval.weight_kg, v_approval.medical_conditions);
  insert into public.ghost_vault (name, member_id, mobile, passcode, join_date) values (v_approval.name, v_member_id, v_mobile, v_passcode, v_join::text);
  insert into public.billing (member_id, package_name, amount, discount, paid, due, payment_date, start_date, expiry_date, kind)
  values (v_member_id, btrim(p_package_name), p_amount, coalesce(p_discount, 0), v_paid, greatest(v_net - v_paid, 0), v_join, v_join, v_expiry::text, 'Membership');
  if v_has_pt then
    v_pt_end := (v_join + make_interval(months => v_pt.duration_months))::date;
    insert into public.billing (member_id, package_name, amount, discount, paid, due, payment_date, start_date, expiry_date, kind)
    values (v_member_id, v_pt.name, v_pt.price, 0, v_pt_paid, v_pt.price - v_pt_paid, v_join, v_join, v_pt_end::text, 'PT');
    update public.members set pt_package = v_pt.name, pt_expiry_date = v_pt_end::text where member_id = v_member_id;
  end if;
  update public.pending_approvals set status = 'APPROVED', reviewed_at = now() where id = p_approval_id;
  return jsonb_build_object('member_id', v_member_id, 'passcode', v_passcode);
end;
$function$;

revoke all on function public.approve_member(text, integer, text, integer, integer, integer, integer, date, date, boolean, text) from public;
grant execute on function public.approve_member(text, integer, text, integer, integer, integer, integer, date, date, boolean, text) to anon, authenticated;
