/*
# Package management, invoice payment method, gym brochure

## Packages
Locks the pre-existing packages table to owner-write / public-read, adds
admin_upsert_package and admin_delete_package for real CRUD from /villain.

## Payment method
billing.payment_method (Cash / UPI / Other) so staff can record how an
invoice was actually paid, not just that it was paid.

## Brochure
gym_settings gets brochure_url + brochure_updated_at; a new public
gym-documents storage bucket holds the actual PDF/image the owner uploads.
*/

REVOKE INSERT, UPDATE, DELETE ON TABLE public.packages FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_upsert_package(p_passcode text, p_id uuid, p_name text, p_duration_months integer, p_price integer, p_description text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  IF public.verify_admin_access(p_passcode) IS NULL THEN RAISE EXCEPTION 'Access denied.'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.packages (name, duration_months, price, description) VALUES (p_name, p_duration_months, p_price, p_description) RETURNING id INTO v_id;
  ELSE
    UPDATE public.packages SET name=p_name, duration_months=p_duration_months, price=p_price, description=p_description WHERE id=p_id;
    v_id := p_id;
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
  DELETE FROM public.packages WHERE id=p_id;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_delete_package(text, uuid) TO anon, authenticated;

ALTER TABLE public.billing ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'UPI';

INSERT INTO public.gym_settings (key, value) VALUES ('brochure_url','') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.gym_settings (key, value) VALUES ('brochure_updated_at','') ON CONFLICT (key) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('gym-documents', 'gym-documents', true, 10485760, ARRAY['application/pdf','image/jpeg','image/png'])
ON CONFLICT (id) DO NOTHING;
CREATE POLICY "public_read_documents" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'gym-documents');
CREATE POLICY "public_upload_documents" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'gym-documents');
CREATE POLICY "public_delete_documents" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'gym-documents');
