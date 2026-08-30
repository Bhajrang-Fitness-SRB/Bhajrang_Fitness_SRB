/*
# Health intake & goal fields for signup, plus a fix for a silent bug

## Purpose
The public /join signup form (and the older staff-assisted version) has
always tried to save a `goal` field to `pending_approvals`, but that column
never existed — every submission was silently failing with no error shown
to the applicant. This migration adds the missing column, plus the new
health/body-parameter fields requested for the expanded intake form, on
both `pending_approvals` (where new applications land) and `members`
(so the data survives approval).

It also redefines `approve_member` so these new fields are copied from the
approval record onto the created member — the previous version had an
explicit column list that didn't know about them.

## Changes
- `pending_approvals`: + goal, height_cm, weight_kg, medical_conditions, health_consent
- `members`: + goal, height_cm, weight_kg, medical_conditions
- `approve_member(...)`: now also copies goal/height_cm/weight_kg/medical_conditions
*/

ALTER TABLE public.pending_approvals
  ADD COLUMN IF NOT EXISTS goal text,
  ADD COLUMN IF NOT EXISTS height_cm numeric(5,1),
  ADD COLUMN IF NOT EXISTS weight_kg numeric(5,1),
  ADD COLUMN IF NOT EXISTS medical_conditions text,
  ADD COLUMN IF NOT EXISTS health_consent boolean NOT NULL DEFAULT false;

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS goal text,
  ADD COLUMN IF NOT EXISTS height_cm numeric(5,1),
  ADD COLUMN IF NOT EXISTS weight_kg numeric(5,1),
  ADD COLUMN IF NOT EXISTS medical_conditions text;

CREATE OR REPLACE FUNCTION public.approve_member(p_approval_id integer, p_package_name text, p_amount integer, p_package_months integer, p_discount integer DEFAULT 0, p_paid integer DEFAULT NULL::integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_approval  record;
  v_member_id text;
  v_expiry    date;
  v_passcode  text;
  v_net       integer;
  v_paid      integer;
BEGIN
  SELECT * INTO v_approval FROM public.pending_approvals WHERE id = p_approval_id AND status = 'PENDING';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending approval with id % (missing or already processed)', p_approval_id;
  END IF;

  v_member_id := 'SRB929' || lpad(nextval('public.member_id_seq')::text, 5, '0');
  v_expiry    := CURRENT_DATE + (p_package_months || ' months')::interval;
  v_passcode  := lpad((floor(random() * 10000))::text, 4, '0');
  v_net       := greatest(p_amount - coalesce(p_discount, 0), 0);
  v_paid      := coalesce(p_paid, v_net);

  INSERT INTO public.members
    (member_id, name, father_name, dob, gender, blood_group, govt_id, occupation,
     marital_status, phone, whatsapp, email, address, city, state, pin,
     gym_experience_years, profile_pic, joining_date, package, expiry_date,
     goal, height_cm, weight_kg, medical_conditions)
  VALUES
    (v_member_id, v_approval.name, v_approval.father_name, v_approval.dob, v_approval.gender,
     v_approval.blood_group, v_approval.govt_id, v_approval.occupation, v_approval.marital_status,
     v_approval.mobile, v_approval.whatsapp, v_approval.email, v_approval.address, v_approval.city,
     v_approval.state, v_approval.pin, v_approval.gym_experience_years, v_approval.photo_base64,
     CURRENT_DATE, p_package_name, v_expiry::text,
     v_approval.goal, v_approval.height_cm, v_approval.weight_kg, v_approval.medical_conditions);

  INSERT INTO public.ghost_vault (name, member_id, mobile, passcode, join_date)
  VALUES (v_approval.name, v_member_id, v_approval.mobile, v_passcode, CURRENT_DATE::text);

  INSERT INTO public.billing
    (member_id, package_name, amount, discount, paid, due, payment_date, expiry_date)
  VALUES
    (v_member_id, p_package_name, p_amount, coalesce(p_discount, 0), v_paid, greatest(v_net - v_paid, 0), CURRENT_DATE, v_expiry::text);

  UPDATE public.pending_approvals SET status = 'APPROVED' WHERE id = p_approval_id;
  RETURN v_member_id;
END;
$function$;
