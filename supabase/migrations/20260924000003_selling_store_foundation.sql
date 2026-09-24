/*
# /selling: a fully separate store-sales system

## Why this file exists
This was applied directly to the live database and never saved back to the
repo — it existed live but was completely missing from version control.
Recorded here now, copied verbatim from the deployed schema, with no gym
tables referenced anywhere: separate owner credential, separate staff table,
separate everything, by design.
*/

CREATE TABLE IF NOT EXISTS public.selling_owner_credentials (
  id boolean PRIMARY KEY DEFAULT true,
  passcode_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT selling_owner_single_row CHECK (id)
);
ALTER TABLE public.selling_owner_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.selling_owner_credentials FROM anon, authenticated;
INSERT INTO public.selling_owner_credentials (id, passcode_hash)
VALUES (true, crypt('293255', gen_salt('bf')))
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.verify_selling_owner(p_passcode text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.selling_owner_credentials WHERE id = true AND passcode_hash = crypt(coalesce(p_passcode,''), passcode_hash));
END;
$$;
GRANT EXECUTE ON FUNCTION public.verify_selling_owner(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_selling_owner_passcode(p_current_passcode text, p_new_passcode text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.verify_selling_owner(p_current_passcode) THEN RETURN false; END IF;
  IF p_new_passcode IS NULL OR length(trim(p_new_passcode)) < 4 THEN RAISE EXCEPTION 'New passcode must be at least 4 characters.'; END IF;
  UPDATE public.selling_owner_credentials SET passcode_hash = crypt(p_new_passcode, gen_salt('bf')), updated_at = now() WHERE id = true;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_selling_owner_passcode(text, text) TO anon, authenticated;

-- Salesperson accounts: self-signup, then owner must approve before login works.
CREATE TABLE IF NOT EXISTS public.selling_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL UNIQUE,
  passcode text NOT NULL,
  approved boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.selling_staff ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.selling_staff FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.selling_staff_signup(p_name text, p_phone text, p_passcode text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF length(trim(coalesce(p_passcode,''))) < 4 THEN RAISE EXCEPTION 'Passcode must be at least 4 characters.'; END IF;
  INSERT INTO public.selling_staff (name, phone, passcode, approved, active) VALUES (trim(p_name), trim(p_phone), trim(p_passcode), false, true);
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.selling_staff_signup(text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.verify_selling_staff_login(p_phone text, p_passcode text)
RETURNS TABLE(id uuid, name text, phone text, approved boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY SELECT s.id, s.name, s.phone, s.approved FROM public.selling_staff s
    WHERE s.phone = trim(p_phone) AND s.passcode = trim(p_passcode) AND s.active = true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.verify_selling_staff_login(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.selling_admin_list_staff(p_passcode text)
RETURNS SETOF public.selling_staff
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.verify_selling_owner(p_passcode) THEN RAISE EXCEPTION 'Access denied.'; END IF;
  RETURN QUERY SELECT * FROM public.selling_staff ORDER BY created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.selling_admin_list_staff(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.selling_admin_set_staff_status(p_passcode text, p_staff_id uuid, p_approved boolean, p_active boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.verify_selling_owner(p_passcode) THEN RAISE EXCEPTION 'Access denied.'; END IF;
  UPDATE public.selling_staff SET approved = p_approved, active = p_active WHERE id = p_staff_id;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.selling_admin_set_staff_status(text, uuid, boolean, boolean) TO anon, authenticated;

-- Product catalog
CREATE TABLE IF NOT EXISTS public.selling_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text,
  unit_size text,
  mrp integer NOT NULL DEFAULT 0,
  wholesale_price integer NOT NULL DEFAULT 0,
  distributor_price integer NOT NULL DEFAULT 0,
  purchase_cost integer NOT NULL DEFAULT 0,
  stock integer NOT NULL DEFAULT 0,
  reorder_threshold integer NOT NULL DEFAULT 5,
  image_url text,
  description text,
  benefits text,
  warnings text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.selling_products ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.selling_products TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.selling_products FROM anon, authenticated;
CREATE POLICY "public_read_selling_products" ON public.selling_products FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.selling_staff_upsert_product(p_staff_passcode text, p_phone text, p_id uuid, p_name text, p_category text, p_unit_size text, p_mrp integer, p_wholesale integer, p_distributor integer, p_stock integer, p_description text, p_benefits text, p_warnings text, p_image_url text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_id uuid; v_ok boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.selling_staff WHERE phone=trim(p_phone) AND passcode=trim(p_staff_passcode) AND approved=true AND active=true) INTO v_ok;
  IF NOT v_ok THEN RAISE EXCEPTION 'Access denied.'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.selling_products (name,category,unit_size,mrp,wholesale_price,distributor_price,stock,description,benefits,warnings,image_url)
    VALUES (p_name,p_category,p_unit_size,p_mrp,p_wholesale,p_distributor,coalesce(p_stock,0),p_description,p_benefits,p_warnings,p_image_url) RETURNING id INTO v_id;
  ELSE
    UPDATE public.selling_products SET name=p_name,category=p_category,unit_size=p_unit_size,mrp=p_mrp,wholesale_price=p_wholesale,distributor_price=p_distributor,stock=coalesce(p_stock,stock),description=p_description,benefits=p_benefits,warnings=p_warnings,image_url=coalesce(p_image_url,image_url) WHERE id=p_id;
    v_id := p_id;
  END IF;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.selling_staff_upsert_product(text,text,uuid,text,text,text,integer,integer,integer,integer,text,text,text,text) TO anon, authenticated;

-- Sales / invoices, with transparent (consented, at-time-of-sale) location
CREATE TABLE IF NOT EXISTS public.selling_sales (
  id serial PRIMARY KEY,
  sale_date date NOT NULL DEFAULT CURRENT_DATE,
  customer_name text NOT NULL,
  customer_mobile text,
  customer_address text,
  customer_photo_url text,
  location_lat numeric,
  location_lng numeric,
  sales_person text,
  sales_staff_id uuid,
  product_id uuid,
  product_name text,
  quantity integer NOT NULL DEFAULT 1,
  customer_tier text NOT NULL DEFAULT 'Retail',
  unit_price integer NOT NULL DEFAULT 0,
  gross_total integer NOT NULL DEFAULT 0,
  paid_amount integer NOT NULL DEFAULT 0,
  due_amount integer NOT NULL DEFAULT 0,
  payment_due_date date,
  payment_mode text NOT NULL DEFAULT 'Cash',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.selling_sales ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.selling_sales FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.selling_staff_record_sale(
  p_staff_passcode text, p_phone text, p_customer_name text, p_customer_mobile text, p_customer_address text,
  p_customer_photo_url text, p_location_lat numeric, p_location_lng numeric, p_product_id uuid, p_quantity integer,
  p_customer_tier text, p_unit_price integer, p_paid_amount integer, p_payment_due_date date, p_payment_mode text
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_staff record; v_product record; v_gross integer; v_due integer; v_id integer;
BEGIN
  SELECT * INTO v_staff FROM public.selling_staff WHERE phone=trim(p_phone) AND passcode=trim(p_staff_passcode) AND approved=true AND active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Access denied.'; END IF;
  SELECT * INTO v_product FROM public.selling_products WHERE id = p_product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found.'; END IF;
  v_gross := p_unit_price * p_quantity;
  v_due := greatest(0, v_gross - coalesce(p_paid_amount,0));
  INSERT INTO public.selling_sales (customer_name,customer_mobile,customer_address,customer_photo_url,location_lat,location_lng,
    sales_person,sales_staff_id,product_id,product_name,quantity,customer_tier,unit_price,gross_total,paid_amount,due_amount,payment_due_date,payment_mode)
  VALUES (p_customer_name,p_customer_mobile,p_customer_address,p_customer_photo_url,p_location_lat,p_location_lng,
    v_staff.name,v_staff.id,p_product_id,v_product.name,p_quantity,p_customer_tier,p_unit_price,v_gross,coalesce(p_paid_amount,0),v_due,p_payment_due_date,p_payment_mode)
  RETURNING id INTO v_id;
  UPDATE public.selling_products SET stock = greatest(0, stock - p_quantity) WHERE id = p_product_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.selling_staff_record_sale(text,text,text,text,text,text,numeric,numeric,uuid,integer,text,integer,integer,date,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.selling_staff_list_sales(p_staff_passcode text, p_phone text)
RETURNS SETOF public.selling_sales
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.selling_staff WHERE phone=trim(p_phone) AND passcode=trim(p_staff_passcode) AND approved=true AND active=true) THEN
    RAISE EXCEPTION 'Access denied.';
  END IF;
  RETURN QUERY SELECT * FROM public.selling_sales WHERE sales_person = (SELECT name FROM public.selling_staff WHERE phone=trim(p_phone)) ORDER BY created_at DESC LIMIT 100;
END;
$$;
GRANT EXECUTE ON FUNCTION public.selling_staff_list_sales(text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.selling_admin_list_sales(p_passcode text)
RETURNS SETOF public.selling_sales
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.verify_selling_owner(p_passcode) THEN RAISE EXCEPTION 'Access denied.'; END IF;
  RETURN QUERY SELECT * FROM public.selling_sales ORDER BY created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.selling_admin_list_sales(text) TO anon, authenticated;
