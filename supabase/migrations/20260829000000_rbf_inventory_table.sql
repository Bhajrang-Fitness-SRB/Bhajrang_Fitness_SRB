/*
# Store inventory table

## Purpose
Tracks gym-store stock (supplements, gear, accessories) for the Desk's
Inventory tab — quantities, reorder thresholds, and prices.

## New Tables
- `inventory` — item name, category, quantity, reorder level, unit price.

## Security
Same anon-key RLS pattern as every other table in this project.
*/

CREATE TABLE IF NOT EXISTS public.inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name text NOT NULL,
  category text NOT NULL DEFAULT 'Supplement',
  quantity integer NOT NULL DEFAULT 0,
  reorder_level integer NOT NULL DEFAULT 5,
  unit_price integer NOT NULL DEFAULT 0,
  last_restocked date,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inventory TO anon, authenticated;
DROP POLICY IF EXISTS "anon_select_inventory" ON public.inventory;
CREATE POLICY "anon_select_inventory" ON public.inventory FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_inventory" ON public.inventory;
CREATE POLICY "anon_insert_inventory" ON public.inventory FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_inventory" ON public.inventory;
CREATE POLICY "anon_update_inventory" ON public.inventory FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_inventory" ON public.inventory;
CREATE POLICY "anon_delete_inventory" ON public.inventory FOR DELETE TO anon, authenticated USING (true);
