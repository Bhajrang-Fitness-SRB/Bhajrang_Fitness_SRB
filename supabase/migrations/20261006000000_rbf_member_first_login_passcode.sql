/*
# Mandatory first-login passcode setup for members

## What this adds
1. New `first_login_passcode_set` boolean flag on members table (defaults false)
2. New RPC `member_set_first_passcode(member_id, new_passcode)` to set it one-time
3. Constraint: Must be 4 digits, auto-updates ghost_vault record
4. After first login, user is forced to set custom passcode before accessing portal

## Logic
- On first login: member sees setup screen instead of portal
- They must enter 4-digit code
- System updates ghost_vault.passcode and sets flag to true
- On next login: normal portal access
*/

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS first_login_passcode_set boolean DEFAULT false;

CREATE OR REPLACE FUNCTION public.member_set_first_passcode(
  p_member_id text,
  p_new_passcode text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_code text;
BEGIN
  -- Validate: exactly 4 digits
  v_clean_code := trim(p_new_passcode);
  IF v_clean_code !~ '^\d{4}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Passcode must be exactly 4 digits.');
  END IF;

  -- Update ghost_vault with new passcode
  UPDATE public.ghost_vault
    SET passcode = v_clean_code
    WHERE member_id = upper(trim(p_member_id));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Member record not found.');
  END IF;

  -- Mark first_login_passcode_set as true
  UPDATE public.members
    SET first_login_passcode_set = true
    WHERE member_id = upper(trim(p_member_id));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Member not found.');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'member_id', upper(trim(p_member_id)),
    'message', 'Passcode successfully set. You can now log in with your new passcode.'
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.member_set_first_passcode(text, text) TO anon, authenticated;

-- Update verify_member_login to also return first_login_passcode_set flag
CREATE OR REPLACE FUNCTION public.verify_member_login(p_member_id text, p_passcode text)
RETURNS TABLE (
  member_id text,
  name text,
  phone text,
  whatsapp text,
  email text,
  dob text,
  gender text,
  blood_group text,
  marital_status text,
  father_name text,
  govt_id text,
  occupation text,
  address text,
  city text,
  state text,
  pin text,
  gym_experience text,
  medical_conditions text,
  profile_pic text,
  membership_tier text,
  package text,
  joining_date text,
  expiry_date text,
  first_login_passcode_set boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.ghost_vault
    WHERE member_id = upper(trim(p_member_id)) AND passcode = trim(p_passcode)
  ) THEN
    RETURN QUERY SELECT m.member_id, m.name, m.phone, m.whatsapp, m.email, m.dob, m.gender, m.blood_group, m.marital_status, 
                       m.father_name, m.govt_id, m.occupation, m.address, m.city, m.state, m.pin, m.gym_experience, 
                       m.medical_conditions, m.profile_pic, m.membership_tier, m.package, m.joining_date, m.expiry_date,
                       m.first_login_passcode_set
      FROM public.members m 
      WHERE m.member_id = upper(trim(p_member_id));
  END IF;
  RETURN;
END;
$$;
GRANT EXECUTE ON FUNCTION public.verify_member_login(text, text) TO anon, authenticated;
