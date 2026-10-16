/*
# Admin AI Agent Hub (standalone module)

Owner-only "master control" for AI agents. Everything lives in its own tables
(agent_hub_*) and RPCs (admin_hub_* / hub_*), so it is independent of the rest of the app.

Design rules
- Free AI providers are pooled in `agent_hub_providers` (priority order, auto fail-over,
  cool-down when a free quota ends). API keys live in Supabase Vault, never in a table or the browser.
- Agents are rows in `agent_hub_agents`. Adding a new agent (social media, follow-up, events,
  website, ...) is a form in the UI, not a code change.
- Agents never change anything by themselves. They create PROPOSALS (`agent_hub_proposals`);
  nothing runs until the owner approves it in the Hub.
- All tables are closed to anon/authenticated. The browser only talks to owner-gated RPCs;
  the `agent-hub` edge function uses the service role.
*/

-- ---------------------------------------------------------------- tables
create table if not exists public.agent_hub_providers (
  id uuid primary key default gen_random_uuid(),
  slot_name text not null,
  preset text not null default 'custom',
  kind text not null default 'openai' check (kind in ('openai','gemini')),
  base_url text not null default '',
  models text[] not null default '{}',          -- owner-chosen models, tried in order
  models_cache text[] not null default '{}',    -- auto-discovered when `models` is empty
  models_cache_at timestamptz,
  model_filter text,                            -- optional regex used for auto-discovery
  priority int not null default 100,            -- lower = tried first
  enabled boolean not null default true,
  status text not null default 'unknown' check (status in ('unknown','ok','cooldown','invalid')),
  cooldown_until timestamptz,
  last_error text,
  last_used_at timestamptz,
  daily_limit int,                              -- optional self-imposed cap (requests/day)
  usage_day date not null default current_date,
  req_today int not null default 0,
  tokens_today bigint not null default 0,
  total_requests bigint not null default 0,
  total_failures bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_hub_agents (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,30}$'),
  name text not null,
  icon text not null default '🤖',
  description text not null default '',
  persona text not null default '',
  data_access text[] not null default '{}',     -- gym_health | money | repo
  proposal_kinds text[] not null default '{}',  -- content | message | social_post | sql | code | setting
  preferred_provider uuid references public.agent_hub_providers(id) on delete set null,
  enabled boolean not null default true,
  builtin boolean not null default false,
  sort_order int not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_hub_conversations (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null references public.agent_hub_agents(key) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_hub_messages (
  id bigserial primary key,
  conversation_id uuid not null references public.agent_hub_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  agent_key text,
  provider_slot text,
  model text,
  created_at timestamptz not null default now()
);
create index if not exists agent_hub_messages_conv_idx on public.agent_hub_messages (conversation_id, id);

create table if not exists public.agent_hub_proposals (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.agent_hub_conversations(id) on delete set null,
  agent_key text not null,
  kind text not null check (kind in ('content','message','social_post','sql','code','setting')),
  title text not null,
  summary text not null default '',
  payload jsonb not null default '{}'::jsonb,
  risk text not null default 'low' check (risk in ('low','medium','high')),
  status text not null default 'PENDING'
    check (status in ('PENDING','APPLYING','PR_OPEN','APPLIED','FAILED','DECLINED')),
  test_result jsonb,
  result jsonb,
  note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  applied_at timestamptz
);
create index if not exists agent_hub_proposals_status_idx on public.agent_hub_proposals (status, created_at desc);

create table if not exists public.agent_hub_activity (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor text not null default 'system',
  event text not null,
  detail jsonb not null default '{}'::jsonb
);
create index if not exists agent_hub_activity_at_idx on public.agent_hub_activity (at desc);

create table if not exists public.agent_hub_settings (
  key text primary key,
  value text not null default ''
);

do $$ declare t text; begin
  foreach t in array array['agent_hub_providers','agent_hub_agents','agent_hub_conversations','agent_hub_messages','agent_hub_proposals','agent_hub_activity','agent_hub_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;
revoke all on sequence public.agent_hub_messages_id_seq, public.agent_hub_activity_id_seq from anon, authenticated;

-- ---------------------------------------------------------------- helpers
create or replace function public.hub_assert_owner(p_passcode text)
returns void language plpgsql security definer set search_path = public as $$
declare v jsonb := public.verify_admin_access(p_passcode);
begin
  if v is null or v->>'role' <> 'owner' then raise exception 'Only the owner can do this.'; end if;
end;
$$;
revoke all on function public.hub_assert_owner(text) from public, anon, authenticated;

-- Secrets the Hub may store. Provider keys are named hub_provider_<uuid>.
create or replace function public.hub_secret_allowed(p_name text)
returns boolean language sql immutable as $$
  select p_name in ('hub_github_token','hub_meta_page_token','hub_meta_page_id','hub_meta_ig_user_id')
      or p_name ~ '^hub_provider_[0-9a-f-]{36}$';
$$;
revoke all on function public.hub_secret_allowed(text) from public, anon, authenticated;

create or replace function public.hub_put_secret(p_name text, p_value text)
returns void language plpgsql security definer set search_path = public, vault as $$
declare v_id uuid;
begin
  if not public.hub_secret_allowed(p_name) then raise exception 'Secret name not allowed.'; end if;
  select id into v_id from vault.secrets where name = p_name;
  if coalesce(trim(p_value),'') = '' then
    if v_id is not null then delete from vault.secrets where id = v_id; end if;
    return;
  end if;
  if v_id is null then perform vault.create_secret(trim(p_value), p_name);
  else perform vault.update_secret(v_id, trim(p_value)); end if;
end;
$$;
revoke all on function public.hub_put_secret(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- owner RPCs (browser)
create or replace function public.admin_hub_overview(p_passcode text)
returns jsonb language plpgsql security definer set search_path = public, vault as $$
declare r jsonb;
begin
  perform public.hub_assert_owner(p_passcode);
  select jsonb_build_object(
    'providers', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'slot_name', p.slot_name, 'preset', p.preset, 'kind', p.kind, 'base_url', p.base_url,
        'models', p.models, 'model_filter', p.model_filter, 'priority', p.priority, 'enabled', p.enabled,
        'status', case when p.status = 'cooldown' and (p.cooldown_until is null or p.cooldown_until <= now()) then 'ok' else p.status end,
        'cooldown_until', p.cooldown_until, 'last_error', p.last_error, 'last_used_at', p.last_used_at,
        'daily_limit', p.daily_limit,
        'req_today', case when p.usage_day = current_date then p.req_today else 0 end,
        'tokens_today', case when p.usage_day = current_date then p.tokens_today else 0 end,
        'total_requests', p.total_requests, 'total_failures', p.total_failures,
        'has_key', exists (select 1 from vault.secrets s where s.name = 'hub_provider_' || p.id::text)
      ) order by p.priority, p.created_at) from public.agent_hub_providers p), '[]'::jsonb),
    'agents', coalesce((select jsonb_agg(to_jsonb(a) order by a.sort_order, a.name) from public.agent_hub_agents a), '[]'::jsonb),
    'proposals', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
        select id, agent_key, kind, title, summary, payload, risk, status, test_result, result, note, created_at, decided_at, applied_at
        from public.agent_hub_proposals order by created_at desc limit 80) x), '[]'::jsonb),
    'conversations', coalesce((select jsonb_agg(to_jsonb(c) order by c.updated_at desc) from (
        select id, agent_key, title, updated_at from public.agent_hub_conversations order by updated_at desc limit 40) c), '[]'::jsonb),
    'settings', coalesce((select jsonb_object_agg(key, value) from public.agent_hub_settings), '{}'::jsonb),
    'secrets', jsonb_build_object(
      'hub_github_token', exists (select 1 from vault.secrets where name = 'hub_github_token'),
      'hub_meta_page_token', exists (select 1 from vault.secrets where name = 'hub_meta_page_token'),
      'hub_meta_page_id', exists (select 1 from vault.secrets where name = 'hub_meta_page_id'),
      'hub_meta_ig_user_id', exists (select 1 from vault.secrets where name = 'hub_meta_ig_user_id'))
  ) into r;
  return r;
