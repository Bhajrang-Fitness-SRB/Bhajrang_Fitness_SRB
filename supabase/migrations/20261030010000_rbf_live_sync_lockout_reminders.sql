-- Changes that were made directly on the live database and are now written down here.
-- (index fixes, admin login lock-out after 10 wrong tries, due-reminder history and screens)

-- 1) Indexes on foreign keys
create index if not exists agent_hub_agents_preferred_provider_idx on public.agent_hub_agents (preferred_provider);
create index if not exists agent_hub_conversations_agent_key_idx on public.agent_hub_conversations (agent_key);
create index if not exists agent_hub_proposals_conversation_id_idx on public.agent_hub_proposals (conversation_id);
create index if not exists agent_suggestions_run_id_idx on public.agent_suggestions (run_id);
create index if not exists workout_assignments_plan_id_idx on public.workout_assignments (plan_id);
create index if not exists billing_open_due_idx on public.billing (member_id) where due > 0;

-- 2) Admin login lock-out: 10 wrong passcodes = 15 minutes locked
create table if not exists public.admin_login_guard (
  id boolean primary key default true check (id),
  fail_count integer not null default 0,
  locked_until timestamptz
);
insert into public.admin_login_guard (id) values (true) on conflict (id) do nothing;
alter table public.admin_login_guard enable row level security;

create or replace function public.verify_admin_access(p_passcode text)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_staff record; v_locked timestamptz;
begin
  if p_passcode is null or trim(p_passcode) = '' then return null; end if;
  select locked_until into v_locked from public.admin_login_guard where id = true for update;
  if v_locked is not null and v_locked > now() then return null; end if;
  if v_locked is not null then update public.admin_login_guard set fail_count = 0, locked_until = null where id = true; end if;
  select * into v_staff from public.staff where passcode = trim(p_passcode) and active = true limit 1;
  if found then
    update public.admin_login_guard set fail_count = 0, locked_until = null where id = true;
    return jsonb_build_object('role', 'staff', 'name', v_staff.name, 'staff_role', v_staff.role);
  end if;
  if public.verify_owner_passcode(p_passcode) then
    update public.admin_login_guard set fail_count = 0, locked_until = null where id = true;
    return jsonb_build_object('role', 'owner', 'name', 'Owner');
  end if;
  update public.admin_login_guard
    set fail_count = fail_count + 1,
        locked_until = case when fail_count + 1 >= 10 then now() + interval '15 minutes' else null end
    where id = true;
  return null;
end;
$function$;

-- 3) Due-reminder history
create table if not exists public.reminder_log (
  id bigint generated always as identity primary key,
  member_id varchar not null references public.members(member_id) on delete cascade,
  billing_id integer references public.billing(id) on delete set null,
  channel text not null check (channel in ('push','sms','whatsapp','email')),
  status text not null default 'queued' check (status in ('queued','sent','failed')),
  error text, sent_by text,
  created_at timestamptz not null default now()
);
create index if not exists reminder_log_member_id_idx on public.reminder_log (member_id);
create index if not exists reminder_log_billing_id_idx on public.reminder_log (billing_id);
alter table public.reminder_log enable row level security;

create or replace function public.admin_dues_for_reminders(p_passcode text)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v jsonb := public.verify_admin_access(p_passcode);
begin
  if v is null then raise exception 'Access denied.'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.due desc)
    from (
      select b.id as billing_id, b.member_id, m.name, m.phone, m.whatsapp, b.package_name, b.due, b.expiry_date,
             (select max(r.created_at) from public.reminder_log r where r.billing_id = b.id and r.status = 'sent') as last_reminder_at
      from public.billing b join public.members m on m.member_id = b.member_id
      where b.due > 0
    ) x), '[]'::jsonb);
end;
$function$;

create or replace function public.admin_log_reminder(p_passcode text, p_member_id text, p_billing_id integer, p_channel text, p_status text default 'sent', p_error text default null)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v jsonb := public.verify_admin_access(p_passcode); v_id bigint;
begin
  if v is null then raise exception 'Access denied.'; end if;
  if p_channel not in ('push','sms','whatsapp','email') then raise exception 'Channel must be push, sms, whatsapp or email.'; end if;
  if p_status not in ('queued','sent','failed') then raise exception 'Invalid status.'; end if;
  if not exists (select 1 from public.members where member_id = p_member_id) then raise exception 'Member not found.'; end if;
  insert into public.reminder_log (member_id, billing_id, channel, status, error, sent_by)
  values (p_member_id, p_billing_id, p_channel, p_status, left(p_error, 300), v->>'name') returning id into v_id;
  return jsonb_build_object('id', v_id);
end;
$function$;

create or replace function public.admin_list_reminders(p_passcode text, p_member_id text default null, p_limit integer default 50)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v jsonb := public.verify_admin_access(p_passcode);
begin
  if v is null then raise exception 'Access denied.'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(x))
    from (select r.id, r.member_id, r.billing_id, r.channel, r.status, r.error, r.sent_by, r.created_at
          from public.reminder_log r where p_member_id is null or r.member_id = p_member_id
          order by r.created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) x), '[]'::jsonb);
end;
$function$;

grant execute on function public.admin_dues_for_reminders(text) to anon, authenticated;
grant execute on function public.admin_log_reminder(text, text, integer, text, text, text) to anon, authenticated;
grant execute on function public.admin_list_reminders(text, text, integer) to anon, authenticated;
