/*
# Fix two defects introduced by the security-hardening migration

## 1. CRITICAL: crypt() unresolvable — all logins were broken
The hardening migration set `search_path = public` on verify_owner_passcode
and set_owner_passcode. Supabase installs pgcrypto into the `extensions`
schema, not `public`, so crypt() could not be resolved and every login
(owner, staff, and member) failed with "function crypt(text, text) does not
exist". Fixed by including `extensions` in the search_path, which keeps the
hardening benefit (explicit, non-mutable path) while resolving pgcrypto.

## 2. owner_credentials was readable and writable by anon
The table was created without revoking default privileges, so the anon role
retained SELECT/UPDATE/DELETE on the table holding the owner passcode hash —
meaning the hash could be read or the passcode silently overwritten. Revoked
entirely; the SECURITY DEFINER functions reach it with elevated rights and
do not need table grants.
*/

CREATE OR REPLACE FUNCTION public.verify_owner_passcode(p_passcode text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.owner_credentials
    WHERE id = true AND passcode_hash = crypt(coalesce(p_passcode, ''), passcode_hash)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_owner_passcode(p_current_passcode text, p_new_passcode text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.verify_owner_passcode(p_current_passcode) THEN
    RETURN false;
  END IF;
  IF p_new_passcode IS NULL OR length(trim(p_new_passcode)) < 4 THEN
    RAISE EXCEPTION 'New passcode must be at least 4 characters.';
  END IF;
  UPDATE public.owner_credentials
    SET passcode_hash = crypt(p_new_passcode, gen_salt('bf')), updated_at = now()
    WHERE id = true;
  RETURN true;
END;
$$;

REVOKE ALL ON TABLE public.owner_credentials FROM anon, authenticated;
REVOKE ALL ON TABLE public.ghost_vault FROM anon, authenticated;
REVOKE ALL ON TABLE public.staff FROM anon, authenticated;
REVOKE SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.pending_approvals FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.gym_settings FROM anon, authenticated;
