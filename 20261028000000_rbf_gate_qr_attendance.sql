/*
# Gym QR attendance (members scan a QR at the gym with their phone)
How it works
* The gym screen (Admin > Gym QR) shows a QR that CHANGES every minute. It holds a short code that only the database can make.
* The member scans it (in the app or with the phone camera), signs in with member ID + passcode, and the phone shares its location.
* The database checks, in this order: attempt limit -> member passcode -> gym location is set -> QR code is fresh -> location is given and precise enough
  -> the phone is within the allowed distance of the gym entrance. Then it records CHECK-IN, or CHECK-OUT if the member is already inside.
* Distance rule: it passes when (distance - GPS accuracy) <= radius, i.e. the phone's accuracy circle touches the allowed circle. Default radius is 20 ft.
  Phone GPS is not exact (often 5-15 m, worse indoors), so the owner can change the radius and the maximum GPS error allowed.
* Failures are returned (not raised) so they can be counted: 10 failures in 10 minutes for one member blocks that member for 10 minutes.
* Member coordinates are NOT stored. Only distance and accuracy are logged, for tuning.
Safe to run twice (the secret is created once and never rotated by a re-run).
*/
create table if not exists public.gate_settings (
  id boolean primary key default true check (id),
  latitude double precision, longitude double precision,
  radius_m double precision not null default 6.096,
  max_accuracy_m double precision not null default 30,
  secret text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  updated_at timestamptz not null default now(), updated_by text
);
insert into public.gate_settings (id) values (true) on conflict do nothing;

create table if not exists public.gate_scan_log (
  id bigserial primary key, created_at timestamptz not null default now(),
  member_id text, ok boolean not null, reason text, distance_m real, accuracy_m real
);
create index if not exists gate_scan_log_member_idx on public.gate_scan_log (member_id, created_at desc);
create index if not exists gate_scan_log_time_idx on public.gate_scan_log (created_at desc);
alter table public.gate_settings enable row level security;
alter table public.gate_scan_log enable row level security;
revoke all on table public.gate_settings, public.gate_scan_log from anon, authenticated;
revoke all on sequence public.gate_scan_log_id_seq from anon, authenticated;

-- ---------- helpers (not callable from the app) ----------
create or replace function public._gate_window() returns bigint language sql stable set search_path = public, pg_temp as $$ select floor(extract(epoch from now()) / 60)::bigint $$;
create or replace function public._gate_token(p_window bigint) returns text language sql stable security definer set search_path = public, pg_temp as $$
  select left(encode(sha256(convert_to((select secret from public.gate_settings where id) || ':' || p_window::text, 'UTF8')), 'hex'), 10) $$;
create or replace function public._gate_distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable set search_path = public, pg_temp as $$
  select 2 * 6371000 * asin(least(1, sqrt(power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2))))
$$;
revoke all on function public._gate_window(), public._gate_token(bigint), public._gate_distance_m(double precision, double precision, double precision, double precision) from public, anon, authenticated;