end;
$$;

create or replace function public.admin_hub_save_provider(p_passcode text, p_provider jsonb, p_api_key text default null)
returns uuid language plpgsql security definer set search_path = public, vault as $$
declare v_id uuid; v_kind text; v_models text[];
begin
  perform public.hub_assert_owner(p_passcode);
  v_kind := case when p_provider->>'kind' = 'gemini' then 'gemini' else 'openai' end;
  v_models := coalesce((select array_agg(trim(m)) from jsonb_array_elements_text(coalesce(p_provider->'models','[]'::jsonb)) m where trim(m) <> ''), '{}');
  if coalesce(trim(p_provider->>'slot_name'),'') = '' then raise exception 'Give this AI a name.'; end if;
  if v_kind = 'openai' and coalesce(trim(p_provider->>'base_url'),'') !~ '^https://' then raise exception 'Base URL must start with https://'; end if;
  if coalesce(p_provider->>'model_filter','') <> '' then
    begin perform '' ~ (p_provider->>'model_filter'); exception when others then raise exception 'Model filter is not a valid regex.'; end;
  end if;
  v_id := nullif(p_provider->>'id','')::uuid;
  if v_id is null or not exists (select 1 from public.agent_hub_providers where id = v_id) then
    insert into public.agent_hub_providers (slot_name, preset, kind, base_url, models, model_filter, priority, enabled, daily_limit)
    values (left(trim(p_provider->>'slot_name'),60), left(coalesce(p_provider->>'preset','custom'),30), v_kind,
            left(trim(coalesce(p_provider->>'base_url','')),300), v_models, nullif(p_provider->>'model_filter',''),
            coalesce((p_provider->>'priority')::int, 100), coalesce((p_provider->>'enabled')::boolean, true),
            nullif(p_provider->>'daily_limit','')::int)
    returning id into v_id;
  else
    update public.agent_hub_providers set
      slot_name = left(trim(p_provider->>'slot_name'),60), kind = v_kind,
      base_url = left(trim(coalesce(p_provider->>'base_url','')),300), models = v_models,
      model_filter = nullif(p_provider->>'model_filter',''), priority = coalesce((p_provider->>'priority')::int, priority),
      enabled = coalesce((p_provider->>'enabled')::boolean, enabled), daily_limit = nullif(p_provider->>'daily_limit','')::int,
      models_cache = '{}', models_cache_at = null,
      -- A new key or switching a provider back on clears an old "invalid" state.
      status = case when coalesce(trim(p_api_key),'') <> '' or (coalesce((p_provider->>'enabled')::boolean, enabled) and not enabled) then 'unknown' else status end,
      cooldown_until = case when coalesce(trim(p_api_key),'') <> '' then null else cooldown_until end
    where id = v_id;
  end if;
  if coalesce(trim(p_api_key),'') <> '' then perform public.hub_put_secret('hub_provider_' || v_id::text, p_api_key); end if;
  insert into public.agent_hub_activity (actor, event, detail) values ('owner', 'provider_saved', jsonb_build_object('id', v_id, 'name', p_provider->>'slot_name'));
  return v_id;
