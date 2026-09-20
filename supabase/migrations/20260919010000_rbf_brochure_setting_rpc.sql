/*
# Brochure setting RPC
admin_set_brochure lets the owner upload/replace/remove the gym brochure
(stored in the gym-documents bucket) and updates gym_settings accordingly.
*/
CREATE OR REPLACE FUNCTION public.admin_set_brochure(p_passcode text, p_url text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF public.verify_admin_access(p_passcode) IS NULL THEN RAISE EXCEPTION 'Access denied.'; END IF;
  INSERT INTO public.gym_settings (key, value) VALUES ('brochure_url', p_url) ON CONFLICT (key) DO UPDATE SET value = excluded.value;
  INSERT INTO public.gym_settings (key, value) VALUES ('brochure_updated_at', now()::text) ON CONFLICT (key) DO UPDATE SET value = excluded.value;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_set_brochure(text, text) TO anon, authenticated;
