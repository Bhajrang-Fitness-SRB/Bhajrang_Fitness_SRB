/*
# Retention Desk: renewal money dashboard + churn ("we miss you") list
Staff/owner only (checked with verify_admin_access). Read-only except a small "who did we already message" log.
* admin_retention_overview(passcode, churn_days)  -> one JSON: expected renewal income, who expires, who stopped coming
* admin_retention_log_contact(passcode, member, kind) -> remembers that someone was messaged (no message is sent here)
Messages are opened as WhatsApp links by the app; nothing is sent automatically. Safe to run twice.
*/
create table if not exists public.retention_contacts (
  id bigserial primary key,
  member_id text not null,
  kind text not null check (kind in ('renewal', 'churn', 'winback')),
  created_at timestamptz not null default now()
);
create index if not exists retention_contacts_member_idx on public.retention_contacts (member_id, created_at desc);
alter table public.retention_contacts enable row level security;
revoke all on table public.retention_contacts from anon, authenticated;
revoke all on sequence public.retention_contacts_id_seq from anon, authenticated;

-- fast "last visit per member" lookups
create index if not exists attendance_logs_member_time_idx on public.attendance_logs (member_id, punch_in_time desc);

create or replace function public.admin_retention_overview(p_passcode text, p_churn_days int default 7)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  churn int := greatest(3, least(coalesce(p_churn_days, 7), 60));
  result jsonb;
begin
  if public.verify_admin_access(p_passcode) is null then raise exception 'Access denied.'; end if;

  with base as (
    select m.member_id, m.name, coalesce(nullif(trim(m.whatsapp), ''), nullif(trim(m.phone), '')) as contact, m.package,
           case when m.expiry_date::text ~ '^\d{4}-\d{2}-\d{2}$' then m.expiry_date::text::date end as exp,
           case when m.joining_date::text ~ '^\d{4}-\d{2}-\d{2}' then left(m.joining_date::text, 10)::date end as joined
    from public.members m
  ), enriched as (
    select b.*, pr.price,
           v.last_visit, coalesce(v.visits_30d, 0) as visits_30d,
           c.last_renewal_contact, c.last_churn_contact
    from base b
    left join lateral (select p.price from public.packages p where lower(trim(p.name)) = lower(trim(b.package)) limit 1) pr on true
    left join lateral (select max(a.punch_in_time) as last_visit,
                              count(*) filter (where a.punch_in_time > now() - interval '30 days') as visits_30d
                       from public.attendance_logs a where a.member_id = b.member_id) v on true
    left join lateral (select max(rc.created_at) filter (where rc.kind in ('renewal', 'winback')) as last_renewal_contact,
                              max(rc.created_at) filter (where rc.kind = 'churn') as last_churn_contact
                       from public.retention_contacts rc where rc.member_id = b.member_id) c on true
  ), ren as (
    select e.*, (e.exp - today) as days_left from enriched e
    where e.exp is not null and e.exp between today - 30 and today + 30
  ), chu as (
    select e.*, case when e.last_visit is not null then today - (e.last_visit at time zone 'Asia/Kolkata')::date else today - e.joined end as days_away
    from enriched e
    where e.exp is not null and e.exp >= today
      and ((e.last_visit is not null and e.last_visit < now() - make_interval(days => churn))
        or (e.last_visit is null and e.joined is not null and e.joined <= today - churn))
  )
  select jsonb_build_object(
    'today', today,
    'churn_days', churn,
    'totals', jsonb_build_object(
      'expected_7d',  coalesce((select sum(price) from ren where days_left between 0 and 7), 0),
      'expected_14d', coalesce((select sum(price) from ren where days_left between 0 and 14), 0),
      'expected_30d', coalesce((select sum(price) from ren where days_left between 0 and 30), 0),
      'count_7d',  (select count(*) from ren where days_left between 0 and 7),
      'count_14d', (select count(*) from ren where days_left between 0 and 14),
      'count_30d', (select count(*) from ren where days_left between 0 and 30),
      'expired_30d', (select count(*) from ren where days_left < 0),
      'expired_value_30d', coalesce((select sum(price) from ren where days_left < 0), 0),
      'unpriced', (select count(*) from ren where days_left between 0 and 30 and price is null),
      'churn_count', (select count(*) from chu),
      'churn_at_risk_30d', coalesce((select sum(price) from chu where exp <= today + 30), 0)),
    'renewals', coalesce((select jsonb_agg(jsonb_build_object(
        'member_id', member_id, 'name', name, 'phone', contact, 'package', package, 'expiry_date', exp, 'days_left', days_left,
        'price', price, 'last_visit', last_visit, 'visits_30d', visits_30d, 'last_contact', last_renewal_contact) order by days_left, name)
      from (select * from ren order by days_left, name limit 300) r), '[]'::jsonb),
    'churn', coalesce((select jsonb_agg(jsonb_build_object(
        'member_id', member_id, 'name', name, 'phone', contact, 'package', package, 'expiry_date', exp, 'days_left', (exp - today),
        'price', price, 'last_visit', last_visit, 'days_away', days_away, 'never_visited', last_visit is null, 'last_contact', last_churn_contact) order by exp, name)
      from (select * from chu order by exp, name limit 300) k), '[]'::jsonb)
  ) into result;
  return result;
end; $$;

create or replace function public.admin_retention_log_contact(p_passcode text, p_member_id text, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.verify_admin_access(p_passcode) is null then raise exception 'Access denied.'; end if;
  if p_kind not in ('renewal', 'churn', 'winback') then raise exception 'Unknown kind.'; end if;
  if not exists (select 1 from public.members where member_id = upper(trim(p_member_id))) then raise exception 'Unknown member.'; end if;
  insert into public.retention_contacts (member_id, kind) values (upper(trim(p_member_id)), p_kind);
end; $$;

revoke all on function public.admin_retention_overview(text, int) from public;
revoke all on function public.admin_retention_log_contact(text, text, text) from public;
grant execute on function public.admin_retention_overview(text, int) to anon, authenticated;
grant execute on function public.admin_retention_log_contact(text, text, text) to anon, authenticated;