-- ---------- admin ----------
create or replace function public.admin_gate_status(p_passcode text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a jsonb := public.verify_admin_access(p_passcode); g public.gate_settings;
begin
  if a is null then raise exception 'Access denied.'; end if;
  select * into g from public.gate_settings where id;
  return jsonb_build_object('is_owner', a ->> 'role' = 'owner', 'location_set', g.latitude is not null,
    'radius_ft', round((g.radius_m / 0.3048)::numeric, 0), 'max_accuracy_m', g.max_accuracy_m, 'updated_at', g.updated_at,
    'scans_today', (select count(*) from public.gate_scan_log where created_at >= (date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')),
    'ok_today', (select count(*) from public.gate_scan_log where ok and created_at >= (date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')));
end; $$;

create or replace function public.admin_gate_token(p_passcode text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare w bigint := public._gate_window();
begin
  if public.verify_admin_access(p_passcode) is null then raise exception 'Access denied.'; end if;
  return jsonb_build_object('token', public._gate_token(w), 'seconds_left', 60 - (extract(epoch from now())::bigint % 60),
    'location_set', (select latitude is not null from public.gate_settings where id));
end; $$;

create or replace function public.admin_gate_set_location(p_passcode text, p_lat double precision, p_lng double precision, p_radius_ft double precision, p_max_accuracy_m double precision default 30)
returns void language plpgsql security definer set search_path = public as $$
declare a jsonb := public.verify_admin_access(p_passcode);
begin
  if a is null or a ->> 'role' is distinct from 'owner' then raise exception 'Only the owner can set the gym location.'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'That location is not valid.'; end if;
  if p_radius_ft is null or p_radius_ft < 10 or p_radius_ft > 500 then raise exception 'Distance must be between 10 and 500 feet.'; end if;
  if p_max_accuracy_m is null or p_max_accuracy_m < 10 or p_max_accuracy_m > 100 then raise exception 'Allowed GPS error must be between 10 and 100 metres.'; end if;
  update public.gate_settings set latitude = p_lat, longitude = p_lng, radius_m = p_radius_ft * 0.3048, max_accuracy_m = p_max_accuracy_m, updated_at = now(), updated_by = a ->> 'name' where id;
end; $$;

create or replace function public.admin_gate_recent(p_passcode text, p_limit int default 40)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if public.verify_admin_access(p_passcode) is null then raise exception 'Access denied.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('at', t.created_at, 'member_id', t.member_id, 'name', t.name, 'ok', t.ok, 'reason', t.reason, 'distance_m', t.distance_m, 'accuracy_m', t.accuracy_m) order by t.created_at desc)
    from (select l.*, m.name from public.gate_scan_log l left join public.members m on m.member_id = l.member_id order by l.created_at desc limit greatest(1, least(coalesce(p_limit, 40), 200))) t), '[]'::jsonb);
end; $$;

-- ---------- member: scan ----------
create or replace function public.member_gate_scan(p_member_id text, p_passcode text, p_token text, p_lat double precision, p_lng double precision, p_accuracy_m double precision default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id text := upper(btrim(coalesce(p_member_id, ''))); g public.gate_settings; w bigint := public._gate_window();
  dist double precision; acc double precision; fails int; open_id int; last_at timestamptz; action text; sod timestamptz;
  m public.members; v_exp date; v_due numeric; v_visits int; now_ts timestamptz := now();
begin
  if random() < 0.01 then delete from public.gate_scan_log where created_at < now() - interval '30 days'; end if;
  if (select count(*) from public.gate_scan_log where created_at > now() - interval '1 minute') > 600 then
    return jsonb_build_object('ok', false, 'reason', 'busy', 'message', 'Too many scans right now. Try again in a minute.'); end if;
  select count(*) into fails from public.gate_scan_log where member_id = v_id and not ok and created_at > now() - interval '10 minutes';
  if fails >= 10 then return jsonb_build_object('ok', false, 'reason', 'too_many_attempts', 'message', 'Too many tries. Please wait 10 minutes and try again.'); end if;
  if not public._member_pass_ok(v_id, p_passcode) then
    insert into public.gate_scan_log (member_id, ok, reason) values (left(v_id, 40), false, 'bad_login');
    return jsonb_build_object('ok', false, 'reason', 'bad_login', 'message', 'Member ID or passcode is not correct.'); end if;
  select * into g from public.gate_settings where id;
  if g.latitude is null then
    insert into public.gate_scan_log (member_id, ok, reason) values (v_id, false, 'not_set_up');
    return jsonb_build_object('ok', false, 'reason', 'not_set_up', 'message', 'Gym QR check-in is not set up yet. Please ask the staff.'); end if;
  if p_token is null or p_token not in (public._gate_token(w), public._gate_token(w - 1)) then
    insert into public.gate_scan_log (member_id, ok, reason) values (v_id, false, 'bad_token');
    return jsonb_build_object('ok', false, 'reason', 'bad_token', 'message', 'This QR code has expired. Scan the code on the screen at the gym again.'); end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    insert into public.gate_scan_log (member_id, ok, reason) values (v_id, false, 'no_location');
    return jsonb_build_object('ok', false, 'reason', 'no_location', 'message', 'Your location is needed. Allow location access for this site and try again.'); end if;
  acc := coalesce(p_accuracy_m, 9999);
  if acc > g.max_accuracy_m then
    insert into public.gate_scan_log (member_id, ok, reason, accuracy_m) values (v_id, false, 'weak_gps', least(acc, 99999));
    return jsonb_build_object('ok', false, 'reason', 'weak_gps', 'message', format('Your phone location is not precise enough (about %s m). Turn on precise location, stand near the entrance and try again.', round(least(acc, 99999)))); end if;
  dist := public._gate_distance_m(p_lat, p_lng, g.latitude, g.longitude);
  if dist - acc > g.radius_m then
    insert into public.gate_scan_log (member_id, ok, reason, distance_m, accuracy_m) values (v_id, false, 'too_far', dist, acc);
    return jsonb_build_object('ok', false, 'reason', 'too_far', 'distance_m', round(dist::numeric, 1),
      'message', format('You seem to be about %s m (%s ft) from the gym entrance. Move closer and scan again.', round(dist::numeric, 0), round((dist / 0.3048)::numeric, 0))); end if;

  select * into m from public.members where member_id = v_id;
  select greatest(max(punch_in_time), max(punch_out_time)) into last_at from public.attendance_logs where member_id = v_id;
  sod := date_trunc('day', now_ts at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  if last_at is not null and last_at > now_ts - interval '30 seconds' then
    action := 'already_recorded';
  else
    select id into open_id from public.attendance_logs where member_id = v_id and punch_out_time is null and punch_in_time >= sod order by punch_in_time desc limit 1;
    if open_id is not null then
      update public.attendance_logs set punch_out_time = now_ts, status = 'CHECKED_OUT' where id = open_id; action := 'checked_out';
    else
      insert into public.attendance_logs (member_id, status, punch_in_time) values (v_id, 'CHECKED_IN', now_ts); action := 'checked_in';
    end if;
  end if;
  insert into public.gate_scan_log (member_id, ok, reason, distance_m, accuracy_m) values (v_id, true, action, dist, acc);

  v_exp := case when m.expiry_date::text ~ '^\d{4}-\d{2}-\d{2}$' then m.expiry_date::text::date end;
  select coalesce(sum(due), 0) into v_due from public.billing where member_id = v_id;
  select count(distinct (punch_in_time at time zone 'Asia/Kolkata')::date) into v_visits from public.attendance_logs
    where member_id = v_id and punch_in_time >= (date_trunc('month', now_ts at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata');
  return jsonb_build_object('ok', true, 'action', action, 'at', now_ts, 'distance_m', round(dist::numeric, 1),
    'member', jsonb_build_object('member_id', m.member_id, 'name', m.name, 'package', m.package, 'expiry_date', v_exp,
      'days_left', case when v_exp is null then null else v_exp - (now_ts at time zone 'Asia/Kolkata')::date end,
      'expired', v_exp is not null and v_exp < (now_ts at time zone 'Asia/Kolkata')::date, 'due', v_due, 'visits_this_month', v_visits));
end; $$;

do $$
declare f text;
begin
  foreach f in array array['admin_gate_status(text)', 'admin_gate_token(text)', 'admin_gate_set_location(text,double precision,double precision,double precision,double precision)',
    'admin_gate_recent(text,int)', 'member_gate_scan(text,text,text,double precision,double precision,double precision)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;
