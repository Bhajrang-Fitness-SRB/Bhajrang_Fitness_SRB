/*
# AI Night Agent

A nightly job (pg_cron -> edge function `nightly-agent`) collects ANONYMOUS health
counters (no names, phones or photos), asks Claude to analyse them, auto-applies
only a short WHITELIST of safe clean-up fixes, and files improvement ideas as
suggestions. The owner approves or declines suggestions in the Villain panel
(AI Night Agent tab). Nothing is changed in the app's code without approval.

API key + workspace id are kept in Supabase Vault, never in the browser.
*/

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

create table if not exists public.app_error_log (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  source text not null,
  message text not null,
  context text
);
create index if not exists app_error_log_created_idx on public.app_error_log (created_at desc);
alter table public.app_error_log enable row level security;
revoke all on table public.app_error_log from anon, authenticated;

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  trigger text not null default 'cron',
  status text not null default 'ok',
  summary text,
  health jsonb,
  findings jsonb not null default '[]'::jsonb,
  fixes_applied jsonb not null default '[]'::jsonb,
  error text
);
alter table public.agent_runs enable row level security;
revoke all on table public.agent_runs from anon, authenticated;

create table if not exists public.agent_suggestions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.agent_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  kind text not null default 'improvement' check (kind in ('bug','improvement','security')),
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  title text not null,
  detail text not null default '',
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','DECLINED','DONE')),
  decided_at timestamptz
);
alter table public.agent_suggestions enable row level security;
revoke all on table public.agent_suggestions from anon, authenticated;

-- Browser error reports (rate limited, truncated).
create or replace function public.log_client_error(p_source text, p_message text, p_context text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_message),'') = '' then return; end if;
  if (select count(*) from public.app_error_log where created_at > now() - interval '1 hour') >= 200 then return; end if;
  insert into public.app_error_log (source, message, context)
  values (left(coalesce(p_source,'web'),40), left(p_message,400), left(p_context,300));
end;
$$;
grant execute on function public.log_client_error(text, text, text) to anon, authenticated;

-- Anonymous health counters for the agent. Service role only.
create or replace function public.agent_collect_health()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  select jsonb_build_object(
    'generated_at', now(),
    'members_total', (select count(*) from public.members),
    'members_expired_over_30d', (select count(*) from public.members where expiry_date ~ '^\d{4}-\d{2}-\d{2}$' and expiry_date::date < current_date - 30),
    'members_expiring_next_7d', (select count(*) from public.members where expiry_date ~ '^\d{4}-\d{2}-\d{2}$' and expiry_date::date between current_date and current_date + 7),
    'members_without_passcode', (select count(*) from public.members m where not exists (select 1 from public.ghost_vault g where g.member_id = m.member_id)),
    'members_missing_phone', (select count(*) from public.members where coalesce(trim(phone),'') = ''),
    'members_missing_selfie', (select count(*) from public.members where coalesce(trim(profile_pic),'') = ''),
    'duplicate_phone_groups', (select count(*) from (select phone from public.members where coalesce(trim(phone),'') <> '' group by phone having count(*) > 1) d),
    'pending_approvals_total', (select count(*) from public.pending_approvals where status ilike 'pending%'),
    'pending_approvals_older_3d', (select count(*) from public.pending_approvals where status ilike 'pending%' and created_at < now() - interval '3 days'),
    'profile_change_requests_pending', (select count(*) from public.profile_change_requests where status = 'PENDING'),
    'profile_change_requests_older_7d', (select count(*) from public.profile_change_requests where status = 'PENDING' and requested_at < now() - interval '7 days'),
    'face_requests_pending', (select count(*) from public.face_scan_requests where status = 'PENDING'),
    'face_requests_older_30d', (select count(*) from public.face_scan_requests where status = 'PENDING' and requested_at < now() - interval '30 days'),
    'faces_enrolled', (select count(*) from public.member_face_descriptors),
    'orphan_face_descriptors', (select count(*) from public.member_face_descriptors f where not exists (select 1 from public.members m where m.member_id = f.member_id)),
    'kiosk_devices_total', (select count(*) from public.kiosk_devices),
    'kiosk_unapproved_older_14d', (select count(*) from public.kiosk_devices where not approved and created_at < now() - interval '14 days'),
    'kiosk_approved_not_seen_7d', (select count(*) from public.kiosk_devices where approved and (last_seen is null or last_seen < now() - interval '7 days')),
    'attendance_last_24h', (select count(*) from public.attendance_logs where punch_in_time > now() - interval '24 hours'),
    'attendance_open_over_16h', (select count(*) from public.attendance_logs where punch_out_time is null and punch_in_time < now() - interval '16 hours'),
    'billing_rows_with_due', (select count(*) from public.billing where coalesce("due",0) > 0),
    'billing_total_due', (select coalesce(sum("due"),0) from public.billing where coalesce("due",0) > 0),
    'billing_negative_values', (select count(*) from public.billing where coalesce("due",0) < 0 or coalesce(paid,0) < 0 or coalesce(amount,0) < 0),
    'fines_unpaid_count', (select count(*) from public.member_fines where status = 'UNPAID'),
    'fines_unpaid_older_30d', (select count(*) from public.member_fines where status = 'UNPAID' and issued_at < now() - interval '30 days'),
    'rule_book_rules', (select count(*) from public.gym_rules),
    'staff_active', (select count(*) from public.staff where active = true),
    'owner_lock_active', (select coalesce(locked_until > now(), false) from public.owner_login_guard where id = true),
    'owner_failed_attempts', (select fail_count from public.owner_login_guard where id = true),
    'client_errors_24h', (select count(*) from public.app_error_log where created_at > now() - interval '24 hours'),
    'top_client_errors_24h', coalesce((select jsonb_agg(jsonb_build_object('message', message, 'count', c)) from (
        select message, count(*) c from public.app_error_log where created_at > now() - interval '24 hours' group by message order by c desc limit 10) t), '[]'::jsonb)
  ) into r;
  return r;
