/*
# Diary entries table

## Purpose
Staff/owner journal used by the Desk's Diary tab. Applied directly to the
live database earlier; this file brings the repo's migration history back
in sync with what's actually running.

## New Tables
- `diary_entries` — dated notes, tagged by category.

## Security
Same anon-key RLS pattern as every other table in this project.
*/

CREATE TABLE IF NOT EXISTS public.diary_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  author text NOT NULL DEFAULT 'Staff',
  tag text NOT NULL DEFAULT 'General',
  title text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.diary_entries ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.diary_entries TO anon, authenticated;
DROP POLICY IF EXISTS "anon_select_diary" ON public.diary_entries;
CREATE POLICY "anon_select_diary" ON public.diary_entries FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_diary" ON public.diary_entries;
CREATE POLICY "anon_insert_diary" ON public.diary_entries FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_diary" ON public.diary_entries;
CREATE POLICY "anon_update_diary" ON public.diary_entries FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_diary" ON public.diary_entries;
CREATE POLICY "anon_delete_diary" ON public.diary_entries FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_diary_date ON public.diary_entries(entry_date);
