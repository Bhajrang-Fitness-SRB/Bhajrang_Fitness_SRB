-- Fix: "record "v_pt" is not assigned yet" when renewing a membership WITHOUT a PT package.
-- Cause: v_pt (a record) was read (v_pt.id) without ever being assigned when no PT package is chosen.
-- Fix: assign v_pt an empty (all-NULL) row up front, exactly like the earlier approve_member fix.
create or replace function public.admin_renew_membership(
  p_passcode text, p_member_id text, p_package_name text, p_amount integer DEFAULT NULL::integer, p_discount integer DEFAULT 0,
  p_paid integer DEFAULT NULL::integer, p_method text DEFAULT 'UPI'::text, p_start_date date DEFAULT NULL::date,
  p_billing_id integer DEFAULT NULL::integer, p_pt_package text DEFAULT NULL::text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_member record; v_pkg record; v_pt record; v_prev date; v_start date; v_end date;
  v_amount int; v_net int; v_paid int; v_id int; v_today date := public._today_ist();
  v_pt_net int := 0; v_pt_paid int := 0; v_all_paid int; v_pt_prev date; v_pt_start date; v_pt_end date; v_pt_bill int; v_method text;
begin
  if public.verify_admin_access(p_passcode) is null then raise exception 'Access denied.'; end if;
  select * into v_pt from public.packages where false;  -- assign an empty record (fixes "v_pt is not assigned yet")
  select * into v_member from public.members where member_id = upper(trim(p_member_id)) for update;
  if not found then raise exception 'Member not found.'; end if;
  select * into v_pkg from public.packages where category = 'Membership' and lower(btrim(name)) = lower(btrim(p_package_name)) limit 1;
  if not found then raise exception 'Package not found. Choose a package from the list.'; end if;
  v_method := coalesce(nullif(p_method, ''), 'UPI');

  if nullif(btrim(coalesce(p_pt_package, '')), '') is not null then
    select * into v_pt from public.packages where category = 'PT' and lower(btrim(name)) = lower(btrim(p_pt_package)) limit 1;
    if not found then raise exception 'PT package not found.'; end if;
    v_pt_net := v_pt.price;
  end if;

  v_prev := case when v_member.expiry_date ~ '^\d{4}-\d{2}-\d{2}$' then v_member.expiry_date::date end;
  v_start := coalesce(p_start_date, case when v_prev is not null and v_prev >= v_today then v_prev else v_today end);
  v_end := (v_start + make_interval(months => v_pkg.duration_months))::date;
  v_amount := greatest(coalesce(p_amount, v_pkg.price), 0);
  v_net := greatest(v_amount - coalesce(p_discount, 0), 0);
  v_all_paid := least(greatest(coalesce(p_paid, v_net + v_pt_net), 0), v_net + v_pt_net);
  v_paid := least(v_all_paid, v_net);
  v_pt_paid := v_all_paid - v_paid;

  if p_billing_id is not null then
    update public.billing set package_name = v_pkg.name, amount = v_amount, discount = coalesce(p_discount, 0), paid = v_paid,
      due = v_net - v_paid, payment_date = v_today, payment_method = v_method, start_date = v_start, expiry_date = v_end::text, kind = 'Membership'
      where id = p_billing_id and member_id = v_member.member_id and expiry_date is null
      returning id into v_id;
    if v_id is null then raise exception 'Invoice not found or already applied to a membership.'; end if;
  else
    insert into public.billing (member_id, package_name, amount, discount, paid, due, payment_date, payment_method, start_date, expiry_date, kind)
    values (v_member.member_id, v_pkg.name, v_amount, coalesce(p_discount, 0), v_paid, v_net - v_paid, v_today, v_method, v_start, v_end::text, 'Membership')
    returning id into v_id;
  end if;
  update public.members set package = v_pkg.name, expiry_date = v_end::text where member_id = v_member.member_id;

  if v_pt.id is not null then
    v_pt_prev := case when v_member.pt_expiry_date ~ '^\d{4}-\d{2}-\d{2}$' then v_member.pt_expiry_date::date end;
    v_pt_start := coalesce(p_start_date, case when v_pt_prev is not null and v_pt_prev >= v_today then v_pt_prev else v_today end);
    v_pt_end := (v_pt_start + make_interval(months => v_pt.duration_months))::date;
    insert into public.billing (member_id, package_name, amount, discount, paid, due, payment_date, payment_method, start_date, expiry_date, kind)
    values (v_member.member_id, v_pt.name, v_pt.price, 0, v_pt_paid, v_pt.price - v_pt_paid, v_today, v_method, v_pt_start, v_pt_end::text, 'PT')
    returning id into v_pt_bill;
    update public.members set pt_package = v_pt.name, pt_expiry_date = v_pt_end::text where member_id = v_member.member_id;
  end if;

  return jsonb_build_object('billing_id', v_id, 'start', v_start, 'end', v_end, 'package', v_pkg.name, 'months', v_pkg.duration_months,
                            'due', (v_net - v_paid) + (v_pt_net - v_pt_paid),
                            'pt', case when v_pt.id is null then null else jsonb_build_object('package', v_pt.name, 'start', v_pt_start, 'end', v_pt_end, 'billing_id', v_pt_bill) end);
end;
$fn$;
