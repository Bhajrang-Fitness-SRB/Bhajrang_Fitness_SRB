/*
# Owner-only member vault access: view and reset passcodes

## What this adds
Two owner-gated functions that reach into ghost_vault, which otherwise stays
fully locked from anon: admin_get_member_vault (view a member's current
passcode, mobile, join date) and admin_reset_member_passcode (regenerate or
set a specific new passcode). This is the one deliberate door into
ghost_vault, and it requires the owner passcode specifically.

## Note on types
ghost_vault.member_id/passcode/mobile/join_date are varchar(50), not text.
RETURNS TABLE(... text) requires an explicit ::text cast on each column or
Postgres rejects it with "structure of query does not match function result
type" -- caught by testing before this was saved.
*/

CREATE OR REPLACE FUNCTION public.admin_get_member_vault(p_passcode text, p_member_id text)
RETURNS TABLE(member_id text, passcode text, mobile text, join_date text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF public.verify_admin_access(p_passcode) IS NULL THEN RAISE EXCEPTION 'Access denied.'; END IF;
  RETURN QUERY SELECT g.member_id::text, g.passcode::text, g.mobile::text, g.join_date::text
    FROM public.ghost_vault g WHERE g.member_id = upper(trim(p_member_id));
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_get_member_vault(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_reset_member_passcode(p_passcode text, p_member_id text, p_new_passcode text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_code text;
BEGIN
  IF public.verify_admin_access(p_passcode) IS NULL THEN RAISE EXCEPTION 'Access denied.'; END IF;
  v_code := coalesce(nullif(trim(p_new_passcode), ''), lpad((floor(random() * 10000))::text, 4, '0'));
  UPDATE public.ghost_vault SET passcode = v_code WHERE member_id = upper(trim(p_member_id));
  IF NOT FOUND THEN RAISE EXCEPTION 'No vault record for that member ID.'; END IF;
  RETURN v_code;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_reset_member_passcode(text, text, text) TO anon, authenticated;
