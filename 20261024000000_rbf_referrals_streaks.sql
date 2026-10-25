/*
# Referral rewards + attendance streaks / badges / leaderboard
Everything is calculated inside the database and checked with the member's own passcode (members) or the staff/owner passcode (admin).
* Streak = consecutive WEEKS (Mon-Sun, India time) with at least N different visit days (N = streak_weekly_target, default 3).
  A week still in progress never breaks your streak. Two scans on one day count once.
* Badges: visit milestones (1, 10, 25, 50, 100, 200, 365 days) and streak milestones (4, 8, 12, 26, 52 weeks).
* Leaderboard: this month's visit days. A member appears ONLY if they switched it on (default off). Names shown as "Rahul D.".
* Referral: member invites a friend (name + phone) or staff links a walk-in ("RB001 sent me"). When the friend has joined, ONLY THE OWNER
  presses Reward: both members get referral_reward_days (default 7) added to their expiry. Guards: no self-referral, friend must be a
  member who joined in the last 30 days, one reward per friend, monthly cap per referrer (default 5), nothing is automatic.
Safe to run twice.
*/
create table if not exists public.reward_settings (key text primary key, value int not null);
insert into public.reward_settings (key, value) values ('referral_reward_days', 7), ('referral_monthly_cap', 5), ('streak_weekly_target', 3)
  on conflict (key) do nothing;

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id text not null,
  friend_name text,
  friend_phone text,
  referred_id text,
  status text not null default 'invited' check (status in ('invited', 'joined', 'rewarded', 'void')),
  created_at timestamptz not null default now(),
  joined_at timestamptz,
  rewarded_at timestamptz,
  rewarded_by text,
  reward_days int
);
create unique index if not exists referrals_referred_once on public.referrals (referred_id) where referred_id is not null and status <> 'void';
create unique index if not exists referrals_phone_once on public.referrals (right(friend_phone, 10)) where friend_phone is not null and status <> 'void';
create index if not exists referrals_referrer_idx on public.referrals (referrer_id, created_at desc);

create table if not exists public.member_social_prefs (
  member_id text primary key,
  show_on_leaderboard boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.reward_settings enable row level security;
alter table public.referrals enable row level security;
alter table public.member_social_prefs enable row level security;
revoke all on table public.reward_settings, public.referrals, public.member_social_prefs from anon, authenticated;

create index if not exists attendance_logs_member_time_idx on public.attendance_logs (member_id, punch_in_time desc);

-- ---------- helpers (not callable from the app) ----------
create or replace function public._ist_today() returns date language sql stable as $$ select (now() at time zone 'Asia/Kolkata')::date $$;
create or replace function public._last10(p text) returns text language sql immutable as $$ select right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10) $$;
create or replace function public._reward_setting(p_key text, p_default int) returns int language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.reward_settings where key = p_key), p_default) $$;
create or replace function public._short_name(p text) returns text language sql immutable as $$
  select case when nullif(trim(coalesce(p, '')), '') is null then 'Member'
    else split_part(trim(p), ' ', 1) || coalesce(' ' || nullif(left(split_part(trim(p), ' ', 2), 1), '') || '.', '') end $$;
create or replace function public._admin_role(p_passcode text) returns text language sql stable security definer set search_path = public as $$
  select public.verify_admin_access(p_passcode) ->> 'role' $$;
revoke all on function public._ist_today(), public._last10(text), public._reward_setting(text, int), public._short_name(text), public._admin_role(text) from public, anon, authenticated;

