-- Kiosk attendance fix.
-- BUG: kiosk_scan / kiosk_scan_device compared the text column members.expiry_date with a date
-- ("operator does not exist: text < date"), so EVERY scan crashed and nothing was saved.
-- FIX: read the expiry safely, use India time, and return everything the kiosk voice needs
-- (birthday, days left, minutes trained). Also adds kiosk_recent_activity so every kiosk shows the
-- same live list straight from the database.

create or replace function public._member_expiry(p_text text) returns date
language sql immutable as $$ select case when p_text ~ '^\d{4}-\d{2}-\d{2}' then left(p_text, 10)::date end $$;

create or replace function public.kiosk_scan(p_member_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_member record; v_open record; v_action text;
  v_today date := public._today_ist();
  v_day_start timestamptz := v_today::timestamp at time zone 'Asia/Kolkata';
  v_exp date; v_days int; v_minutes int; v_month_visits int; v_birthday boolean;
begin
  select member_id, name, profile_pic, expiry_date, dob, gender into v_member
  from public.members where member_id = upper(trim(p_member_id)) limit 1;
  if not found then return jsonb_build_object('found', false); end if;

  select id, punch_in_time into v_open from public.attendance_logs
  where member_id = v_member.member_id and punch_in_time >= v_day_start and punch_out_time is null
  order by punch_in_time desc limit 1;

  if found then
    update public.attendance_logs set punch_out_time = now(), status = 'CHECKED_OUT' where id = v_open.id;
    v_action := 'CHECK-OUT';
    v_minutes := greatest(1, round(extract(epoch from (now() - v_open.punch_in_time)) / 60)::int);
  else
    insert into public.attendance_logs (member_id, status) values (v_member.member_id, 'CHECKED_IN');
    v_action := 'CHECK-IN';
  end if;

  v_exp := public._member_expiry(v_member.expiry_date);
  v_days := case when v_exp is null then null else v_exp - v_today end;
  v_birthday := v_member.dob is not null
    and extract(month from v_member.dob) = extract(month from v_today)
    and extract(day from v_member.dob) = extract(day from v_today);
  select count(distinct (punch_in_time at time zone 'Asia/Kolkata')::date) into v_month_visits
  from public.attendance_logs
  where member_id = v_member.member_id and punch_in_time >= (date_trunc('month', v_today)::timestamp at time zone 'Asia/Kolkata');

  return jsonb_build_object(
    'found', true, 'member_id', v_member.member_id, 'name', v_member.name, 'profile_pic', v_member.profile_pic,
    'gender', v_member.gender, 'action', v_action,
    'expired', coalesce(v_days < 0, false),
    'days_left', v_days,
    'expiring_soon', coalesce(v_days between 0 and 7, false),
    'birthday', v_birthday, 'minutes', v_minutes, 'visits_this_month', v_month_visits);
end; $$;

create or replace function public.kiosk_scan_device(p_device_id uuid, p_member_id text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_member record; v_last timestamptz; v_days int;
begin
  if not exists (select 1 from public.kiosk_devices where device_id = p_device_id and approved = true) then
    raise exception 'Device not approved.';
  end if;
  update public.kiosk_devices set last_seen = now() where device_id = p_device_id;

  select member_id, name, profile_pic, expiry_date into v_member
  from public.members where member_id = upper(trim(p_member_id)) limit 1;
  if not found then return jsonb_build_object('found', false); end if;

  select max(greatest(punch_in_time, coalesce(punch_out_time, punch_in_time))) into v_last
  from public.attendance_logs where member_id = v_member.member_id;

  if v_last is not null and v_last > now() - interval '30 seconds' then
    v_days := public._member_expiry(v_member.expiry_date) - public._today_ist();
    return jsonb_build_object('found', true, 'cooldown', true, 'member_id', v_member.member_id, 'name', v_member.name,
      'profile_pic', v_member.profile_pic, 'action', 'ALREADY-SCANNED', 'expired', coalesce(v_days < 0, false));
  end if;
  return public.kiosk_scan(v_member.member_id);
end; $$;

-- Live list for the kiosk screen: today's check-ins and check-outs, newest first (same on every kiosk).
create or replace function public.kiosk_recent_activity(p_device_id uuid, p_limit integer default 12)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_start timestamptz := public._today_ist()::timestamp at time zone 'Asia/Kolkata';
begin
  if not exists (select 1 from public.kiosk_devices where device_id = p_device_id and approved = true) then
    raise exception 'Device not approved.';
  end if;
  return jsonb_build_object(
    'present_now', (select count(*) from public.attendance_logs where punch_in_time >= v_start and punch_out_time is null),
    'today_visits', (select count(*) from public.attendance_logs where punch_in_time >= v_start),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', e.member_id, 'name', e.name, 'action', e.action,
              'at', e.at) order by e.at desc)
       from (select * from (
              select a.member_id, coalesce(m.name, a.member_id) as name,
                     case when a.punch_out_time is not null then 'CHECK-OUT' else 'CHECK-IN' end as action,
                     coalesce(a.punch_out_time, a.punch_in_time) as at
              from public.attendance_logs a left join public.members m on m.member_id = a.member_id
              where a.punch_in_time >= v_start) z order by at desc limit least(greatest(coalesce(p_limit, 12), 1), 50)) e), '[]'::jsonb));
end; $$;

revoke all on function public.kiosk_scan(text) from public, anon, authenticated;
grant execute on function public.kiosk_scan_device(uuid, text) to anon, authenticated;
grant execute on function public.kiosk_recent_activity(uuid, integer) to anon, authenticated;
