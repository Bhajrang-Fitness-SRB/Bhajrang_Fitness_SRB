/*
# Complete RBF Gym Schema Access and Supporting Tables

## Purpose
Complete the existing RBF gym database without deleting or changing existing user data. The project already contains members, pending approvals, ghost vault credentials, billing, attendance logs, expenses, and an approval function. This migration makes those existing records usable by the app and adds the two missing feature tables.

## Existing Tables Updated
- `members` — add anon/authenticated CRUD policies and grants.
- `pending_approvals` — add anon/authenticated CRUD policies and grants.
- `ghost_vault` — add anon/authenticated CRUD policies and grants.
- `billing` — add anon/authenticated CRUD policies and grants.
- `attendance_logs` — add anon/authenticated CRUD policies and grants.
- `expenses` — add anon/authenticated CRUD policies and grants.

## New Tables
- `packages` — membership package catalog with duration and price.
- `ai_plans` — workout and diet plans assigned to members, stored as JSONB.

## Security
This is a single-tenant gym application without Supabase Auth screens. The client uses the anon key and the custom Warrior ID + passcode flow already present in the database. Every table has RLS enabled and separate policies for SELECT, INSERT, UPDATE, and DELETE for anon and authenticated roles. The existing approval function remains SECURITY DEFINER with a fixed public search path and is granted to the anon and authenticated roles so the admin flow can complete its existing atomic approval process.

## Important Notes
1. No tables, columns, or existing records are deleted.
2. Existing integer and text identifiers are preserved for compatibility with the existing approval function.
3. The new tables use the existing `member_id` text identifier rather than adding a new foreign key that could break the current schema.
4. Package seed data is inserted only when a matching package name is absent.
*/

-- Existing table access: the app is intentionally single-tenant.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.members TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pending_approvals TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ghost_vault TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.billing TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.attendance_logs TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.expenses TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_members" ON public.members;
CREATE POLICY "anon_select_members" ON public.members FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_members" ON public.members;
CREATE POLICY "anon_insert_members" ON public.members FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_members" ON public.members;
CREATE POLICY "anon_update_members" ON public.members FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_members" ON public.members;
CREATE POLICY "anon_delete_members" ON public.members FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_pending_approvals" ON public.pending_approvals;
CREATE POLICY "anon_select_pending_approvals" ON public.pending_approvals FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_pending_approvals" ON public.pending_approvals;
CREATE POLICY "anon_insert_pending_approvals" ON public.pending_approvals FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_pending_approvals" ON public.pending_approvals;
CREATE POLICY "anon_update_pending_approvals" ON public.pending_approvals FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_pending_approvals" ON public.pending_approvals;
CREATE POLICY "anon_delete_pending_approvals" ON public.pending_approvals FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_ghost_vault" ON public.ghost_vault;
CREATE POLICY "anon_select_ghost_vault" ON public.ghost_vault FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_ghost_vault" ON public.ghost_vault;
CREATE POLICY "anon_insert_ghost_vault" ON public.ghost_vault FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_ghost_vault" ON public.ghost_vault;
CREATE POLICY "anon_update_ghost_vault" ON public.ghost_vault FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_ghost_vault" ON public.ghost_vault;
CREATE POLICY "anon_delete_ghost_vault" ON public.ghost_vault FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_billing" ON public.billing;
CREATE POLICY "anon_select_billing" ON public.billing FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_billing" ON public.billing;
CREATE POLICY "anon_insert_billing" ON public.billing FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_billing" ON public.billing;
CREATE POLICY "anon_update_billing" ON public.billing FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_billing" ON public.billing;
CREATE POLICY "anon_delete_billing" ON public.billing FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_attendance" ON public.attendance_logs;
CREATE POLICY "anon_select_attendance" ON public.attendance_logs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_attendance" ON public.attendance_logs;
CREATE POLICY "anon_insert_attendance" ON public.attendance_logs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_attendance" ON public.attendance_logs;
CREATE POLICY "anon_update_attendance" ON public.attendance_logs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_attendance" ON public.attendance_logs;
CREATE POLICY "anon_delete_attendance" ON public.attendance_logs FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_expenses" ON public.expenses;
CREATE POLICY "anon_select_expenses" ON public.expenses FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_expenses" ON public.expenses;
CREATE POLICY "anon_insert_expenses" ON public.expenses FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_expenses" ON public.expenses;
CREATE POLICY "anon_update_expenses" ON public.expenses FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_expenses" ON public.expenses;
CREATE POLICY "anon_delete_expenses" ON public.expenses FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  duration_months integer NOT NULL DEFAULT 1,
  price integer NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.packages TO anon, authenticated;
DROP POLICY IF EXISTS "anon_select_packages" ON public.packages;
CREATE POLICY "anon_select_packages" ON public.packages FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_packages" ON public.packages;
CREATE POLICY "anon_insert_packages" ON public.packages FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_packages" ON public.packages;
CREATE POLICY "anon_update_packages" ON public.packages FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_packages" ON public.packages;
CREATE POLICY "anon_delete_packages" ON public.packages FOR DELETE TO anon, authenticated USING (true);
INSERT INTO public.packages (name, duration_months, price, description)
VALUES ('Monthly', 1, 1500, 'Standard monthly membership'), ('Quarterly', 3, 4000, 'Three-month membership'), ('Half-Yearly', 6, 7500, 'Six-month membership'), ('Yearly', 12, 14000, 'Full-year membership')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ai_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id text NOT NULL,
  plan_type text NOT NULL DEFAULT 'workout',
  title text NOT NULL DEFAULT '',
  plan_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_plans ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_plans TO anon, authenticated;
DROP POLICY IF EXISTS "anon_select_ai_plans" ON public.ai_plans;
CREATE POLICY "anon_select_ai_plans" ON public.ai_plans FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_ai_plans" ON public.ai_plans;
CREATE POLICY "anon_insert_ai_plans" ON public.ai_plans FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_ai_plans" ON public.ai_plans;
CREATE POLICY "anon_update_ai_plans" ON public.ai_plans FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_ai_plans" ON public.ai_plans;
CREATE POLICY "anon_delete_ai_plans" ON public.ai_plans FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_ai_plans_member ON public.ai_plans(member_id);
CREATE INDEX IF NOT EXISTS idx_members_phone ON public.members(phone);
CREATE INDEX IF NOT EXISTS idx_attendance_member ON public.attendance_logs(member_id);
CREATE INDEX IF NOT EXISTS idx_billing_member ON public.billing(member_id);

GRANT EXECUTE ON FUNCTION public.approve_member(integer, text, integer, integer, integer, integer) TO anon, authenticated;
