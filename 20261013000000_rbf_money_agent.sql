/*
# Money Agent — one place for every rupee in and out

- expenses: category, payment mode (Cash / UPI / Card / Bank), note.
- money_entries: BharatPe QR / cash / other income and outflows entered by hand or imported from a BharatPe export.
- cash_counts: daily cash count vs what the books say should be in the drawer.
- money_reports: nightly AI analysis (profit, savings, risks, forecast).
- All access through passcode-checked functions; analytics are owner-only.
*/

alter table public.expenses add column if not exists category text;
alter table public.expenses add column if not exists payment_mode text default 'Cash';
alter table public.expenses add column if not exists note text;
alter table public.expenses add column if not exists created_by text;
alter table public.expenses alter column expense_date set default public._today_ist();

create table if not exists public.money_entries (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  entry_date date not null default public._today_ist(),
  direction text not null check (direction in ('IN','OUT')),
  channel text not null,
  category text,
  amount integer not null check (amount > 0),
  note text,
  member_id text,
  source text not null default 'manual',
  external_ref text,
  created_by text
);
create unique index if not exists money_entries_external_ref_uq on public.money_entries (external_ref) where external_ref is not null;
create index if not exists money_entries_date_idx on public.money_entries (entry_date desc);
alter table public.money_entries enable row level security;
revoke all on table public.money_entries from anon, authenticated;

create table if not exists public.cash_counts (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  count_date date not null unique,
  expected integer not null,
  counted integer not null,
  variance integer not null,
  note text,
  created_by text
);
alter table public.cash_counts enable row level security;
revoke all on table public.cash_counts from anon, authenticated;

create table if not exists public.money_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  trigger text not null default 'cron',
  engine text,
  status text not null default 'ok',
  summary text,
  score integer,
  insights jsonb not null default '[]'::jsonb,
  forecast jsonb,
  quality jsonb not null default '[]'::jsonb,
  metrics jsonb,
  error text
);
alter table public.money_reports enable row level security;
revoke all on table public.money_reports from anon, authenticated;

create or replace function public._norm_method(p text) returns text language sql immutable as $$
  select case
    when lower(coalesce(p,'')) like '%cash%' then 'Cash'
    when lower(coalesce(p,'')) ~ '(upi|qr|bharat|phonepe|gpay|google|paytm)' then 'UPI'
    when lower(coalesce(p,'')) like '%card%' then 'Card'
    when lower(coalesce(p,'')) ~ '(bank|neft|imps|rtgs|cheque)' then 'Bank'
    else 'Other' end
$$;

create or replace function public._is_owner(p_passcode text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((public.verify_admin_access(p_passcode))->>'role' = 'owner', false)
$$;
revoke all on function public._is_owner(text) from public, anon, authenticated;

create or replace function public._cash_balance(p_upto date) returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select sum(paid) from public.billing where public._norm_method(payment_method) = 'Cash' and payment_date <= p_upto), 0)
       + coalesce((select sum(amount) from public.money_entries where direction = 'IN' and public._norm_method(channel) = 'Cash' and entry_date <= p_upto), 0)
       - coalesce((select sum(amount) from public.expenses where public._norm_method(payment_mode) = 'Cash' and coalesce(expense_date, created_at::date) <= p_upto), 0)
       - coalesce((select sum(amount) from public.money_entries where direction = 'OUT' and public._norm_method(channel) = 'Cash' and entry_date <= p_upto), 0)
$$;
revoke all on function public._cash_balance(date) from public, anon, authenticated;

