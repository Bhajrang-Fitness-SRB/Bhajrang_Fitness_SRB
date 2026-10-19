/*
# Social Sales Agent (WhatsApp + Facebook + Instagram)

Private tables used by the `social-agent` (webhook) and `social-followups` (daily job)
edge functions. Conversations contain customers' private messages, so EVERY table here
is service-role only: RLS on, no policies, all anon/authenticated access revoked.
(Unlike most tables in this app, these must NOT be readable with the public anon key.)

Existing tables are only READ by the agent (members, packages, inventory) - nothing in
them is changed by this migration.
*/

-- ---------------------------------------------------------------- conversations
create table if not exists public.sa_conversations (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('whatsapp','facebook','instagram')),
  external_id text not null,                  -- phone (WhatsApp) or PSID / IGSID
  display_name text,
  lang text not null default 'en' check (lang in ('en','bn','bn-roman')),
  stage text not null default 'new' check (stage in ('new','interested','hot','booked','customer','lost')),
  interests text[] not null default '{}',
  member_id text,                             -- set only when a WhatsApp number matches a member
  summary text not null default '',
  human_takeover boolean not null default false,   -- true = AI stays silent, owner replies by hand
  needs_attention boolean not null default false,  -- AI asked the owner to look at this chat
  attention_reason text,
  opted_out boolean not null default false,        -- customer said STOP: no marketing / follow-ups
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  created_at timestamptz not null default now(),
  unique (channel, external_id)
);
create index if not exists sa_conv_attention_idx on public.sa_conversations (needs_attention) where needs_attention;
create index if not exists sa_conv_stage_idx on public.sa_conversations (stage, last_inbound_at desc);

-- ---------------------------------------------------------------- messages
create table if not exists public.sa_messages (
  id bigserial primary key,
  conversation_id uuid not null references public.sa_conversations(id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  body text not null,
  provider_mid text,                          -- Meta message id, used to ignore duplicate webhooks
  created_at timestamptz not null default now()
);
create unique index if not exists sa_messages_mid_uq on public.sa_messages (provider_mid) where provider_mid is not null;
create index if not exists sa_messages_conv_idx on public.sa_messages (conversation_id, created_at desc);

-- ---------------------------------------------------------------- bookings / sales leads
create table if not exists public.sa_bookings (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.sa_conversations(id) on delete set null,
  kind text not null check (kind in ('trial','pt_consult','join_visit','supplement_order','callback','other')),
  customer_name text,
  contact text,                               -- phone / social id to reach them
  channel text,
  preferred_time text,                        -- free text exactly as the customer said it
  details text not null default '',
  status text not null default 'NEW' check (status in ('NEW','CONFIRMED','DONE','CANCELLED')),
  created_at timestamptz not null default now()
);
create index if not exists sa_bookings_status_idx on public.sa_bookings (status, created_at desc);

-- ---------------------------------------------------------------- renewal / win-back follow-ups
create table if not exists public.sa_followups (
  id uuid primary key default gen_random_uuid(),
  member_id text not null,
  kind text not null,                         -- renew_7, renew_3, renew_0, lapsed_1, lapsed_7, lapsed_30, lapsed_90
  expiry_date text not null,                  -- the expiry this follow-up belongs to (members.expiry_date is text)
  phone text,
  message text not null,
  wa_link text,                               -- one-tap https://wa.me/... link for manual sending
  status text not null check (status in ('DRAFT','SENT','FAILED','SKIPPED')),
  error text,
  created_at timestamptz not null default now(),
  unique (member_id, kind, expiry_date)       -- each reminder goes out once per membership cycle
);

-- ---------------------------------------------------------------- owner-editable knowledge base
create table if not exists public.sa_knowledge (
  key text primary key,
  title text not null,
  content text not null default '',           -- empty = the agent treats it as UNKNOWN and says the owner will confirm
  updated_at timestamptz not null default now()
);
insert into public.sa_knowledge (key, title, content) values
  ('gym_info',        'Gym address, timings, contact number, Google Maps link', ''),
  ('pt_info',         'Personal training (PT): prices, session length, trainer names, results policy', ''),
  ('online_training', 'Online / offline coaching programs and prices', ''),
  ('offers',          'Current real offers and discounts (with end dates)', ''),
  ('supplement_policy','Supplement brands you sell and what you are happy for the agent to say about each (NO doses)', ''),
  ('trial_policy',    'Free trial / visit policy', ''),
  ('about',           'Extra facts about the gym: facilities, trainers, story, achievements', ''),
  ('default_language','Default language for follow-ups: en, bn or bn-roman', 'en'),
  ('auto_send_followups','yes = send renewal reminders automatically (needs approved WhatsApp template). no = save as drafts for you', 'no')
on conflict (key) do nothing;

-- ---------------------------------------------------------------- lock everything down
alter table public.sa_conversations enable row level security;
alter table public.sa_messages      enable row level security;
alter table public.sa_bookings      enable row level security;
alter table public.sa_followups     enable row level security;
alter table public.sa_knowledge     enable row level security;
revoke all on table public.sa_conversations, public.sa_messages, public.sa_bookings, public.sa_followups, public.sa_knowledge from anon, authenticated;
revoke all on sequence public.sa_messages_id_seq from anon, authenticated;

-- ---------------------------------------------------------------- phone -> member lookup (service role only)
-- WhatsApp gives us a verified phone number, so a match is a reliable identity.
-- Facebook / Instagram ids are NOT matched to members (no verified phone).
create or replace function public.sa_find_member(p_phone text)
returns table (member_id text, name text, package text, expiry_date text, goal text)
language sql security definer set search_path = public as $$
  select m.member_id, m.name, m.package, m.expiry_date, m.goal
  from public.members m
  where length(regexp_replace(coalesce(p_phone,''), '\D', '', 'g')) >= 10
    and (
      right(regexp_replace(coalesce(m.phone,''),    '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10)
      or right(regexp_replace(coalesce(m.whatsapp,''), '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10)
    )
  order by m.expiry_date desc nulls last
  limit 1;
$$;
revoke all on function public.sa_find_member(text) from public, anon, authenticated;
grant execute on function public.sa_find_member(text) to service_role;

-- Members whose membership ended recently or ends soon (used by the daily follow-up job).
-- expiry_date is stored as text 'YYYY-MM-DD'; bad values are ignored.
create or replace function public.sa_followup_candidates(p_days_ahead int default 7, p_days_back int default 180)
returns table (member_id text, name text, phone text, whatsapp text, package text, expiry_date text, goal text, days_left int)
language sql security definer set search_path = public as $$
  select m.member_id, m.name, m.phone, m.whatsapp, m.package, m.expiry_date, m.goal,
         (m.expiry_date::date - (now() at time zone 'Asia/Kolkata')::date)::int as days_left
  from public.members m
  where m.expiry_date ~ '^\d{4}-\d{2}-\d{2}$'
    and m.expiry_date::date between (now() at time zone 'Asia/Kolkata')::date - p_days_back
                                and (now() at time zone 'Asia/Kolkata')::date + p_days_ahead
    and length(regexp_replace(coalesce(nullif(m.whatsapp,''), m.phone, ''), '\D', '', 'g')) >= 10
  order by m.expiry_date desc;
$$;
revoke all on function public.sa_followup_candidates(int, int) from public, anon, authenticated;
grant execute on function public.sa_followup_candidates(int, int) to service_role;
