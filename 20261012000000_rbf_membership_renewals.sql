/*
# Membership registration & renewal — one consistent rule everywhere

Rule: start = previous end date (if the membership is still running) else today (India time);
end = start + the selected package's duration (months, month-end safe).

- billing.start_date added (previous packages now keep start + end).
- admin_renew_membership: creates/activates the invoice AND updates the member's package + expiry.
- admin_create_invoice / admin_record_payment: non-membership invoices and collecting dues.
- member_request_renewal: members request a renewal from the Warrior app (no more open anon writes).
- member_membership: live package, start, end, days left + history for the Warrior app.
- walkin_join_member / approve_member: same date rule, India-time today, phone check, sequence IDs.
- Removes the open anonymous INSERT/UPDATE policies on billing.
*/

alter table public.billing add column if not exists start_date date;
update public.billing set start_date = payment_date where start_date is null and expiry_date is not null;
update public.packages set name = btrim(name) where name <> btrim(name);

create or replace function public._today_ist() returns date language sql stable as $$
  select (now() at time zone 'Asia/Kolkata')::date
$$;
grant execute on function public._today_ist() to anon, authenticated;

create or replace function public.admin_renew_membership(
  p_passcode text, p_member_id text, p_package_name text, p_amount integer default null, p_discount integer default 0,
  p_paid integer default null, p_method text default 'UPI', p_start_date date default null, p_billing_id integer default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_member record; v_pkg record; v_prev date; v_start date; v_end date;
  v_amount int; v_net int; v_paid int; v_id int; v_today date := public._today_ist();
begin
  if public.verify_admin_access(p_passcode) is null then raise exception 'Access denied.'; end if;
  select * into v_member from public.members where member_id = upper(trim(p_member_id)) for update;
  if not found then raise exception 'Member not found.'; end if;
  select * into v_pkg from public.packages where lower(btrim(name)) = lower(btrim(p_package_name)) limit 1;
  if not found then raise exception 'Package not found. Choose a package from the list.'; end if;

  v_prev := case when v_member.expiry_date ~ '^\d{4}-\d{2}-\d{2}$' then v_member.expiry_date::date end;
  v_start := coalesce(p_start_date, case when v_prev is not null and v_prev >= v_today then v_prev else v_today end);
  v_end := (v_start + make_interval(months => v_pkg.duration_months))::date;
  v_amount := greatest(coalesce(p_amount, v_pkg.price), 0);
  v_net := greatest(v_amount - coalesce(p_discount, 0), 0);
  v_paid := least(greatest(coalesce(p_paid, v_net), 0), v_net);

  if p_billing_id is not null then
    update public.billing set package_name = v_pkg.name, amount = v_amount, discount = coalesce(p_discount, 0), paid = v_paid,
      due = v_net - v_paid, payment_date = v_today, payment_method = coalesce(nullif(p_method, ''), 'UPI'),
      start_date = v_start, expiry_date = v_end::text
      where id = p_billing_id and member_id = v_member.member_id and expiry_date is null
      returning id into v_id;
    if v_id is null then raise exception 'Invoice not found or already applied to a membership.'; end if;
  else
    insert into public.billing (member_id, package_name, amount, discount, paid, due, payment_date, payment_method, start_date, expiry_date)
    values (v_member.member_id, v_pkg.name, v_amount, coalesce(p_discount, 0), v_paid, v_net - v_paid, v_today,
            coalesce(nullif(p_method, ''), 'UPI'), v_start, v_end::text)
    returning id into v_id;
  end if;

  update public.members set package = v_pkg.name, expiry_date = v_end::text where member_id = v_member.member_id;
  return jsonb_build_object('billing_id', v_id, 'start', v_start, 'end', v_end, 'package', v_pkg.name,
                            'months', v_pkg.duration_months, 'due', v_net - v_paid);
end;
$$;

create or replace function public.admin_create_invoice(
  p_passcode text, p_member_id text, p_package_name text, p_amount integer, p_discount integer default 0,
  p_paid integer default 0, p_method text default 'UPI')
returns integer language plpgsql security definer set search_path = public as $$
declare v_id int; v_net int;
begin
  if public.verify_admin_access(p_passcode) is null then raise exception 'Access denied.'; end if;
  if not exists (select 1 from public.members where member_id = upper(trim(p_member_id))) then raise exception 'Member not found.'; end if;
  v_net := greatest(coalesce(p_amount, 0) - coalesce(p_discount, 0), 0);
  insert into public.billing (member_id, package_name, amount, discount, paid, due, payment_date, payment_method)
  values (upper(trim(p_member_id)), left(p_package_name, 80), coalesce(p_amount, 0), coalesce(p_discount, 0),
          least(greatest(coalesce(p_paid, 0), 0), v_net), v_net - least(greatest(coalesce(p_paid, 0), 0), v_net),
          public._today_ist(), coalesce(nullif(p_method, ''), 'UPI'))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.admin_record_payment(p_passcode text, p_billing_id integer, p_amount integer, p_method text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_b record; v_pay int;
begin
  if public.verify_admin_access(p_passcode) is null then raise exception 'Access denied.'; end if;
  select * into v_b from public.billing where id = p_billing_id for update;
  if not found then raise exception 'Invoice not found.'; end if;
  v_pay := least(greatest(coalesce(p_amount, 0), 0), coalesce(v_b.due, 0));
  if v_pay <= 0 then raise exception 'Nothing to collect on this invoice.'; end if;
  update public.billing set paid = coalesce(paid, 0) + v_pay, due = coalesce(due, 0) - v_pay,
    payment_method = coalesce(nullif(p_method, ''), payment_method) where id = p_billing_id;
  return jsonb_build_object('paid', coalesce(v_b.paid, 0) + v_pay, 'due', coalesce(v_b.due, 0) - v_pay);
end;
$$;

create or replace function public.member_request_renewal(p_member_id text, p_passcode text, p_package_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id text := upper(trim(p_member_id)); v_pkg record; v_bid int;
begin
  if not public._member_pass_ok(v_id, p_passcode) then raise exception 'Access denied.'; end if;
  select * into v_pkg from public.packages where lower(btrim(name)) = lower(btrim(p_package_name)) limit 1;
  if not found then raise exception 'Package not found.'; end if;
  select id into v_bid from public.billing where member_id = v_id and expiry_date is null and coalesce(paid, 0) = 0
    and lower(btrim(package_name)) = lower(btrim(v_pkg.name)) and created_at > now() - interval '30 days' limit 1;
  if v_bid is null then
    insert into public.billing (member_id, package_name, amount, discount, paid, due, payment_date, payment_method)
    values (v_id, v_pkg.name, v_pkg.price, 0, 0, v_pkg.price, public._today_ist(), 'UPI') returning id into v_bid;
  end if;
  return jsonb_build_object('billing_id', v_bid, 'amount', v_pkg.price, 'package', v_pkg.name);
end;
$$;

create or replace function public.member_membership(p_member_id text, p_passcode text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id text := upper(trim(p_member_id)); m record; v_end date;
begin
  if not public._member_pass_ok(v_id, p_passcode) then raise exception 'Access denied.'; end if;
  select * into m from public.members where member_id = v_id;
  if not found then raise exception 'Member not found.'; end if;
  v_end := case when m.expiry_date ~ '^\d{4}-\d{2}-\d{2}$' then m.expiry_date::date end;
  return jsonb_build_object(
    'package', m.package, 'expiry_date', m.expiry_date, 'joining_date', m.joining_date,
    'days_left', case when v_end is null then null else (v_end - public._today_ist()) end,
    'pending_request', exists (select 1 from public.billing b where b.member_id = v_id and b.expiry_date is null and coalesce(b.paid, 0) = 0 and b.created_at > now() - interval '30 days'),
    'history', coalesce((select jsonb_agg(jsonb_build_object('package', h.package_name, 'start', coalesce(h.start_date, h.payment_date), 'end', h.expiry_date,
        'paid', h.paid, 'due', h.due) order by h.id desc)
      from (select * from public.billing where member_id = v_id and expiry_date is not null order by id desc limit 12) h), '[]'::jsonb));
end;
$$;

create or replace function public.walkin_join_member(p_passcode text, p_name text, p_phone text, p_dob text, p_gender text, p_package text, p_amount integer, p_months integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_member_id text; v_passcode text; v_today date := public._today_ist(); v_expiry date; v_phone text; v_months int := greatest(coalesce(p_months, 1), 1);
begin
  if public.verify_admin_access(p_passcode) is null then raise exception 'Access denied.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Name is required.'; end if;
  v_phone := public._norm_mobile(p_phone);
  if v_phone !~ '^[6-9][0-9]{9}$' then raise exception 'Enter a valid 10-digit mobile number.'; end if;
  if exists (select 1 from public.members where public._norm_mobile(phone) = v_phone) then
    raise exception 'This mobile number already belongs to a member.';
  end if;
  v_member_id := 'SRB929' || lpad(nextval('public.member_id_seq')::text, 5, '0');
  v_passcode := lpad((floor(random() * 10000))::text, 4, '0');
  v_expiry := (v_today + make_interval(months => v_months))::date;

  insert into public.members (member_id, name, phone, dob, gender, joining_date, package, expiry_date)
  values (v_member_id, trim(p_name), v_phone, nullif(p_dob, ''), p_gender, v_today::text, btrim(p_package), v_expiry::text);
  insert into public.ghost_vault (member_id, passcode, name, mobile, join_date) values (v_member_id, v_passcode, trim(p_name), v_phone, v_today::text);
  insert into public.billing (member_id, package_name, amount, discount, paid, due, payment_date, start_date, expiry_date)
  values (v_member_id, btrim(p_package), p_amount, 0, p_amount, 0, v_today, v_today, v_expiry::text);
  return jsonb_build_object('member_id', v_member_id, 'passcode', v_passcode);
end;
$$;

-- approve_member: same rule; records start_date; India-time default start.
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
  select member_id into v_dup from public.members where public._norm_mobile(phone) = v_mobile limit 1;
  if v_dup is not null then raise exception 'DUPLICATE_MOBILE: this number already belongs to member %', v_dup; end if;

  v_member_id := 'SRB929' || lpad(nextval('public.member_id_seq')::text, 5, '0');
  v_join := coalesce(p_joining_date, public._today_ist());
  v_expiry := coalesce(p_expiry_date, (v_join + make_interval(months => greatest(coalesce(p_package_months, 1), 1)))::date);
  v_passcode := lpad((floor(random() * 10000))::text, 4, '0');
  v_net := greatest(p_amount - coalesce(p_discount, 0), 0);
  v_paid := least(coalesce(p_paid, v_net), v_net);

  insert into public.members
    (member_id, name, father_name, dob, gender, blood_group, govt_id, occupation, marital_status, phone, whatsapp, email,
     address, city, state, pin, gym_experience_years, profile_pic, joining_date, package, expiry_date, goal, height_cm, weight_kg, medical_conditions)
  values
    (v_member_id, v_approval.name, v_approval.father_name, v_approval.dob, v_approval.gender, v_approval.blood_group, v_approval.govt_id,
     v_approval.occupation, v_approval.marital_status, v_mobile, public._norm_mobile(coalesce(nullif(v_approval.whatsapp,''), v_approval.mobile)),
     v_approval.email, v_approval.address, v_approval.city, v_approval.state, v_approval.pin, v_approval.gym_experience_years, v_approval.photo_base64,
     v_join, btrim(p_package_name), v_expiry::text, v_approval.goal, v_approval.height_cm, v_approval.weight_kg, v_approval.medical_conditions);
  insert into public.ghost_vault (name, member_id, mobile, passcode, join_date) values (v_approval.name, v_member_id, v_mobile, v_passcode, v_join::text);
  insert into public.billing (member_id, package_name, amount, discount, paid, due, payment_date, start_date, expiry_date)
  values (v_member_id, btrim(p_package_name), p_amount, coalesce(p_discount, 0), v_paid, greatest(v_net - v_paid, 0), v_join, v_join, v_expiry::text);
  update public.pending_approvals set status = 'APPROVED', reviewed_at = now() where id = p_approval_id;
  return jsonb_build_object('member_id', v_member_id, 'passcode', v_passcode);
end;
$$;

drop policy if exists anon_insert_billing on public.billing;
drop policy if exists anon_update_billing on public.billing;

grant execute on function public.admin_renew_membership(text, text, text, integer, integer, integer, text, date, integer) to anon, authenticated;
grant execute on function public.admin_create_invoice(text, text, text, integer, integer, integer, text) to anon, authenticated;
grant execute on function public.admin_record_payment(text, integer, integer, text) to anon, authenticated;
grant execute on function public.member_request_renewal(text, text, text) to anon, authenticated;
grant execute on function public.member_membership(text, text) to anon, authenticated;