-- ---------- entry points (staff or owner) ----------
create or replace function public.admin_add_expense(p_passcode text, p_name text, p_amount integer, p_date date default null,
  p_category text default null, p_payment_mode text default 'Cash', p_note text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare v jsonb := public.verify_admin_access(p_passcode); v_id int;
begin
  if v is null then raise exception 'Access denied.'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Enter an amount greater than 0.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Describe the expense.'; end if;
  insert into public.expenses (expense_name, amount, expense_date, category, payment_mode, note, created_by)
  values (left(trim(p_name), 120), p_amount, coalesce(p_date, public._today_ist()), nullif(left(trim(coalesce(p_category,'')), 60), ''),
          public._norm_method(p_payment_mode), left(p_note, 300), v->>'name')
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.admin_list_expenses(p_passcode text)
returns setof public.expenses language plpgsql security definer set search_path = public as $$
begin
  if public.verify_admin_access(p_passcode) is null then raise exception 'Access denied.'; end if;
  return query select * from public.expenses order by coalesce(expense_date, created_at::date) desc, id desc limit 1000;
end;
$$;

create or replace function public.admin_delete_expense(p_passcode text, p_id integer)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public._is_owner(p_passcode) then raise exception 'Only the owner can delete entries.'; end if;
  delete from public.expenses where id = p_id; return found;
end;
$$;

create or replace function public.admin_add_money_entry(p_passcode text, p_date date, p_direction text, p_channel text,
  p_category text, p_amount integer, p_note text default null, p_member_id text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v jsonb := public.verify_admin_access(p_passcode); v_id bigint;
begin
  if v is null then raise exception 'Access denied.'; end if;
  if p_direction not in ('IN','OUT') then raise exception 'Choose money in or money out.'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Enter an amount greater than 0.'; end if;
  insert into public.money_entries (entry_date, direction, channel, category, amount, note, member_id, created_by)
  values (coalesce(p_date, public._today_ist()), p_direction, left(coalesce(nullif(trim(p_channel),''),'Cash'), 40),
          left(p_category, 60), p_amount, left(p_note, 300), nullif(upper(trim(coalesce(p_member_id,''))), ''), v->>'name')
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.admin_import_money_entries(p_passcode text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; ins int := 0; skip int := 0; n int;
begin
  if not public._is_owner(p_passcode) then raise exception 'Only the owner can import statements.'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'No rows to import.'; end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'Too many rows (max 5000 per import).'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      insert into public.money_entries (entry_date, direction, channel, category, amount, note, source, external_ref, created_by)
      values ((r->>'date')::date, 'IN', 'BharatPe QR', 'QR collection', (r->>'amount')::int, left(r->>'note', 200), 'bharatpe_import',
              'bp:' || left(r->>'ref', 80), 'import')
      on conflict do nothing;
      get diagnostics n = row_count;
      if n = 1 then ins := ins + 1; else skip := skip + 1; end if;
    exception when others then skip := skip + 1;
    end;
  end loop;
  return jsonb_build_object('inserted', ins, 'skipped', skip);
end;
$$;

create or replace function public.admin_list_money_entries(p_passcode text, p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public._is_owner(p_passcode) then raise exception 'Only the owner can do this.'; end if;
  return coalesce((select jsonb_agg(to_jsonb(e) order by e.entry_date desc, e.id desc) from (
    select id, entry_date, direction, channel, category, amount, note, source from public.money_entries
    where entry_date between coalesce(p_from, date '2000-01-01') and coalesce(p_to, date '2100-01-01')
    order by entry_date desc, id desc limit 300) e), '[]'::jsonb);
end;
$$;

create or replace function public.admin_delete_money_entry(p_passcode text, p_id bigint)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public._is_owner(p_passcode) then raise exception 'Only the owner can delete entries.'; end if;
  delete from public.money_entries where id = p_id; return found;
end;
$$;

create or replace function public.admin_save_cash_count(p_passcode text, p_date date, p_counted integer, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb := public.verify_admin_access(p_passcode); v_d date := coalesce(p_date, public._today_ist()); v_exp int;
begin
  if v is null then raise exception 'Access denied.'; end if;
  if p_counted is null or p_counted < 0 then raise exception 'Enter the cash you counted.'; end if;
  v_exp := round(public._cash_balance(v_d));
  insert into public.cash_counts (count_date, expected, counted, variance, note, created_by)
  values (v_d, v_exp, p_counted, p_counted - v_exp, left(p_note, 200), v->>'name')
  on conflict (count_date) do update set expected = excluded.expected, counted = excluded.counted, variance = excluded.variance,
    note = excluded.note, created_by = excluded.created_by;
  return jsonb_build_object('expected', v_exp, 'counted', p_counted, 'variance', p_counted - v_exp);
end;
$$;

create or replace function public.admin_set_invoice_method(p_passcode text, p_billing_id integer, p_method text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if public.verify_admin_access(p_passcode) is null then raise exception 'Access denied.'; end if;
  update public.billing set payment_method = case public._norm_method(p_method) when 'UPI' then 'UPI' when 'Cash' then 'Cash' when 'Card' then 'Card' when 'Bank' then 'Bank Transfer' else 'Other' end
  where id = p_billing_id;
  return found;
end;
$$;

-- ---------- analytics ----------
create or replace function public._money_overview(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  today date := public._today_ist();
  inc_by jsonb; exp_cat jsonb; exp_mode jsonb; monthly jsonb; weekday jsonb; pkgmix jsonb; counts jsonb;
  bill_total numeric; manual_total numeric; exp_total numeric; recv numeric; bill_upi numeric; manual_upi numeric; unlinked numeric;
  billed numeric; collected numeric; renew30 numeric; avgprice numeric;
begin
  select coalesce(sum(paid), 0) into bill_total from public.billing where payment_date between p_from and p_to;
  select coalesce(sum(amount), 0) into manual_total from public.money_entries where direction = 'IN' and source = 'manual' and entry_date between p_from and p_to;

  select coalesce(jsonb_object_agg(m, s), '{}'::jsonb) into inc_by from (
    select m, sum(s) s from (
      select public._norm_method(payment_method) m, sum(paid) s from public.billing where payment_date between p_from and p_to group by 1
      union all
      select public._norm_method(channel), sum(amount) from public.money_entries where direction = 'IN' and source = 'manual' and entry_date between p_from and p_to group by 1
    ) x group by m) y;

  select coalesce(sum(paid), 0) into bill_upi from public.billing where public._norm_method(payment_method) = 'UPI' and payment_date between p_from and p_to;
  select coalesce(sum(amount), 0) into manual_upi from public.money_entries where direction = 'IN' and source = 'manual' and public._norm_method(channel) = 'UPI' and entry_date between p_from and p_to;
  select coalesce(sum(amount), 0) into recv from public.money_entries where source = 'bharatpe_import' and entry_date between p_from and p_to;
  unlinked := case when recv > 0 then greatest(recv - bill_upi - manual_upi, 0) else 0 end;

  select coalesce(sum(a), 0) into exp_total from (
    select amount a from public.expenses where coalesce(expense_date, created_at::date) between p_from and p_to
    union all
    select amount from public.money_entries where direction = 'OUT' and entry_date between p_from and p_to and coalesce(category, '') !~* '^(deposit|transfer)'
  ) t;

  select coalesce(jsonb_object_agg(c, s), '{}'::jsonb) into exp_cat from (
    select c, sum(a) s from (
      select coalesce(nullif(category, ''), 'Uncategorised') c, amount a from public.expenses where coalesce(expense_date, created_at::date) between p_from and p_to
      union all
      select coalesce(nullif(category, ''), 'Other outflow'), amount from public.money_entries where direction = 'OUT' and entry_date between p_from and p_to and coalesce(category, '') !~* '^(deposit|transfer)'
    ) x group by c) y;

  select coalesce(jsonb_object_agg(m, s), '{}'::jsonb) into exp_mode from (
    select public._norm_method(payment_mode) m, sum(amount) s from public.expenses where coalesce(expense_date, created_at::date) between p_from and p_to group by 1) y;

  select coalesce(sum(greatest(coalesce(amount, 0) - coalesce(discount, 0), 0)), 0), coalesce(sum(paid), 0) into billed, collected
    from public.billing where payment_date between p_from and p_to;

  select coalesce(jsonb_agg(jsonb_build_object('month', to_char(mth, 'YYYY-MM'),
      'income', (select coalesce(sum(paid), 0) from public.billing where date_trunc('month', payment_date) = mth)
              + (select coalesce(sum(amount), 0) from public.money_entries where direction = 'IN' and source = 'manual' and date_trunc('month', entry_date) = mth),
      'expenses', (select coalesce(sum(amount), 0) from public.expenses where date_trunc('month', coalesce(expense_date, created_at::date)) = mth)
              + (select coalesce(sum(amount), 0) from public.money_entries where direction = 'OUT' and date_trunc('month', entry_date) = mth and coalesce(category, '') !~* '^(deposit|transfer)')
    ) order by mth), '[]'::jsonb) into monthly
  from generate_series(date_trunc('month', today) - interval '5 months', date_trunc('month', today), interval '1 month') mth;

  select coalesce(jsonb_object_agg(d, s), '{}'::jsonb) into weekday from (
    select to_char(payment_date, 'Dy') d, sum(paid) s from public.billing where payment_date >= today - 90 group by 1) y;

  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into pkgmix from (
    select btrim(package_name) as package, count(*) as invoices, sum(paid) as revenue from public.billing
    where expiry_date is not null and payment_date between p_from and p_to group by 1 order by sum(paid) desc limit 6) t;

  select coalesce(jsonb_agg(to_jsonb(c) order by c.count_date desc), '[]'::jsonb) into counts from (
    select count_date, expected, counted, variance from public.cash_counts order by count_date desc limit 10) c;

  select coalesce(avg(price), 0) into avgprice from public.packages;
  select coalesce(sum(coalesce(p.price, avgprice)), 0) into renew30 from public.members m
    left join public.packages p on lower(btrim(p.name)) = lower(btrim(m.package))
    where m.expiry_date ~ '^\d{4}-\d{2}-\d{2}$' and m.expiry_date::date between today and today + 30;

  return jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to, 'days', (p_to - p_from) + 1),
    'income', jsonb_build_object('total', bill_total + manual_total + unlinked, 'from_invoices', bill_total, 'manual_entries', manual_total,
        'unlinked_qr_receipts', unlinked, 'by_method', inc_by),
    'expenses', jsonb_build_object('total', exp_total, 'by_category', exp_cat, 'by_payment_mode', exp_mode),
    'net_profit', bill_total + manual_total + unlinked - exp_total,
    'margin_pct', case when bill_total + manual_total + unlinked > 0 then round(((bill_total + manual_total + unlinked - exp_total) / (bill_total + manual_total + unlinked)) * 100, 1) else null end,
    'dues', jsonb_build_object('outstanding_total', (select coalesce(sum(due), 0) from public.billing where coalesce(due, 0) > 0),
        'invoices_with_due', (select count(*) from public.billing where coalesce(due, 0) > 0),
        'collection_rate_pct', case when billed > 0 then round(collected / billed * 100, 1) else null end),
    'cash', jsonb_build_object('balance_now', round(public._cash_balance(today)), 'recent_counts', counts),
    'qr_reconciliation', jsonb_build_object('bharatpe_receipts_imported', recv, 'invoices_paid_by_upi', bill_upi, 'manual_upi_entries', manual_upi,
        'qr_money_without_invoice', unlinked, 'imported', recv > 0),
    'monthly_trend', monthly,
    'income_by_weekday_last_90d', weekday,
    'members', jsonb_build_object(
        'active', (select count(*) from public.members where expiry_date ~ '^\d{4}-\d{2}-\d{2}$' and expiry_date::date >= today),
        'expiring_next_7d', (select count(*) from public.members where expiry_date ~ '^\d{4}-\d{2}-\d{2}$' and expiry_date::date between today and today + 7),
        'expiring_next_30d', (select count(*) from public.members where expiry_date ~ '^\d{4}-\d{2}-\d{2}$' and expiry_date::date between today and today + 30),
        'lapsed_last_30d', (select count(*) from public.members where expiry_date ~ '^\d{4}-\d{2}-\d{2}$' and expiry_date::date between today - 30 and today - 1),
        'new_in_period', (select count(*) from public.members where joining_date ~ '^\d{4}-\d{2}-\d{2}$' and joining_date::date between p_from and p_to),
        'expected_renewal_income_next_30d', round(renew30)),
    'package_mix', pkgmix,
    'data_quality', jsonb_build_object(
        'invoices_in_period', (select count(*) from public.billing where payment_date between p_from and p_to),
        'invoices_marked_upi_all_time', (select count(*) from public.billing where public._norm_method(payment_method) = 'UPI'),
        'invoices_marked_cash_all_time', (select count(*) from public.billing where public._norm_method(payment_method) = 'Cash'),
        'paid_invoices_not_applied_to_membership', (select count(*) from public.billing where expiry_date is null and coalesce(paid, 0) > 0),
        'expense_rows_in_period', (select count(*) from public.expenses where coalesce(expense_date, created_at::date) between p_from and p_to),
        'expenses_without_category', (select count(*) from public.expenses where coalesce(category, '') = ''),
        'days_since_last_cash_count', (select today - max(count_date) from public.cash_counts))
  );
end;
$$;
revoke all on function public._money_overview(date, date) from public, anon, authenticated;

create or replace function public.admin_money_overview(p_passcode text, p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public._is_owner(p_passcode) then raise exception 'Only the owner can do this.'; end if;
  return public._money_overview(coalesce(p_from, date_trunc('month', public._today_ist())::date), coalesce(p_to, public._today_ist()));
end;
$$;

create or replace function public.agent_money_overview(p_days integer default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t date := public._today_ist(); d int := greatest(least(coalesce(p_days, 30), 365), 7);
begin
  return jsonb_build_object('current', public._money_overview(t - d + 1, t), 'previous', public._money_overview(t - 2 * d + 1, t - d));
end;
$$;

create or replace function public.agent_save_money_report(p_trigger text, p_engine text, p_status text, p_summary text, p_score integer,
  p_insights jsonb, p_forecast jsonb, p_quality jsonb, p_metrics jsonb, p_error text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.money_reports (trigger, engine, status, summary, score, insights, forecast, quality, metrics, error)
  values (coalesce(p_trigger, 'cron'), p_engine, coalesce(p_status, 'ok'), left(p_summary, 2000), p_score,
          coalesce(p_insights, '[]'::jsonb), p_forecast, coalesce(p_quality, '[]'::jsonb), p_metrics, left(p_error, 800))
  returning id into v_id;
  delete from public.money_reports where created_at < now() - interval '180 days';
  return v_id;
end;
$$;

create or replace function public.admin_money_reports(p_passcode text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public._is_owner(p_passcode) then raise exception 'Only the owner can do this.'; end if;
  return jsonb_build_object(
    'latest', (select to_jsonb(r) from (select id, created_at, trigger, engine, status, summary, score, insights, forecast, quality, error from public.money_reports order by created_at desc limit 1) r),
    'history', coalesce((select jsonb_agg(jsonb_build_object('created_at', created_at, 'score', score, 'status', status) order by created_at desc)
        from (select created_at, score, status from public.money_reports order by created_at desc limit 14) h), '[]'::jsonb));
end;
$$;

revoke all on function public.agent_money_overview(integer) from public, anon, authenticated;
revoke all on function public.agent_save_money_report(text, text, text, text, integer, jsonb, jsonb, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.agent_money_overview(integer) to service_role;
grant execute on function public.agent_save_money_report(text, text, text, text, integer, jsonb, jsonb, jsonb, jsonb, text) to service_role;
grant execute on function public.admin_add_expense(text, text, integer, date, text, text, text) to anon, authenticated;
grant execute on function public.admin_list_expenses(text) to anon, authenticated;
grant execute on function public.admin_delete_expense(text, integer) to anon, authenticated;
grant execute on function public.admin_add_money_entry(text, date, text, text, text, integer, text, text) to anon, authenticated;
grant execute on function public.admin_import_money_entries(text, jsonb) to anon, authenticated;
grant execute on function public.admin_list_money_entries(text, date, date) to anon, authenticated;
grant execute on function public.admin_delete_money_entry(text, bigint) to anon, authenticated;
grant execute on function public.admin_save_cash_count(text, date, integer, text) to anon, authenticated;
grant execute on function public.admin_set_invoice_method(text, integer, text) to anon, authenticated;
grant execute on function public.admin_money_overview(text, date, date) to anon, authenticated;
grant execute on function public.admin_money_reports(text) to anon, authenticated;
