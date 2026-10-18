/*
# AI Agent Hub (owner only)

One control room for every AI agent in the gym app:
* AI providers (Gemini, Groq, OpenRouter, Cerebras, Mistral) in priority order. When one runs out of free quota or
  is rate-limited, the hub automatically tries the next one (see edge function `ai-hub`).
* Agents: ready-made ones (Marketing, Follow-up, Business Analyst, Developer) plus any you add yourself, with no code.
* Approvals: agents only WRITE and PROPOSE. Nothing is changed or sent until you approve, and "approve" records your
  decision; it never edits the app or posts anything by itself.

API KEYS are NOT stored here. They live in Supabase function secrets (never in the browser or database).
Every table is private (service role only); the screen reads/writes only through owner-passcode functions.
*/

create table if not exists public.hub_providers (
  key text primary key check (key in ('gemini','groq','openrouter','cerebras','mistral')),
  enabled boolean not null default true,
  priority int not null default 100,
  model text,                                   -- empty = discover the best current model automatically
  state text not null default 'untested' check (state in ('untested','ok','rate_limited','quota_out','bad_key','error')),
  cooldown_until timestamptz,
  last_error text,
  last_ok_at timestamptz,
  ok_count int not null default 0,
  fail_count int not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.hub_providers (key, priority) values ('gemini',10),('groq',20),('openrouter',30),('cerebras',40),('mistral',50)
on conflict (key) do nothing;

create table if not exists public.hub_agents (
  key text primary key check (key ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  name text not null,
  description text not null default '',
  system_prompt text not null,
  enabled boolean not null default true,
  builtin boolean not null default false,
  use_snapshot boolean not null default false,  -- true = also receive anonymous gym counts (no names, phones or money)
  created_at timestamptz not null default now()
);
insert into public.hub_agents (key, name, description, system_prompt, builtin, use_snapshot) values
 ('marketing', 'Marketing & Ads Agent', 'Writes posts, captions, offer announcements and ad copy in English / Bengali.',
  'You are the gym''s marketing and advertising writer. Produce ready-to-edit copy for Instagram, Facebook and WhatsApp: a short headline, the body, a clear call to action, and 5 relevant hashtags. Offer 2 variations. Only mention offers, prices or dates the owner gave you in INPUT; otherwise leave a clear [PRICE] or [DATE] placeholder.', true, false),
 ('followup', 'Follow-up Agent', 'Drafts renewal, win-back, birthday and payment-reminder messages.',
  'You write short, warm, respectful follow-up messages from the gym to members (renewal, win-back, birthday, payment reminder). Use the member details in INPUT, keep each under 60 words, mention Personal Training when it fits, and end with an easy question. Give a Bengali (Banglish) and an English version.', true, false),
 ('analyst', 'Business Analyst', 'Reads the gym''s anonymous numbers and suggests what to do this week.',
  'You are the gym''s business analyst. Using the GYM SNAPSHOT counts and any notes in INPUT, explain in plain language what is going well, what needs attention, and give at most 5 specific actions for this week, ordered by impact. Do not invent numbers that are not in the snapshot.', true, true),
 ('developer', 'Developer Agent', 'Turns an app idea or bug into a clear, safe change plan you can approve.',
  'You are a careful software planner for a React + Vite + Supabase gym app. Turn the idea or bug in INPUT into: (1) what the owner will see change, (2) the screens/tables/functions involved, (3) risks (data safety, privacy, cost), (4) a numbered step list, (5) how to test it. You cannot change the code yourself; the owner approves the plan first.', true, false)
on conflict (key) do nothing;

create table if not exists public.hub_proposals (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null,
  title text not null,
  detail text not null,
  provider text,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','DECLINED','DONE')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists hub_proposals_status_idx on public.hub_proposals (status, created_at desc);

create table if not exists public.hub_runs (
  id bigserial primary key,
  agent_key text,
  provider text,
  ok boolean not null,
  ms int,
  created_at timestamptz not null default now()
);
create index if not exists hub_runs_day_idx on public.hub_runs (created_at desc);

alter table public.hub_providers enable row level security;
alter table public.hub_agents    enable row level security;
alter table public.hub_proposals enable row level security;
alter table public.hub_runs      enable row level security;
revoke all on table public.hub_providers, public.hub_agents, public.hub_proposals, public.hub_runs from anon, authenticated;
revoke all on sequence public.hub_runs_id_seq from anon, authenticated;

create or replace function public.hub_require_owner(p_passcode text)
returns void language plpgsql security definer set search_path = public as $$
declare v jsonb := public.verify_admin_access(p_passcode);
begin
  if v is null or v->>'role' <> 'owner' then raise exception 'Only the owner can do this.'; end if;
end;
$$;
revoke all on function public.hub_require_owner(text) from public, anon, authenticated;

-- ------------------------------------------------------------------ everything the screen needs
create or replace function public.admin_hub_overview(p_passcode text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.hub_require_owner(p_passcode);
  return jsonb_build_object(
    'providers', coalesce((select jsonb_agg(to_jsonb(p) order by p.priority, p.key) from (
        select key, enabled, priority, model, state, cooldown_until, last_error, last_ok_at, ok_count, fail_count,
               (select count(*) from public.hub_runs r where r.provider = hub_providers.key and r.ok and r.created_at > now() - interval '24 hours') as calls_24h
        from public.hub_providers) p), '[]'::jsonb),
    'agents', coalesce((select jsonb_agg(to_jsonb(a) order by a.builtin desc, a.created_at) from (
        select key, name, description, system_prompt, enabled, builtin, use_snapshot, created_at from public.hub_agents) a), '[]'::jsonb),
    'proposals', coalesce((select jsonb_agg(to_jsonb(x) order by (x.status = 'PENDING') desc, x.created_at desc) from (
        select pr.id, pr.agent_key, coalesce(a.name, pr.agent_key) as agent_name, pr.title, pr.detail, pr.provider, pr.status, pr.created_at
        from public.hub_proposals pr left join public.hub_agents a on a.key = pr.agent_key
        where pr.status in ('PENDING','APPROVED') or pr.created_at > now() - interval '14 days'
        order by (pr.status = 'PENDING') desc, pr.created_at desc limit 80) x), '[]'::jsonb),
    'runs_24h', (select count(*) from public.hub_runs where created_at > now() - interval '24 hours')
  );
end;
$$;

-- ------------------------------------------------------------------ providers
-- NULL = leave as is. p_model = '' clears the model back to "choose automatically".
create or replace function public.admin_hub_set_provider(p_passcode text, p_key text, p_enabled boolean default null, p_priority int default null, p_model text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public.hub_require_owner(p_passcode);
  if p_priority is not null and (p_priority < 1 or p_priority > 1000) then raise exception 'Priority must be 1 to 1000.'; end if;
  if p_model is not null and length(p_model) > 120 then raise exception 'Model name too long.'; end if;
  update public.hub_providers set
    enabled  = coalesce(p_enabled, enabled),
    priority = coalesce(p_priority, priority),
    model    = case when p_model is null then model else nullif(trim(p_model), '') end,
    updated_at = now()
  where key = p_key;
  return found;
end;
$$;

-- Swap the order of two providers (up / down arrows in the screen).
create or replace function public.admin_hub_swap_priority(p_passcode text, p_a text, p_b text)
returns boolean language plpgsql security definer set search_path = public as $$
declare pa int; pb int;
begin
  perform public.hub_require_owner(p_passcode);
  select priority into pa from public.hub_providers where key = p_a;
  select priority into pb from public.hub_providers where key = p_b;
  if pa is null or pb is null then return false; end if;
  if pa = pb then pb := pa + 1; end if;
  update public.hub_providers set priority = pb, updated_at = now() where key = p_a;
  update public.hub_providers set priority = pa, updated_at = now() where key = p_b;
  return true;
end;
$$;

-- Forget a cool-down (e.g. after you added credits or a new key).
create or replace function public.admin_hub_reset_provider(p_passcode text, p_key text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public.hub_require_owner(p_passcode);
  update public.hub_providers set cooldown_until = null, state = 'untested', last_error = null, updated_at = now() where key = p_key;
  return found;
end;
$$;

-- ------------------------------------------------------------------ agents (add your own with no code)
create or replace function public.admin_hub_save_agent(p_passcode text, p_key text, p_name text, p_description text, p_prompt text, p_enabled boolean default true, p_use_snapshot boolean default false)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public.hub_require_owner(p_passcode);
  if p_key is null or p_key !~ '^[a-z0-9][a-z0-9-]{0,39}$' then raise exception 'Agent id must be lowercase letters, numbers and dashes.'; end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_prompt), '') = '' then raise exception 'Name and instructions are required.'; end if;
  if length(p_prompt) > 4000 or length(coalesce(p_description,'')) > 300 or length(p_name) > 60 then raise exception 'Text too long.'; end if;
  insert into public.hub_agents (key, name, description, system_prompt, enabled, use_snapshot)
  values (p_key, trim(p_name), coalesce(p_description, ''), p_prompt, coalesce(p_enabled, true), coalesce(p_use_snapshot, false))
  on conflict (key) do update set name = excluded.name, description = excluded.description, system_prompt = excluded.system_prompt,
                                  enabled = excluded.enabled, use_snapshot = excluded.use_snapshot;
  return true;
end;
$$;

create or replace function public.admin_hub_delete_agent(p_passcode text, p_key text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public.hub_require_owner(p_passcode);
  delete from public.hub_agents where key = p_key and not builtin;     -- ready-made agents can be turned off but not deleted
  return found;
end;
$$;

-- ------------------------------------------------------------------ approvals
create or replace function public.admin_hub_decide_proposal(p_passcode text, p_id uuid, p_status text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public.hub_require_owner(p_passcode);
  if p_status not in ('APPROVED','DECLINED','DONE') then raise exception 'Unknown status.'; end if;
  update public.hub_proposals set status = p_status, decided_at = now() where id = p_id;
  return found;
end;
$$;

-- ------------------------------------------------------------------ anonymous gym numbers for the Business Analyst (service role only)
-- Counts only: no names, phone numbers or money amounts ever leave the database.
create or replace function public.hub_snapshot()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  r := jsonb_build_object(
    'date', today,
    'members_total',            (select count(*) from public.members),
    'members_active',           (select count(*) from public.members where expiry_date ~ '^\d{4}-\d{2}-\d{2}$' and expiry_date::date >= today),
    'members_expiring_next_7d', (select count(*) from public.members where expiry_date ~ '^\d{4}-\d{2}-\d{2}$' and expiry_date::date between today and today + 7),
    'members_expired_1_to_30d', (select count(*) from public.members where expiry_date ~ '^\d{4}-\d{2}-\d{2}$' and expiry_date::date between today - 30 and today - 1),
    'members_expired_over_30d', (select count(*) from public.members where expiry_date ~ '^\d{4}-\d{2}-\d{2}$' and expiry_date::date < today - 30)
  );
  if to_regclass('public.sa_conversations') is not null then
    r := r || jsonb_build_object(
      'social_chats_total',  (select count(*) from public.sa_conversations),
      'social_chats_hot',    (select count(*) from public.sa_conversations where stage = 'hot'),
      'social_chats_booked', (select count(*) from public.sa_conversations where stage = 'booked'),
      'social_new_bookings', (select count(*) from public.sa_bookings where status = 'NEW'));
  end if;
  return r;
end;
$$;
revoke all on function public.hub_snapshot() from public, anon, authenticated;
grant execute on function public.hub_snapshot() to service_role;

grant execute on function public.admin_hub_overview(text)                                         to anon, authenticated;
grant execute on function public.admin_hub_set_provider(text, text, boolean, int, text)           to anon, authenticated;
grant execute on function public.admin_hub_swap_priority(text, text, text)                        to anon, authenticated;
grant execute on function public.admin_hub_reset_provider(text, text)                             to anon, authenticated;
grant execute on function public.admin_hub_save_agent(text, text, text, text, text, boolean, boolean) to anon, authenticated;
grant execute on function public.admin_hub_delete_agent(text, text)                               to anon, authenticated;
grant execute on function public.admin_hub_decide_proposal(text, uuid, text)                      to anon, authenticated;
