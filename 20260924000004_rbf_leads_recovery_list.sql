/*
# Owner-only outreach list

## Why this file exists
Applied directly to the live database and never saved as a migration file in
the repo. Recorded here now (with the follow-up type-cast fix for
admin_list_lapsed_members already folded in, matching the final live state).

Old enquiries, walk-ins who never joined, or anyone worth recontacting for
promotions. Fully separate from members; staff have no access to this table
at all.
*/
CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  phone text NOT NULL,
  source text NOT NULL DEFAULT 'Unknown',
  notes text,
  last_contacted date,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.leads FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_leads(p_passcode text)
RETURNS SETOF public.leads
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.verify_owner_passcode(p_passcode) THEN RAISE EXCEPTION 'Access denied.'; END IF;
  RETURN QUERY SELECT * FROM public.leads ORDER BY created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_leads(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_upsert_lead(p_passcode text, p_id uuid, p_name text, p_phone text, p_source text, p_notes text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.verify_owner_passcode(p_passcode) THEN RAISE EXCEPTION 'Access denied.'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.leads (name, phone, source, notes) VALUES (p_name, p_phone, p_source, p_notes) RETURNING id INTO v_id;
  ELSE
    UPDATE public.leads SET name=p_name, phone=p_phone, source=p_source, notes=p_notes, last_contacted=CURRENT_DATE WHERE id=p_id;
    v_id := p_id;
  END IF;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_upsert_lead(text, uuid, text, text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_lead(p_passcode text, p_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.verify_owner_passcode(p_passcode) THEN RAISE EXCEPTION 'Access denied.'; END IF;
  DELETE FROM public.leads WHERE id=p_id;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_delete_lead(text, uuid) TO anon, authenticated;

-- Auto-surface members lapsed 6+ months, owner-only, read-only view via RPC
-- (types explicitly cast to text -- final fixed form, matching the live
-- database's rbf_fix_lapsed_members_types follow-up migration)
CREATE OR REPLACE FUNCTION public.admin_list_lapsed_members(p_passcode text)
RETURNS TABLE(member_id text, name text, phone text, expiry_date text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.verify_owner_passcode(p_passcode) THEN RAISE EXCEPTION 'Access denied.'; END IF;
  RETURN QUERY SELECT m.member_id::text, m.name::text, m.phone::text, m.expiry_date::text FROM public.members m
    WHERE m.expiry_date IS NOT NULL AND m.expiry_date != '' AND (m.expiry_date::date) < (CURRENT_DATE - INTERVAL '180 days')
    ORDER BY m.expiry_date;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_lapsed_members(text) TO anon, authenticated;
