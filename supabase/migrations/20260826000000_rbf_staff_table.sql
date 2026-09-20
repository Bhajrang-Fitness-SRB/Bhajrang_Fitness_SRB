/*
# Staff table for the Villain (owner) vault

## Purpose
Adds a `staff` table so the owner-only /villain vault can manage gym staff
accounts separately from members. Matches the existing single-tenant,
anon-key RLS pattern already used across this project.

## New Tables
- `staff` — name, role, phone, login passcode, active flag.

## Security
Same pattern as every other table in this project: RLS enabled, anon +
authenticated roles get full CRUD via the anon key, since this app has no
Supabase Auth screens and relies on the app-level Villain passcode gate
instead.
*/

CREATE TABLE IF NOT EXISTS public.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text NOT NULL DEFAULT 'Staff',
  phone text,
  passcode text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_staff" ON public.staff;
CREATE POLICY "anon_select_staff" ON public.staff FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_staff" ON public.staff;
CREATE POLICY "anon_insert_staff" ON public.staff FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_staff" ON public.staff;
CREATE POLICY "anon_update_staff" ON public.staff FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_staff" ON public.staff;
CREATE POLICY "anon_delete_staff" ON public.staff FOR DELETE TO anon, authenticated USING (true);