end;
$$;

create or replace function public.admin_hub_delete_provider(p_passcode text, p_id uuid)
returns boolean language plpgsql security definer set search_path = public, vault as $$
begin
  perform public.hub_assert_owner(p_passcode);
  delete from vault.secrets where name = 'hub_provider_' || p_id::text;
  delete from public.agent_hub_providers where id = p_id;
  insert into public.agent_hub_activity (actor, event, detail) values ('owner', 'provider_deleted', jsonb_build_object('id', p_id));
  return found;
end;
$$;

create or replace function public.admin_hub_save_agent(p_passcode text, p_agent jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v_key text := lower(trim(p_agent->>'key')); v_access text[]; v_kinds text[]; v_pref uuid;
begin
  perform public.hub_assert_owner(p_passcode);
  if v_key is null or v_key !~ '^[a-z][a-z0-9_]{1,30}$' then raise exception 'Agent id: lowercase letters, numbers, underscore (2-31 chars).'; end if;
  if coalesce(trim(p_agent->>'name'),'') = '' then raise exception 'Give the agent a name.'; end if;
  v_access := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_agent->'data_access','[]'::jsonb)) x where x in ('gym_health','money','repo')), '{}');
  v_kinds := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_agent->'proposal_kinds','[]'::jsonb)) x where x in ('content','message','social_post','sql','code','setting')), '{}');
  v_pref := nullif(p_agent->>'preferred_provider','')::uuid;
  insert into public.agent_hub_agents (key, name, icon, description, persona, data_access, proposal_kinds, preferred_provider, enabled, sort_order)
  values (v_key, left(trim(p_agent->>'name'),60), left(coalesce(nullif(p_agent->>'icon',''),'🤖'),8), left(coalesce(p_agent->>'description',''),300),
          left(coalesce(p_agent->>'persona',''),6000), v_access, v_kinds, v_pref, coalesce((p_agent->>'enabled')::boolean, true),
          coalesce((p_agent->>'sort_order')::int, 100))
  on conflict (key) do update set
    name = excluded.name, icon = excluded.icon, description = excluded.description, persona = excluded.persona,
    data_access = excluded.data_access, proposal_kinds = excluded.proposal_kinds, preferred_provider = excluded.preferred_provider,
    enabled = excluded.enabled, sort_order = excluded.sort_order;
  insert into public.agent_hub_activity (actor, event, detail) values ('owner', 'agent_saved', jsonb_build_object('key', v_key));
  return v_key;
