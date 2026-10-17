/*
# Notice board, membership freeze requests, and gym settings

## Purpose
Adds three small tables to support: a staff-posted notice board shown on
the Warrior app, member-initiated membership freeze/pause requests that
staff approve, and a simple key-value settings table (starting with the
gym's UPI VPA for free QR payments on invoices, and its address for
invoice headers).

## Security
Same anon-key, single-tenant RLS pattern as the rest of this project.
*/

CREATE TABLE IF NOT EXISTS public.notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notices TO anon, authenticated;
DROP POLICY IF EXISTS "anon_all_notices" ON public.notices;
CREATE POLICY "anon_all_notices" ON public.notices FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.freeze_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id text NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'PENDING',
  requested_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
ALTER TABLE public.freeze_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.freeze_requests TO anon, authenticated;
DROP POLICY IF EXISTS "anon_all_freeze" ON public.freeze_requests;
CREATE POLICY "anon_all_freeze" ON public.freeze_requests FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.gym_settings (
  key text PRIMARY KEY,
  value text
);
ALTER TABLE public.gym_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.gym_settings TO anon, authenticated;
DROP POLICY IF EXISTS "anon_all_settings" ON public.gym_settings;
CREATE POLICY "anon_all_settings" ON public.gym_settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
INSERT INTO public.gym_settings (key, value) VALUES ('upi_vpa', ''), ('gym_address', '') ON CONFLICT (key) DO NOTHING;
