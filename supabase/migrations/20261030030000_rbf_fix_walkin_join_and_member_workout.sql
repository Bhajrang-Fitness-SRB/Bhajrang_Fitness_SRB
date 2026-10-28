-- Two functions that always crashed (found by a full static check of every database function):
-- 1) walkin_join_member: wrote text into the date columns members.dob and members.joining_date.
-- 2) warrior_get_my_workout: "array || 'pt'" was read as a malformed array, so the member workout never loaded.

-- the older 10-argument approve_member (before the PT package was added) made calls ambiguous on fresh installs
drop function if exists public.approve_member(text, integer, text, integer, integer, integer, integer, date, date, boolean);

-- an older 8-argument copy made calls ambiguous ("function is not unique") on fresh installs
drop function if exists public.walkin_join_member(text, text, text, text, text, text, integer, integer);

create or replace function public.walkin_join_member(p_passcode text, p_name text, p_phone text, p_dob text, p_gender text, p_package text, p_amount integer, p_months integer, p_pt_package text default null)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_member_id text; v_passcode text; v_today date := public._today_ist(); v_expiry date; v_phone text; v_months int := greatest(coalesce(p_months, 1), 1);
  v_pt record; v_pt_end date; v_dob date; v_has_pt boolean := false;
begin
  if public.verify_admin_access(p_passcode) is null then raise exception 'Access denied.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Name is required.'; end if;
  v_phone := public._norm_mobile(p_phone);
  if v_phone !~ '^[6-9][0-9]{9}$' then raise exception 'Enter a valid 10-digit mobile number.'; end if;
  if exists (select 1 from public.members where public._norm_mobile(phone) = v_phone) then
    raise exception 'This mobile number already belongs to a member.';
  end if;
  begin
    v_dob := nullif(btrim(coalesce(p_dob, '')), '')::date;
  exception when others then
    raise exception 'Date of birth is not a valid date (use YYYY-MM-DD).';
  end;
  if nullif(btrim(coalesce(p_pt_package, '')), '') is not null then
    select * into v_pt from public.packages where category = 'PT' and lower(btrim(name)) = lower(btrim(p_pt_package)) limit 1;
    if not found then raise exception 'PT package not found.'; end if;
    v_has_pt := true;
  end if;
  v_member_id := 'SRB929' || lpad(nextval('public.member_id_seq')::text, 5, '0');
  v_passcode := lpad((floor(random() * 10000))::text, 4, '0');
  v_expiry := (v_today + make_interval(months => v_months))::date;

  insert into public.members (member_id, name, phone, dob, gender, joining_date, package, expiry_date)
  values (v_member_id, trim(p_name), v_phone, v_dob, p_gender, v_today, btrim(p_package), v_expiry::text);
  insert into public.ghost_vault (member_id, passcode, name, mobile, join_date) values (v_member_id, v_passcode, trim(p_name), v_phone, v_today::text);
  insert into public.billing (member_id, package_name, amount, discount, paid, due, payment_date, start_date, expiry_date, kind)
  values (v_member_id, btrim(p_package), p_amount, 0, p_amount, 0, v_today, v_today, v_expiry::text, 'Membership');
  if v_has_pt then
    v_pt_end := (v_today + make_interval(months => v_pt.duration_months))::date;
    insert into public.billing (member_id, package_name, amount, discount, paid, due, payment_date, start_date, expiry_date, kind)
    values (v_member_id, v_pt.name, v_pt.price, 0, v_pt.price, 0, v_today, v_today, v_pt_end::text, 'PT');
    update public.members set pt_package = v_pt.name, pt_expiry_date = v_pt_end::text where member_id = v_member_id;
  end if;
  return jsonb_build_object('member_id', v_member_id, 'passcode', v_passcode);
end;
$function$;

create or replace function public.warrior_get_my_workout(p_member_id text, p_passcode text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
declare v_member text; v_row public.members; v_result jsonb := '{}'::jsonb; v_plan record; v_tiers text[];
begin
  v_member := upper(trim(p_member_id));
  if not public._member_pass_ok(v_member, p_passcode) then
    raise exception 'Access denied.';
  end if;
  select * into v_row from public.members where member_id = v_member;

  v_tiers := array['basic']::text[];
  if v_row.workout_pt_unlocked then v_tiers := array_append(v_tiers, 'pt'); end if;
  if v_row.workout_prep_unlocked then v_tiers := array_append(v_tiers, 'prep'); end if;

  for v_plan in
    select p.id, p.name, p.tier, p.description, p.structure
    from public.workout_assignments a join public.workout_plans p on p.id = a.plan_id
    where a.member_id = v_member and a.active = true and p.tier = any(v_tiers)
  loop
    v_result := v_result || jsonb_build_object(v_plan.tier, jsonb_build_object(
      'plan_id', v_plan.id, 'name', v_plan.name, 'description', v_plan.description,
      'days', (
        select jsonb_agg(jsonb_build_object(
          'day_number', day->>'day_number', 'day_label', day->>'day_label',
          'exercises', (
            select jsonb_agg(jsonb_build_object(
              'exercise_id', e.id, 'name', e.name, 'gif_url', e.gif_url, 'category', e.category,
              'muscle_group', e.muscle_group, 'instructions', e.instructions, 'posture_tips', e.posture_tips,
              'sets', ex->>'sets', 'reps', ex->>'reps', 'weight_direction', ex->>'weight_direction',
              'est_weight', ex->>'est_weight',
              'rest_seconds', ex->>'rest_seconds', 'notes', ex->>'notes'
            ) order by ord)
            from jsonb_array_elements(day->'exercises') with ordinality as t(ex, ord)
            join public.workout_exercises e on e.id = (ex->>'exercise_id')::uuid
          )
        ) order by dord)
        from jsonb_array_elements(v_plan.structure) with ordinality as d(day, dord)
      )
    ));
  end loop;

  return jsonb_build_object('tiers_unlocked', to_jsonb(v_tiers), 'plans', v_result);
end;
$function$;