end;
$$;

-- The ONLY changes the agent may make by itself. Each one is a safe clean-up.
create or replace function public.agent_apply_fix(p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  if p_action = 'decline_stale_face_requests' then
    update public.face_scan_requests set status = 'DECLINED', resolved_at = now()
      where status = 'PENDING' and requested_at < now() - interval '30 days';
    get diagnostics n = row_count;
  elsif p_action = 'delete_orphan_face_descriptors' then
    delete from public.member_face_descriptors f where not exists (select 1 from public.members m where m.member_id = f.member_id);
    get diagnostics n = row_count;
  elsif p_action = 'remove_stale_unapproved_kiosks' then
    delete from public.kiosk_devices where not approved and created_at < now() - interval '14 days';
    get diagnostics n = row_count;
  elsif p_action = 'purge_old_error_log' then
    delete from public.app_error_log where created_at < now() - interval '30 days';
    get diagnostics n = row_count;
  else
    return jsonb_build_object('action', p_action, 'skipped', true);
  end if;
  return jsonb_build_object('action', p_action, 'affected', n);
end;
$$;

create or replace function public.agent_save_run(p_trigger text, p_status text, p_summary text, p_health jsonb, p_findings jsonb, p_fixes jsonb, p_suggestions jsonb, p_error text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; s jsonb;
begin
  insert into public.agent_runs (trigger, status, summary, health, findings, fixes_applied, error)
  values (coalesce(p_trigger,'cron'), coalesce(p_status,'ok'), left(p_summary,1500), p_health, coalesce(p_findings,'[]'::jsonb), coalesce(p_fixes,'[]'::jsonb), left(p_error,800))
  returning id into v_id;
  if p_suggestions is not null and jsonb_typeof(p_suggestions) = 'array' then
    for s in select * from jsonb_array_elements(p_suggestions) loop
      continue when coalesce(trim(s->>'title'),'') = '';
      continue when exists (select 1 from public.agent_suggestions where lower(title) = lower(left(s->>'title',160)) and created_at > now() - interval '60 days');
      insert into public.agent_suggestions (run_id, kind, priority, title, detail)
      values (v_id,
        case when s->>'kind' in ('bug','improvement','security') then s->>'kind' else 'improvement' end,
        case when s->>'priority' in ('low','medium','high') then s->>'priority' else 'medium' end,
        left(s->>'title',160), left(coalesce(s->>'detail',''),1500));
    end loop;
  end if;
  delete from public.agent_runs where ran_at < now() - interval '90 days';
  return v_id;
end;
$$;

create or replace function public.agent_get_secret(p_name text)
returns text language sql security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1;
$$;

-- Owner-only: store the API key / workspace id in Vault (never returned).
create or replace function public.admin_set_agent_credentials(p_passcode text, p_api_key text, p_workspace_id text)
returns boolean language plpgsql security definer set search_path = public, vault as $$
declare v jsonb := public.verify_admin_access(p_passcode); v_id uuid;
begin
  if v is null or v->>'role' <> 'owner' then raise exception 'Only the owner can do this.'; end if;
  if coalesce(trim(p_api_key),'') <> '' then
    select id into v_id from vault.secrets where name = 'anthropic_api_key';
    if v_id is null then perform vault.create_secret(trim(p_api_key), 'anthropic_api_key');
    else perform vault.update_secret(v_id, trim(p_api_key)); end if;
  end if;
  if coalesce(trim(p_workspace_id),'') <> '' then
    select id into v_id from vault.secrets where name = 'anthropic_workspace_id';
    if v_id is null then perform vault.create_secret(trim(p_workspace_id), 'anthropic_workspace_id');
    else perform vault.update_secret(v_id, trim(p_workspace_id)); end if;
  end if;
  return true;
end;
$$;

create or replace function public.admin_list_agent(p_passcode text)
returns jsonb language plpgsql security definer set search_path = public, vault as $$
declare v jsonb := public.verify_admin_access(p_passcode);
begin
  if v is null or v->>'role' <> 'owner' then raise exception 'Only the owner can do this.'; end if;
  return jsonb_build_object(
    'has_key', exists (select 1 from vault.secrets where name = 'anthropic_api_key'),
    'has_workspace', exists (select 1 from vault.secrets where name = 'anthropic_workspace_id'),
    'runs', coalesce((select jsonb_agg(to_jsonb(r) order by r.ran_at desc) from (
        select id, ran_at, trigger, status, summary, findings, fixes_applied, error from public.agent_runs order by ran_at desc limit 7) r), '[]'::jsonb),
    'suggestions', coalesce((select jsonb_agg(to_jsonb(s) order by (s.status = 'PENDING') desc, s.created_at desc) from (
        select id, created_at, kind, priority, title, detail, status from public.agent_suggestions
        where status in ('PENDING','APPROVED') or created_at > now() - interval '30 days' order by created_at desc limit 60) s), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_resolve_agent_suggestion(p_passcode text, p_id uuid, p_action text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v jsonb := public.verify_admin_access(p_passcode);
begin
  if v is null or v->>'role' <> 'owner' then raise exception 'Only the owner can do this.'; end if;
  if p_action not in ('APPROVED','DECLINED','DONE') then raise exception 'Invalid action.'; end if;
  update public.agent_suggestions set status = p_action, decided_at = now() where id = p_id;
  return found;
end;
$$;

revoke all on function public.agent_collect_health() from public, anon, authenticated;
revoke all on function public.agent_apply_fix(text) from public, anon, authenticated;
revoke all on function public.agent_save_run(text, text, text, jsonb, jsonb, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.agent_get_secret(text) from public, anon, authenticated;
grant execute on function public.agent_collect_health() to service_role;
grant execute on function public.agent_apply_fix(text) to service_role;
grant execute on function public.agent_save_run(text, text, text, jsonb, jsonb, jsonb, jsonb, text) to service_role;
grant execute on function public.agent_get_secret(text) to service_role;
grant execute on function public.admin_set_agent_credentials(text, text, text) to anon, authenticated;
grant execute on function public.admin_list_agent(text) to anon, authenticated;
grant execute on function public.admin_resolve_agent_suggestion(text, uuid, text) to anon, authenticated;
