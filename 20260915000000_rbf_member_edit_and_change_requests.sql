/*
# Member profile editing: staff-direct edits + member-requested changes

## What this adds
1. `profile_change_requests` — members propose edits, staff approve before they apply.
2. `member_request_profile_change()` — member-authenticated (ID + passcode). Filters
   the submitted JSON against an allow-list, so a member can never change their own
   member_id, package, expiry_date or joining_date even by crafting the request.
3. `admin_list_change_requests()` / `admin_resolve_change_request()` — staff review.
4. `admin_update_member()` — staff/owner direct edit of any member field.

## Note on column types
joining_date and dob are real `date` columns while expiry_date is `text`.
The date columns need an explicit ::date cast inside coalesce(), otherwise
Postgres raises "COALESCE types text and date cannot be matched" and every
edit fails. This file reflects the corrected, tested version.
*/

CREATE TABLE IF NOT EXISTS public.profile_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id text NOT NULL,
  changes jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  requested_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
ALTER TABLE public.profile_change_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.profile_change_requests FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.member_request_profile_change(
  p_member_id text, p_passcode text, p_changes jsonb
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_allowed text[] := ARRAY['name','phone','whatsapp','email','dob','gender','blood_group',
                            'marital_status','father_name','occupation','address','city','state','pin',
                            'height_cm','weight_kg','medical_conditions','goal','gym_experience_years'];
  v_clean jsonb := '{}'::jsonb;
  v_key text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ghost_vault WHERE member_id = upper(trim(p_member_id)) AND passcode = trim(p_passcode)) THEN
    RAISE EXCEPTION 'Access denied.';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_changes) LOOP
    IF v_key = ANY(v_allowed) THEN
      v_clean := v_clean || jsonb_build_object(v_key, p_changes -> v_key);
    END IF;
  END LOOP;
  IF v_clean = '{}'::jsonb THEN
    RAISE EXCEPTION 'No editable fields supplied.';
  END IF;
  INSERT INTO public.profile_change_requests (member_id, changes)
  VALUES (upper(trim(p_member_id)), v_clean);
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.member_request_profile_change(text, text, jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_change_requests(p_passcode text)
RETURNS SETOF public.profile_change_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF public.verify_admin_access(p_passcode) IS NULL THEN RAISE EXCEPTION 'Access denied.'; END IF;
  RETURN QUERY SELECT * FROM public.profile_change_requests WHERE status='PENDING' ORDER BY requested_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_change_requests(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_resolve_change_request(
  p_passcode text, p_request_id uuid, p_approve boolean
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_req record;
BEGIN
  IF public.verify_admin_access(p_passcode) IS NULL THEN RAISE EXCEPTION 'Access denied.'; END IF;
  SELECT * INTO v_req FROM public.profile_change_requests WHERE id = p_request_id AND status='PENDING';
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found or already handled.'; END IF;

  IF p_approve THEN
    UPDATE public.members m SET
      name       = coalesce(nullif(v_req.changes->>'name',''), m.name),
      phone      = coalesce(nullif(v_req.changes->>'phone',''), m.phone),
      whatsapp   = coalesce(nullif(v_req.changes->>'whatsapp',''), m.whatsapp),
      email      = coalesce(nullif(v_req.changes->>'email',''), m.email),
      dob        = coalesce(nullif(v_req.changes->>'dob','')::date, m.dob),
      gender     = coalesce(nullif(v_req.changes->>'gender',''), m.gender),
      blood_group= coalesce(nullif(v_req.changes->>'blood_group',''), m.blood_group),
      marital_status = coalesce(nullif(v_req.changes->>'marital_status',''), m.marital_status),
      father_name= coalesce(nullif(v_req.changes->>'father_name',''), m.father_name),
      occupation = coalesce(nullif(v_req.changes->>'occupation',''), m.occupation),
      address    = coalesce(nullif(v_req.changes->>'address',''), m.address),
      city       = coalesce(nullif(v_req.changes->>'city',''), m.city),
      state      = coalesce(nullif(v_req.changes->>'state',''), m.state),
      pin        = coalesce(nullif(v_req.changes->>'pin',''), m.pin),
      height_cm  = coalesce(nullif(v_req.changes->>'height_cm','')::numeric, m.height_cm),
      weight_kg  = coalesce(nullif(v_req.changes->>'weight_kg','')::numeric, m.weight_kg),
      medical_conditions = coalesce(nullif(v_req.changes->>'medical_conditions',''), m.medical_conditions),
      goal       = coalesce(nullif(v_req.changes->>'goal',''), m.goal),
      gym_experience_years = coalesce(nullif(v_req.changes->>'gym_experience_years',''), m.gym_experience_years)
    WHERE m.member_id = v_req.member_id;
  END IF;

  UPDATE public.profile_change_requests
    SET status = CASE WHEN p_approve THEN 'APPROVED' ELSE 'DECLINED' END, resolved_at = now()
    WHERE id = p_request_id;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_resolve_change_request(text, uuid, boolean) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_member(
  p_passcode text, p_member_id text, p_changes jsonb
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF public.verify_admin_access(p_passcode) IS NULL THEN RAISE EXCEPTION 'Access denied.'; END IF;
  UPDATE public.members m SET
    name       = coalesce(nullif(p_changes->>'name',''), m.name),
    phone      = coalesce(nullif(p_changes->>'phone',''), m.phone),
    whatsapp   = coalesce(nullif(p_changes->>'whatsapp',''), m.whatsapp),
    email      = coalesce(nullif(p_changes->>'email',''), m.email),
    dob        = coalesce(nullif(p_changes->>'dob','')::date, m.dob),
    gender     = coalesce(nullif(p_changes->>'gender',''), m.gender),
    blood_group= coalesce(nullif(p_changes->>'blood_group',''), m.blood_group),
    marital_status = coalesce(nullif(p_changes->>'marital_status',''), m.marital_status),
    father_name= coalesce(nullif(p_changes->>'father_name',''), m.father_name),
    govt_id    = coalesce(nullif(p_changes->>'govt_id',''), m.govt_id),
    occupation = coalesce(nullif(p_changes->>'occupation',''), m.occupation),
    address    = coalesce(nullif(p_changes->>'address',''), m.address),
    city       = coalesce(nullif(p_changes->>'city',''), m.city),
    state      = coalesce(nullif(p_changes->>'state',''), m.state),
    pin        = coalesce(nullif(p_changes->>'pin',''), m.pin),
    height_cm  = coalesce(nullif(p_changes->>'height_cm','')::numeric, m.height_cm),
    weight_kg  = coalesce(nullif(p_changes->>'weight_kg','')::numeric, m.weight_kg),
    medical_conditions = coalesce(nullif(p_changes->>'medical_conditions',''), m.medical_conditions),
    goal       = coalesce(nullif(p_changes->>'goal',''), m.goal),
    gym_experience_years = coalesce(nullif(p_changes->>'gym_experience_years',''), m.gym_experience_years),
    package    = coalesce(nullif(p_changes->>'package',''), m.package),
    joining_date = coalesce(nullif(p_changes->>'joining_date','')::date, m.joining_date),
    expiry_date  = coalesce(nullif(p_changes->>'expiry_date',''), m.expiry_date)
  WHERE m.member_id = p_member_id;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_update_member(text, text, jsonb) TO anon, authenticated;

-- Data fix: two members had expiry dates stored as DD-MM-YYYY instead of
-- YYYY-MM-DD, so the app read their memberships as expired.
UPDATE public.members SET expiry_date='2026-11-10' WHERE member_id='SRB92900004' AND expiry_date='10-11-2026';
UPDATE public.members SET expiry_date='2026-11-08' WHERE member_id='SRB92900003' AND expiry_date='08-11-2026';