-- ---------- member: streak + badges ----------
create or replace function public.member_streak(p_member_id text, p_passcode text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id text := upper(trim(p_member_id)); target int; today date := public._ist_today(); wk date; cur date;
  streak int := 0; best int := 0; total int; v30 int; thisweek int; qweeks date[];
  visit_marks int[] := array[1, 10, 25, 50, 100, 200, 365]; streak_marks int[] := array[4, 8, 12, 26, 52];
  badges jsonb := '[]'::jsonb; m int; nxt int;
begin
  if not public._member_pass_ok(v_id, p_passcode) then raise exception 'Access denied.'; end if;
  target := public._reward_setting('streak_weekly_target', 3);
  wk := date_trunc('week', today)::date;
  with d as (select distinct (a.punch_in_time at time zone 'Asia/Kolkata')::date as day from public.attendance_logs a where a.member_id = v_id and a.punch_in_time is not null)
  select count(*), count(*) filter (where day >= today - 29), count(*) filter (where day >= wk) into total, v30, thisweek from d;
  with d as (select distinct (a.punch_in_time at time zone 'Asia/Kolkata')::date as day from public.attendance_logs a where a.member_id = v_id and a.punch_in_time is not null),
       w as (select date_trunc('week', day)::date as ws, count(*) as n from d group by 1)
  select coalesce(array_agg(ws order by ws), '{}') into qweeks from w where n >= target;
  cur := case when wk = any (qweeks) then wk else wk - 7 end;
  while cur = any (qweeks) loop streak := streak + 1; cur := cur - 7; end loop;
  select coalesce(max(c), 0) into best from (select count(*) as c from (select x, x - (row_number() over (order by x))::int * 7 as g from unnest(qweeks) x) t group by g) s;
  best := greatest(best, streak);
  foreach m in array visit_marks loop
    badges := badges || jsonb_build_object('code', 'visits_' || m, 'label', m || ' gym days', 'earned', total >= m);
    if nxt is null and total < m then nxt := m; end if;
  end loop;
  foreach m in array streak_marks loop
    badges := badges || jsonb_build_object('code', 'streak_' || m, 'label', m || '-week streak', 'earned', best >= m);
  end loop;
  return jsonb_build_object('total_visits', total, 'visits_30d', v30, 'this_week', thisweek, 'weekly_target', target,
    'week_streak', streak, 'best_week_streak', best, 'badges', badges, 'next_visit_goal', nxt);
end; $$;

-- ---------- member: leaderboard (opt-in) ----------
create or replace function public.member_set_leaderboard(p_member_id text, p_passcode text, p_show boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._member_pass_ok(p_member_id, p_passcode) then raise exception 'Access denied.'; end if;
  insert into public.member_social_prefs (member_id, show_on_leaderboard) values (upper(trim(p_member_id)), coalesce(p_show, false))
    on conflict (member_id) do update set show_on_leaderboard = excluded.show_on_leaderboard, updated_at = now();
end; $$;

create or replace function public.member_leaderboard(p_member_id text, p_passcode text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id text := upper(trim(p_member_id)); today date := public._ist_today(); mstart date; res jsonb;
begin
  if not public._member_pass_ok(v_id, p_passcode) then raise exception 'Access denied.'; end if;
  mstart := date_trunc('month', today)::date;
  with d as (
    select a.member_id, count(distinct (a.punch_in_time at time zone 'Asia/Kolkata')::date) as days
    from public.attendance_logs a where a.punch_in_time >= (mstart::timestamp at time zone 'Asia/Kolkata') group by a.member_id
  ), ranked as (select d.member_id, d.days, rank() over (order by d.days desc) as rk from d)
  select jsonb_build_object(
    'month', to_char(mstart, 'Mon YYYY'),
    'listed', coalesce((select p.show_on_leaderboard from public.member_social_prefs p where p.member_id = v_id), false),
    'me', (select jsonb_build_object('days', r.days, 'rank', r.rk, 'of', (select count(*) from ranked)) from ranked r where r.member_id = v_id),
    'top', coalesce((select jsonb_agg(jsonb_build_object('name', t.nm, 'days', t.days, 'rank', t.rk, 'me', t.member_id = v_id) order by t.rk, t.nm)
      from (select r.member_id, r.days, r.rk, public._short_name(m.name) as nm from ranked r
            join public.member_social_prefs p on p.member_id = r.member_id and p.show_on_leaderboard
            join public.members m on m.member_id = r.member_id order by r.rk, nm limit 10) t), '[]'::jsonb)
  ) into res;
  return res;
end; $$;

-- ---------- member: referrals ----------
create or replace function public.member_referral_summary(p_member_id text, p_passcode text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id text := upper(trim(p_member_id)); res jsonb;
begin
  if not public._member_pass_ok(v_id, p_passcode) then raise exception 'Access denied.'; end if;
  select jsonb_build_object('code', v_id, 'reward_days', public._reward_setting('referral_reward_days', 7),
    'invited', count(*) filter (where status = 'invited'), 'joined', count(*) filter (where status = 'joined'),
    'rewarded', count(*) filter (where status = 'rewarded'),
    'free_days_earned', coalesce(sum(reward_days) filter (where status = 'rewarded'), 0),
    'friends', coalesce((select jsonb_agg(jsonb_build_object('name', split_part(coalesce(nullif(trim(f.friend_name), ''), 'Friend'), ' ', 1), 'status', f.status, 'created_at', f.created_at) order by f.created_at desc)
       from (select * from public.referrals x where x.referrer_id = v_id and x.status <> 'void' order by x.created_at desc limit 20) f), '[]'::jsonb))
  into res from public.referrals where referrer_id = v_id and status <> 'void';
  return res;
end; $$;

create or replace function public.member_refer_friend(p_member_id text, p_passcode text, p_name text, p_phone text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id text := upper(trim(p_member_id)); f10 text := public._last10(p_phone); digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'); new_id uuid;
begin
  if not public._member_pass_ok(v_id, p_passcode) then raise exception 'Access denied.'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 or length(p_name) > 60 then raise exception 'Enter your friend''s name.'; end if;
  if length(digits) < 10 or length(digits) > 15 then raise exception 'Enter a valid phone number.'; end if;
  if exists (select 1 from public.members m where public._last10(m.phone) = f10 or public._last10(m.whatsapp) = f10) then raise exception 'This person is already a member.'; end if;
  if (select count(*) from public.referrals where referrer_id = v_id and status = 'invited') >= 20 then raise exception 'You have 20 friends waiting already. Ask staff to link them first.'; end if;
  begin
    insert into public.referrals (referrer_id, friend_name, friend_phone) values (v_id, trim(p_name), digits) returning id into new_id;
  exception when unique_violation then raise exception 'Someone already invited this number.';
  end;
  return new_id;
end; $$;

-- ---------- admin ----------
create or replace function public.admin_referral_overview(p_passcode text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare role text := public._admin_role(p_passcode);
begin
  if role is null then raise exception 'Access denied.'; end if;
  return jsonb_build_object(
    'is_owner', role = 'owner', 'today', public._ist_today(),
    'settings', jsonb_build_object('referral_reward_days', public._reward_setting('referral_reward_days', 7),
      'referral_monthly_cap', public._reward_setting('referral_monthly_cap', 5), 'streak_weekly_target', public._reward_setting('streak_weekly_target', 3)),
    'referrals', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'status', r.status, 'referrer_id', r.referrer_id, 'referrer_name', a.name,
        'friend_name', coalesce(r.friend_name, b.name), 'friend_phone', r.friend_phone, 'referred_id', r.referred_id, 'referred_name', b.name,
        'created_at', r.created_at, 'joined_at', r.joined_at, 'rewarded_at', r.rewarded_at, 'reward_days', r.reward_days) order by r.created_at desc)
      from (select * from public.referrals order by created_at desc limit 300) r
      left join public.members a on a.member_id = r.referrer_id left join public.members b on b.member_id = r.referred_id), '[]'::jsonb));
end; $$;

create or replace function public._referral_checks(p_referrer text, p_referred text)
returns void language plpgsql security definer set search_path = public as $$
declare a record; b record; joined date;
begin
  if p_referrer = p_referred then raise exception 'A member cannot refer themselves.'; end if;
  select * into a from public.members where member_id = p_referrer; if not found then raise exception 'Referrer % not found.', p_referrer; end if;
  select * into b from public.members where member_id = p_referred; if not found then raise exception 'Member % not found.', p_referred; end if;
  if public._last10(a.phone) = public._last10(b.phone) or (public._last10(a.whatsapp) <> '' and public._last10(a.whatsapp) = public._last10(b.whatsapp)) then
    raise exception 'Same phone number as the referrer. Not allowed.'; end if;
  joined := case when b.joining_date::text ~ '^\d{4}-\d{2}-\d{2}' then left(b.joining_date::text, 10)::date end;
  if joined is not null and joined < public._ist_today() - 30 then raise exception '% joined more than 30 days ago, so is not a new member.', p_referred; end if;
end; $$;
revoke all on function public._referral_checks(text, text) from public, anon, authenticated;

create or replace function public.admin_referral_create(p_passcode text, p_referrer_id text, p_referred_id text)
returns uuid language plpgsql security definer set search_path = public as $$
declare a text := upper(trim(p_referrer_id)); b text := upper(trim(p_referred_id)); new_id uuid;
begin
  if public._admin_role(p_passcode) is null then raise exception 'Access denied.'; end if;
  perform public._referral_checks(a, b);
  begin
    insert into public.referrals (referrer_id, friend_name, friend_phone, referred_id, status, joined_at)
    select a, m.name, nullif(public._last10(m.phone), ''), b, 'joined', now() from public.members m where m.member_id = b returning id into new_id;
  exception when unique_violation then raise exception 'This member is already linked to a referral.';
  end;
  return new_id;
end; $$;

create or replace function public.admin_referral_link(p_passcode text, p_referral_id uuid, p_referred_id text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.referrals; b text := upper(trim(p_referred_id));
begin
  if public._admin_role(p_passcode) is null then raise exception 'Access denied.'; end if;
  select * into r from public.referrals where id = p_referral_id for update;
  if not found or r.status <> 'invited' then raise exception 'Only an invited friend can be linked.'; end if;
  perform public._referral_checks(r.referrer_id, b);
  begin
    update public.referrals set referred_id = b, status = 'joined', joined_at = now() where id = p_referral_id;
  exception when unique_violation then raise exception 'This member is already linked to a referral.';
  end;
end; $$;

create or replace function public.admin_referral_reward(p_passcode text, p_referral_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.referrals; days int := public._reward_setting('referral_reward_days', 7); cap int := public._reward_setting('referral_monthly_cap', 5);
  today date := public._ist_today(); ra text; rb text; who text;
begin
  if public._admin_role(p_passcode) is distinct from 'owner' then raise exception 'Only the owner can give referral rewards.'; end if;
  who := public.verify_admin_access(p_passcode) ->> 'name';
  select * into r from public.referrals where id = p_referral_id for update;
  if not found or r.status <> 'joined' then raise exception 'Only a joined friend can be rewarded (and only once).'; end if;
  if (select count(*) from public.referrals where referrer_id = r.referrer_id and status = 'rewarded'
        and rewarded_at >= (date_trunc('month', today)::timestamp at time zone 'Asia/Kolkata')) >= cap then
    raise exception 'Monthly reward limit reached for this member (%).', cap; end if;
  if not exists (select 1 from public.members where member_id = r.referrer_id) or not exists (select 1 from public.members where member_id = r.referred_id) then
    raise exception 'One of the two members no longer exists.'; end if;
  update public.members m set expiry_date = greatest(case when m.expiry_date::text ~ '^\d{4}-\d{2}-\d{2}$' then m.expiry_date::text::date end, today) + days
    where m.member_id in (r.referrer_id, r.referred_id);
  update public.referrals set status = 'rewarded', rewarded_at = now(), rewarded_by = who, reward_days = days where id = p_referral_id;
  select expiry_date::text into ra from public.members where member_id = r.referrer_id;
  select expiry_date::text into rb from public.members where member_id = r.referred_id;
  return jsonb_build_object('days', days, 'referrer_expiry', ra, 'referred_expiry', rb);
end; $$;

create or replace function public.admin_referral_void(p_passcode text, p_referral_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public._admin_role(p_passcode) is distinct from 'owner' then raise exception 'Only the owner can cancel a referral.'; end if;
  update public.referrals set status = 'void' where id = p_referral_id and status in ('invited', 'joined');
  if not found then raise exception 'Nothing to cancel (already rewarded or cancelled).'; end if;
end; $$;

create or replace function public.admin_reward_set(p_passcode text, p_key text, p_value int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public._admin_role(p_passcode) is distinct from 'owner' then raise exception 'Only the owner can change reward settings.'; end if;
  if not ((p_key = 'referral_reward_days' and p_value between 1 and 30) or (p_key = 'referral_monthly_cap' and p_value between 1 and 50) or (p_key = 'streak_weekly_target' and p_value between 1 and 7)) then
    raise exception 'That setting or value is not allowed.'; end if;
  insert into public.reward_settings (key, value) values (p_key, p_value) on conflict (key) do update set value = excluded.value;
end; $$;

do $$
declare f text;
begin
  foreach f in array array[
    'member_streak(text,text)', 'member_set_leaderboard(text,text,boolean)', 'member_leaderboard(text,text)', 'member_referral_summary(text,text)',
    'member_refer_friend(text,text,text,text)', 'admin_referral_overview(text)', 'admin_referral_create(text,text,text)',
    'admin_referral_link(text,uuid,text)', 'admin_referral_reward(text,uuid)', 'admin_referral_void(text,uuid)', 'admin_reward_set(text,text,int)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;
