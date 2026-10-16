/*
# Package management: lock writes, add owner-gated CRUD RPCs

## Real bug found and fixed alongside this
`packages` had INSERT/UPDATE/DELETE fully open to anon -- anyone with the
public key could rewrite your prices. Locked to owner-only via RPC, SELECT
stays open (pricing needs to be readable everywhere a price is shown).

## Also: the app was never reading from this table
Every place that creates an invoice (approve_member calls, walk-in join,
renewal requests) had hardcoded prices (Monthly=1500, etc.) that did not
match the real prices already sitting in this table (Monthly=600,
Quarterly=2200, Half-Yearly=4600, Yearly=8200). The frontend change in this
same commit makes every one of those places fetch and use live prices
instead.
*/

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.packages FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_upsert_package(
  p_passcode text, p_id uuid, p_name text, p_duration_months integer, p_price integer, p_description text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  IF public.verify_admin_access(p_passcode) IS NULL THEN RAISE EXCEPTION 'Access denied.'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.packages (name, duration_months, price, description)
    VALUES (p_name, p_duration_months, p_price, p_description) RETURNING id INTO v_id;
  ELSE
    UPDATE public.packages SET name=p_name, duration_months=p_duration_months, price=p_price, description=p_description
    WHERE id = p_id RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_upsert_package(text, uuid, text, integer, integer, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_package(p_passcode text, p_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF public.verify_admin_access(p_passcode) IS NULL THEN RAISE EXCEPTION 'Access denied.'; END IF;
  DELETE FROM public.packages WHERE id = p_id;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_delete_package(text, uuid) TO anon, authenticated;
