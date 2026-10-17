/*
# Gate approve_member behind admin passcode verification

## Why
The security hardening migration locked down ghost_vault, staff, and
pending_approvals from direct anon access, but approve_member itself was
still callable by anyone who knew (or guessed) an approval ID, with no
passcode check at all. This closes that gap by requiring the same
verify_admin_access check every other admin action now uses.
*/

CREATE OR REPLACE FUNCTION public.approve_member(
  p_passcode text, p_approval_id integer, p_package_name text, p_amount integer, p_package_months integer,
  p_discount integer DEFAULT 0, p_paid integer DEFAULT NULL::integer,
  p_joining_date date DEFAULT NULL, p_expiry_date date DEFAULT NULL
)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_approval  record;
  v_member_id text;
  v_join      date;
  v_expiry    date;
  v_passcode  text;
  v_net       integer;
  v_paid      integer;
BEGIN
  IF public.verify_admin_access(p_passcode) IS NULL THEN
    RAISE EXCEPTION 'Access denied.';
  END IF;

  SELECT * INTO v_approval FROM public.pending_approvals WHERE id = p_approval_id AND status = 'PENDING';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending approval with id % (missing or already processed)', p_approval_id;
  END IF;

  v_member_id := 'SRB929' || lpad(nextval('public.member_id_seq')::text, 5, '0');
  v_join      := coalesce(p_joining_date, CURRENT_DATE);
  v_expiry    := coalesce(p_expiry_date, v_join + (p_package_months || ' months')::interval);
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
     v_join, p_package_name, v_expiry::text,
     v_approval.goal, v_approval.height_cm, v_approval.weight_kg, v_approval.medical_conditions);

  INSERT INTO public.ghost_vault (name, member_id, mobile, passcode, join_date)
  VALUES (v_approval.name, v_member_id, v_approval.mobile, v_passcode, v_join::text);

  INSERT INTO public.billing
    (member_id, package_name, amount, discount, paid, due, payment_date, expiry_date)
  VALUES
    (v_member_id, p_package_name, p_amount, coalesce(p_discount, 0), v_paid, greatest(v_net - v_paid, 0), v_join, v_expiry::text);

  UPDATE public.pending_approvals SET status = 'APPROVED' WHERE id = p_approval_id;
  RETURN v_member_id;
END;
$function$;
