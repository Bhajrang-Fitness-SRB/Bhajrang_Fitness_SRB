-- Baseline: the core tables every later migration builds on.
-- (They were created by hand in the original project, so no earlier migration made them.)
-- Safe to run twice. Row-level security is switched on with NO public policies; the
-- lock-down migrations later in this folder add the exact access rules.

create extension if not exists pgcrypto with schema extensions;

create or replace function public._today_ist() returns date
language sql stable as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

-- numbers for new member IDs (SRB929 + 5 digits)
create sequence if not exists public.member_id_seq start 1;

create table if not exists public.members (
  member_id varchar(50) primary key,
  created_at timestamptz not null default timezone('utc', now()),
  name text, father_name text, dob date, gender text, blood_group text, govt_id text, occupation text, marital_status text,
  phone text not null unique,
  whatsapp text, email text, address text, city text, state text, pin text,
  gym_experience_years text, profile_pic text, joining_date date, package text, expiry_date text, goal text,
  height_cm numeric(5,1), weight_kg numeric(5,1), medical_conditions text,
  workout_pt_unlocked boolean not null default false,
  workout_prep_unlocked boolean not null default false,
  pt_package text, pt_expiry_date text
);
create index if not exists idx_members_phone on public.members (phone);
create index if not exists members_phone_whatsapp_idx on public.members (phone, whatsapp);

create table if not exists public.ghost_vault (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  name text,
  member_id varchar(50) not null unique references public.members(member_id) on delete cascade,
  mobile text, passcode text, invoice text, join_date text
);

create table if not exists public.pending_approvals (
  id serial primary key,
  created_at timestamptz default now(),
  name text, mobile text not null, email text, dob date, address text,
  photo_base64 text, id_doc_b64 text, signature_b64 text,
  status text default 'PENDING', match_status text, original_frozen_id text,
  father_name text, gender text, blood_group text, govt_id text, occupation text, marital_status text,
  whatsapp text, city text, state text, pin text, gym_experience_years text, goal text,
  height_cm numeric(5,1), weight_kg numeric(5,1), medical_conditions text,
  health_consent boolean not null default false,
  review_note text, reviewed_at timestamptz
);

create table if not exists public.billing (
  id serial primary key,
  created_at timestamptz default now(),
  member_id varchar(50) references public.members(member_id) on delete cascade,
  package_name text, amount integer, discount integer, paid integer, due integer,
  payment_date date, expiry_date text,
  payment_method text not null default 'UPI',
  start_date date, kind text,
  payment_status text generated always as (case when coalesce(due,0) = 0 then 'Done' else 'Due' end) stored
);
create index if not exists idx_billing_member on public.billing (member_id);
create index if not exists billing_open_due_idx on public.billing (member_id) where due > 0;

create table if not exists public.attendance_logs (
  id serial primary key,
  member_id varchar(50) references public.members(member_id) on delete cascade,
  punch_in_time timestamptz default now(),
  punch_out_time timestamptz,
  status text
);
create index if not exists idx_attendance_member on public.attendance_logs (member_id);
create index if not exists attendance_logs_member_time_idx on public.attendance_logs (member_id, punch_in_time desc);

create table if not exists public.expenses (
  id serial primary key,
  created_at timestamptz default now(),
  expense_name text, amount integer,
  expense_date date default public._today_ist(),
  category text, payment_mode text default 'Cash', note text, created_by text
);

create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  duration_months integer not null default 1,
  price integer not null default 0,
  description text not null default '',
  created_at timestamptz not null default now(),
  category text not null default 'Membership',
  constraint packages_category_chk check (category in ('Membership','PT'))
);

create table if not exists public.ai_plans (
  id uuid primary key default gen_random_uuid(),
  member_id text not null,
  plan_type text not null default 'workout',
  title text not null default '',
  plan_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_plans_member on public.ai_plans (member_id);

create table if not exists public.owner_credentials (
  id boolean primary key default true,
  passcode_hash text not null,
  updated_at timestamptz not null default now(),
  constraint owner_credentials_single_row check (id)
);

do $$ declare t text; begin
  foreach t in array array['members','ghost_vault','pending_approvals','billing','attendance_logs','expenses','packages','ai_plans','owner_credentials'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