end;
$$;

create or replace function public.admin_hub_delete_agent(p_passcode text, p_key text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public.hub_assert_owner(p_passcode);
  if exists (select 1 from public.agent_hub_agents where key = p_key and builtin) then raise exception 'Built-in agents can be switched off but not deleted.'; end if;
  delete from public.agent_hub_agents where key = p_key;
  insert into public.agent_hub_activity (actor, event, detail) values ('owner', 'agent_deleted', jsonb_build_object('key', p_key));
  return found;
end;
$$;

create or replace function public.admin_hub_set_secret(p_passcode text, p_name text, p_value text)
returns boolean language plpgsql security definer set search_path = public, vault as $$
begin
  perform public.hub_assert_owner(p_passcode);
  if p_name like 'hub_provider_%' then raise exception 'Provider keys are saved with the provider.'; end if;
  perform public.hub_put_secret(p_name, p_value);
  insert into public.agent_hub_activity (actor, event, detail) values ('owner', 'secret_saved', jsonb_build_object('name', p_name, 'cleared', coalesce(trim(p_value),'') = ''));
  return true;
end;
$$;

create or replace function public.admin_hub_set_setting(p_passcode text, p_key text, p_value text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public.hub_assert_owner(p_passcode);
  if p_key not in ('github_repo','github_branch','notify_telegram','meta_graph_version') then raise exception 'Unknown setting.'; end if;
  if p_key = 'github_repo' and coalesce(p_value,'') <> '' and p_value !~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' then raise exception 'Repo must look like owner/name.'; end if;
  insert into public.agent_hub_settings (key, value) values (p_key, left(coalesce(p_value,''),120))
  on conflict (key) do update set value = excluded.value;
  return true;
end;
$$;

create or replace function public.admin_hub_messages(p_passcode text, p_conversation uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.hub_assert_owner(p_passcode);
  return coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from (
    select id, role, content, agent_key, provider_slot, model, created_at
    from public.agent_hub_messages where conversation_id = p_conversation order by id desc limit 200) m), '[]'::jsonb);
end;
$$;

create or replace function public.admin_hub_delete_conversation(p_passcode text, p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public.hub_assert_owner(p_passcode);
  delete from public.agent_hub_conversations where id = p_id;
  return found;
end;
$$;

create or replace function public.admin_hub_decline_proposal(p_passcode text, p_id uuid, p_note text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public.hub_assert_owner(p_passcode);
  update public.agent_hub_proposals set status = 'DECLINED', decided_at = now(), note = left(p_note,500)
   where id = p_id and status in ('PENDING','PR_OPEN','FAILED');
  if found then
    insert into public.agent_hub_activity (actor, event, detail) values ('owner', 'proposal_declined', jsonb_build_object('id', p_id));
  end if;
  return found;
end;
$$;

create or replace function public.admin_hub_activity(p_passcode text, p_limit int default 80)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.hub_assert_owner(p_passcode);
  return coalesce((select jsonb_agg(to_jsonb(a) order by a.id desc) from (
    select id, at, actor, event, detail from public.agent_hub_activity order by id desc limit least(greatest(p_limit,1),200)) a), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------- service-role helpers (edge function)
create or replace function public.hub_provider_record(
  p_id uuid, p_ok boolean, p_tokens int, p_error text, p_status text, p_cooldown_until timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.agent_hub_providers set
    usage_day = current_date,
    req_today = (case when usage_day = current_date then req_today else 0 end) + 1,
    tokens_today = (case when usage_day = current_date then tokens_today else 0 end) + coalesce(p_tokens,0),
    total_requests = total_requests + 1,
    total_failures = total_failures + (case when p_ok then 0 else 1 end),
    last_used_at = now(),
    last_error = case when p_ok then null else left(p_error,300) end,
    status = case when p_ok then 'ok' else coalesce(p_status, status) end,
    cooldown_until = case when p_ok then null else p_cooldown_until end
  where id = p_id;
end;
$$;
revoke all on function public.hub_provider_record(uuid, boolean, int, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.hub_provider_record(uuid, boolean, int, text, text, timestamptz) to service_role;

create or replace function public.hub_get_secret(p_name text)
returns text language plpgsql security definer set search_path = public, vault as $$
begin
  if not public.hub_secret_allowed(p_name) then return null; end if;
  return (select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1);
end;
$$;
revoke all on function public.hub_get_secret(text) from public, anon, authenticated;
grant execute on function public.hub_get_secret(text) to service_role;

grant execute on function public.admin_hub_overview(text) to anon, authenticated;
grant execute on function public.admin_hub_save_provider(text, jsonb, text) to anon, authenticated;
grant execute on function public.admin_hub_delete_provider(text, uuid) to anon, authenticated;
grant execute on function public.admin_hub_save_agent(text, jsonb) to anon, authenticated;
grant execute on function public.admin_hub_delete_agent(text, text) to anon, authenticated;
grant execute on function public.admin_hub_set_secret(text, text, text) to anon, authenticated;
grant execute on function public.admin_hub_set_setting(text, text, text) to anon, authenticated;
grant execute on function public.admin_hub_messages(text, uuid) to anon, authenticated;
grant execute on function public.admin_hub_delete_conversation(text, uuid) to anon, authenticated;
grant execute on function public.admin_hub_decline_proposal(text, uuid, text) to anon, authenticated;
grant execute on function public.admin_hub_activity(text, int) to anon, authenticated;

-- ---------------------------------------------------------------- built-in agents
-- Only the persona (who the agent is) is stored here. The safety rules and the proposal
-- format are added by the edge function, so editing a persona can never remove the approval gate.
insert into public.agent_hub_agents (key, name, icon, description, persona, data_access, proposal_kinds, builtin, sort_order) values
('master', 'Master Control', '🧠', 'Understands any instruction and hands work to the right specialist.',
 'You are Master Control, the owner''s chief of staff for Bhajrang Fitness (a gym in India). You can answer anything about the gym business, create content, analyse numbers and plan work. When a request clearly belongs to a specialist, delegate it instead of doing it badly yourself.',
 '{gym_health}', '{content,message,social_post,setting}', true, 1),
('developer', 'Developer', '🛠️', 'Analyses, fixes and builds app features and database changes (always through approval).',
 'You are the senior full-stack developer for the gym app (React + Vite + TypeScript frontend, Supabase Postgres + edge functions). You analyse problems, fix bugs and build or rework features. You never guess file contents: read the file first, then propose small exact patches. Prefer the smallest safe change. For database changes write idempotent SQL (create ... if not exists, add column if not exists) and an undo_sql when possible.',
 '{repo,gym_health}', '{code,sql,setting}', true, 2),
('money', 'Money & Growth', '💰', 'Earnings, expenses, dues, savings and growth ideas.',
 'You are the money and growth advisor for the gym owner. Amounts are in Indian rupees (₹). Be plain and practical, use only figures present in the data, and finish with a concrete step for this week.',
 '{money}', '{content,message,setting}', true, 3),
('marketing', 'Marketing & Social', '📣', 'Flyers, offers, captions and Facebook / Instagram posts.',
 'You are the marketing and social media manager for Bhajrang Fitness. You write offers, captions, festival greetings, reel ideas and posting calendars in friendly Hinglish or English as the owner prefers. Keep claims honest (no fake guarantees), and keep posts short, energetic and local.',
 '{gym_health}', '{content,social_post,message}', true, 4),
('followup', 'Follow-up', '📞', 'Renewal, lapsed-member, dues and birthday follow-up messages.',
 'You are the member follow-up manager. You write warm, short, non-pushy messages for renewals, expired or inactive members, pending dues and birthdays. Use {name} as the placeholder for the member''s name. Never shame anyone about money.',
 '{gym_health}', '{message,content}', true, 5),
('events', 'Events', '🎉', 'Challenges, offers days, workshops and festival events.',
 'You are the events planner. You design member challenges, transformation contests, festival offers, workshops and referral drives: goal, plan, timeline, budget in ₹, announcement text and a follow-up plan.',
 '{}', '{content,message,social_post}', true, 6),
('website', 'Website', '🌐', 'The public marketing website and landing pages.',
 'You are the website manager for the gym''s public marketing site (plain static HTML/CSS/JS in the site/ folder). You improve copy, sections, speed, SEO and mobile layout. Read the page before changing it and propose small exact patches.',
 '{repo}', '{code,content}', true, 7)
on conflict (key) do nothing;

insert into public.agent_hub_settings (key, value) values ('github_branch', 'main'), ('notify_telegram', 'true')
on conflict (key) do nothing;
