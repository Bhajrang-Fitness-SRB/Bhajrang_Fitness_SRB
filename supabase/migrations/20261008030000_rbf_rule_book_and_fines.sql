/*
# Gym rule book + fines

- gym_rules: the rule book. Anyone can read it (get_rule_book). Only the OWNER can
  write it (admin_save_rule_book).
- member_fines: fines / punishments charged to members. Owner or staff can issue
  (admin_issue_fine) and mark PAID (admin_resolve_fine). Only the owner can WAIVE.
  Members see only their own fines (member_list_my_fines).
*/
create table if not exists public.gym_rules (
  id uuid primary key default gen_random_uuid(),
  position int not null,
  title text not null,
  body text not null default '',
  fine_amount numeric(10,2),
  updated_at timestamptz not null default now()
);
alter table public.gym_rules enable row level security;
revoke all on table public.gym_rules from anon, authenticated;

create table if not exists public.member_fines (
  id uuid primary key default gen_random_uuid(),
  member_id text not null references public.members(member_id) on delete cascade,
  rule_title text,
  reason text not null,
  amount numeric(10,2) not null default 0 check (amount >= 0),
  punishment text,
  status text not null default 'UNPAID' check (status in ('UNPAID','PAID','WAIVED')),
  issued_by text not null,
  issued_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text
);
create index if not exists member_fines_member_idx on public.member_fines (member_id, issued_at desc);
alter table public.member_fines enable row level security;
revoke all on table public.member_fines from anon, authenticated;

create or replace function public.get_rule_book()
returns table (rule_position int, title text, body text, fine_amount numeric, updated_at timestamptz)
language sql security definer set search_path = public as $$
  select position, title, body, fine_amount, updated_at from public.gym_rules order by position;
$$;

create or replace function public.admin_save_rule_book(p_passcode text, p_rules jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare v jsonb; r jsonb; i int := 0; v_amt numeric;
begin
  v := public.verify_admin_access(p_passcode);
  if v is null or v->>'role' <> 'owner' then raise exception 'Only the owner can edit the rule book.'; end if;
  if p_rules is null or jsonb_typeof(p_rules) <> 'array' then raise exception 'Invalid rules.'; end if;
  if jsonb_array_length(p_rules) > 100 then raise exception 'Too many rules (max 100).'; end if;
  delete from public.gym_rules where true;
  for r in select * from jsonb_array_elements(p_rules) loop
    if coalesce(trim(r->>'title'),'') = '' then continue; end if;
    if length(r->>'title') > 120 or length(coalesce(r->>'body','')) > 5000 then raise exception 'Rule too long.'; end if;
    v_amt := nullif(trim(coalesce(r->>'fine_amount','')),'')::numeric;
    if v_amt is not null and (v_amt < 0 or v_amt > 100000) then raise exception 'Invalid fine amount.'; end if;
    i := i + 1;
    insert into public.gym_rules (position, title, body, fine_amount)
    values (i, trim(r->>'title'), coalesce(r->>'body',''), v_amt);
  end loop;
  return true;
end;
$$;

create or replace function public.admin_issue_fine(p_passcode text, p_member_id text, p_rule_title text, p_reason text, p_amount numeric, p_punishment text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v jsonb; v_id text := upper(trim(p_member_id)); v_new uuid;
begin
  v := public.verify_admin_access(p_passcode);
  if v is null then raise exception 'Access denied.'; end if;
  if not exists (select 1 from public.members where member_id = v_id) then raise exception 'No member with that ID.'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'A reason is required.'; end if;
  if length(p_reason) > 1000 or length(coalesce(p_punishment,'')) > 1000 then raise exception 'Text too long.'; end if;
  if p_amount is null or p_amount < 0 or p_amount > 100000 then raise exception 'Invalid amount.'; end if;
  if p_amount = 0 and coalesce(trim(p_punishment),'') = '' then raise exception 'Enter an amount or a punishment.'; end if;
  insert into public.member_fines (member_id, rule_title, reason, amount, punishment, issued_by)
  values (v_id, nullif(trim(coalesce(p_rule_title,'')),''), trim(p_reason), p_amount, nullif(trim(coalesce(p_punishment,'')),''), coalesce(v->>'name','Staff'))
  returning id into v_new;
  return v_new;
end;
$$;

create or replace function public.admin_list_fines(p_passcode text)
returns table (id uuid, member_id text, member_name text, rule_title text, reason text, amount numeric, punishment text, status text, issued_by text, issued_at timestamptz, resolved_at timestamptz, resolved_by text)
language plpgsql security definer set search_path = public as $$
begin
  if public.verify_admin_access(p_passcode) is null then raise exception 'Access denied.'; end if;
  return query
    select f.id, f.member_id, m.name, f.rule_title, f.reason, f.amount, f.punishment, f.status, f.issued_by, f.issued_at, f.resolved_at, f.resolved_by
    from public.member_fines f join public.members m on m.member_id = f.member_id
    order by (f.status = 'UNPAID') desc, f.issued_at desc limit 500;
end;
$$;

create or replace function public.admin_resolve_fine(p_passcode text, p_fine_id uuid, p_action text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  v := public.verify_admin_access(p_passcode);
  if v is null then raise exception 'Access denied.'; end if;
  if p_action not in ('PAID','WAIVED') then raise exception 'Invalid action.'; end if;
  if p_action = 'WAIVED' and v->>'role' <> 'owner' then raise exception 'Only the owner can waive a fine.'; end if;
  update public.member_fines set status = p_action, resolved_at = now(), resolved_by = coalesce(v->>'name','Staff')
    where id = p_fine_id and status = 'UNPAID';
  if not found then raise exception 'Fine not found or already settled.'; end if;
  return true;
end;
$$;

create or replace function public.member_list_my_fines(p_member_id text, p_passcode text)
returns table (id uuid, rule_title text, reason text, amount numeric, punishment text, status text, issued_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public._member_pass_ok(p_member_id, p_passcode) then raise exception 'Access denied.'; end if;
  return query
    select f.id, f.rule_title, f.reason, f.amount, f.punishment, f.status, f.issued_at
    from public.member_fines f where f.member_id = upper(trim(p_member_id)) order by f.issued_at desc limit 50;
end;
$$;

grant execute on function public.get_rule_book() to anon, authenticated;
grant execute on function public.admin_save_rule_book(text, jsonb) to anon, authenticated;
grant execute on function public.admin_issue_fine(text, text, text, text, numeric, text) to anon, authenticated;
grant execute on function public.admin_list_fines(text) to anon, authenticated;
grant execute on function public.admin_resolve_fine(text, uuid, text) to anon, authenticated;
grant execute on function public.member_list_my_fines(text, text) to anon, authenticated;
