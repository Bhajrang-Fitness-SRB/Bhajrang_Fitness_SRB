/*
# Workout Plan Hub

## Design
Three tiers, exactly as specified:
- basic  : shown to every regular member automatically, no unlock needed.
- pt     : hidden from a member's app entirely unless the owner unlocks it
           for them (by assigning a PT plan, or via the explicit toggle).
- prep   : same as pt, but for competition-prep / bodybuilder clients.

Building/editing the exercise library and Basic plans is staff+owner work
(verify_admin_access). Creating or assigning anything tier=pt/prep is
owner-only (verify_owner_passcode) -- that's the "after my sanctions" gate
the owner asked for. Assigning a pt/prep plan automatically flips the
member's unlock flag, since the owner doing the assigning IS the sanction.

## Reads are RPC-gated, not raw table grants
Following the same fix applied earlier this session to members/billing:
exercises and plans are never exposed via open table SELECT. A member's
own workout (warrior_get_my_workout) is assembled server-side from
whatever tiers they're actually unlocked for, with full exercise detail
embedded, so the client never needs table access at all.

## GIF storage
New public bucket 'workout-gifs' for the owner/staff to upload their own
GIFs to (rather than hotlinking third-party content). Same open
read/upload/delete policy shape as every other bucket in this app
(member-selfies, gym-documents) -- this app has no per-user auth, so that
tradeoff is already accepted everywhere; access control lives in the
passcode-gated UI, not the storage policy.
*/

-- ── Storage ──────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('workout-gifs', 'workout-gifs', true, 8388608, ARRAY['image/gif','image/webp','image/jpeg','image/png'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "public_read_workout_gifs" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'workout-gifs');
CREATE POLICY "public_upload_workout_gifs" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'workout-gifs');
CREATE POLICY "public_delete_workout_gifs" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'workout-gifs');

-- ── Tables ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workout_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tier text NOT NULL DEFAULT 'basic' CHECK (tier IN ('basic','pt','prep')),
  category text,
  muscle_group text,
  equipment text,
  gif_url text,
  instructions text,
  posture_tips text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.workout_exercises ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.workout_exercises FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.workout_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tier text NOT NULL DEFAULT 'basic' CHECK (tier IN ('basic','pt','prep')),
  description text,
  -- structure: [{ day_number, day_label, exercises: [{ exercise_id, sets, reps, weight_direction, rest_seconds, notes }] }]
  structure jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.workout_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.workout_plans FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.workout_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id text NOT NULL,
  plan_id uuid NOT NULL REFERENCES public.workout_plans(id) ON DELETE CASCADE,
  tier text NOT NULL,
  assigned_by text,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.workout_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.workout_assignments FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.workout_logs (
  id bigserial PRIMARY KEY,
  member_id text NOT NULL,
  exercise_id uuid,
  plan_id uuid,
  day_number integer,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  sets_done integer,
  reps_done integer,
  weight_used numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.workout_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.workout_logs FROM anon, authenticated;

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS workout_pt_unlocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS workout_prep_unlocked boolean NOT NULL DEFAULT false;

-- ── Helper: does this passcode clear the bar for this tier? ────────────
CREATE OR REPLACE FUNCTION public._workout_tier_gate(p_passcode text, p_tier text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF p_tier = 'basic' THEN
    RETURN public.verify_admin_access(p_passcode) IS NOT NULL;
  ELSE
    RETURN public.verify_owner_passcode(p_passcode);
  END IF;
END;
$$;

-- ── Exercise library ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_upsert_exercise(
  p_passcode text, p_id uuid, p_name text, p_tier text, p_category text,
  p_muscle_group text, p_equipment text, p_gif_url text, p_instructions text, p_posture_tips text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_id uuid; v_old_tier text;
BEGIN
  IF p_id IS NOT NULL THEN
    SELECT tier INTO v_old_tier FROM public.workout_exercises WHERE id = p_id;
    IF v_old_tier IS NOT NULL AND NOT public._workout_tier_gate(p_passcode, v_old_tier) THEN
      RAISE EXCEPTION 'Access denied.';
    END IF;
  END IF;
  IF NOT public._workout_tier_gate(p_passcode, p_tier) THEN RAISE EXCEPTION 'Access denied.'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.workout_exercises (name, tier, category, muscle_group, equipment, gif_url, instructions, posture_tips)
    VALUES (p_name, p_tier, p_category, p_muscle_group, p_equipment, p_gif_url, p_instructions, p_posture_tips)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.workout_exercises SET name=p_name, tier=p_tier, category=p_category, muscle_group=p_muscle_group,
      equipment=p_equipment, gif_url=coalesce(p_gif_url, gif_url), instructions=p_instructions, posture_tips=p_posture_tips
    WHERE id = p_id;
    v_id := p_id;
  END IF;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_upsert_exercise(text,uuid,text,text,text,text,text,text,text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_exercises(p_passcode text, p_tier text)
RETURNS SETOF public.workout_exercises
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public._workout_tier_gate(p_passcode, p_tier) THEN RAISE EXCEPTION 'Access denied.'; END IF;
  RETURN QUERY SELECT * FROM public.workout_exercises WHERE tier = p_tier ORDER BY category, name;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_exercises(text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_exercise(p_passcode text, p_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_tier text;
BEGIN
  SELECT tier INTO v_tier FROM public.workout_exercises WHERE id = p_id;
  IF v_tier IS NULL THEN RETURN false; END IF;
  IF NOT public._workout_tier_gate(p_passcode, v_tier) THEN RAISE EXCEPTION 'Access denied.'; END IF;
  DELETE FROM public.workout_exercises WHERE id = p_id;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_delete_exercise(text,uuid) TO anon, authenticated;

-- ── Plans ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_upsert_workout_plan(
  p_passcode text, p_id uuid, p_name text, p_tier text, p_description text, p_structure jsonb, p_created_by text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_id uuid; v_old_tier text;
BEGIN
  IF p_id IS NOT NULL THEN
    SELECT tier INTO v_old_tier FROM public.workout_plans WHERE id = p_id;
    IF v_old_tier IS NOT NULL AND NOT public._workout_tier_gate(p_passcode, v_old_tier) THEN
      RAISE EXCEPTION 'Access denied.';
    END IF;
  END IF;
  IF NOT public._workout_tier_gate(p_passcode, p_tier) THEN RAISE EXCEPTION 'Access denied.'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.workout_plans (name, tier, description, structure, created_by)
    VALUES (p_name, p_tier, p_description, coalesce(p_structure, '[]'::jsonb), p_created_by)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.workout_plans SET name=p_name, tier=p_tier, description=p_description, structure=coalesce(p_structure, structure)
    WHERE id = p_id;
    v_id := p_id;
  END IF;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_upsert_workout_plan(text,uuid,text,text,text,jsonb,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_workout_plans(p_passcode text)
RETURNS SETOF public.workout_plans
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF public.verify_owner_passcode(p_passcode) THEN
    RETURN QUERY SELECT * FROM public.workout_plans ORDER BY tier, created_at DESC;
  ELSIF public.verify_admin_access(p_passcode) IS NOT NULL THEN
    RETURN QUERY SELECT * FROM public.workout_plans WHERE tier = 'basic' ORDER BY created_at DESC;
  ELSE
    RAISE EXCEPTION 'Access denied.';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_workout_plans(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_workout_plan(p_passcode text, p_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_tier text;
BEGIN
  SELECT tier INTO v_tier FROM public.workout_plans WHERE id = p_id;
  IF v_tier IS NULL THEN RETURN false; END IF;
  IF NOT public._workout_tier_gate(p_passcode, v_tier) THEN RAISE EXCEPTION 'Access denied.'; END IF;
  DELETE FROM public.workout_plans WHERE id = p_id;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_delete_workout_plan(text,uuid) TO anon, authenticated;

-- ── Assignment (assigning pt/prep IS the owner's sanction) ─────────────
CREATE OR REPLACE FUNCTION public.admin_assign_workout_plan(p_passcode text, p_member_id text, p_plan_id uuid, p_start_date date, p_assigned_by text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_tier text; v_id uuid; v_member text;
BEGIN
  SELECT tier INTO v_tier FROM public.workout_plans WHERE id = p_plan_id;
  IF v_tier IS NULL THEN RAISE EXCEPTION 'Plan not found.'; END IF;
  IF NOT public._workout_tier_gate(p_passcode, v_tier) THEN RAISE EXCEPTION 'Access denied.'; END IF;

  v_member := upper(trim(p_member_id));
  UPDATE public.workout_assignments SET active = false WHERE member_id = v_member AND tier = v_tier AND active = true;

  INSERT INTO public.workout_assignments (member_id, plan_id, tier, assigned_by, start_date)
  VALUES (v_member, p_plan_id, v_tier, p_assigned_by, coalesce(p_start_date, CURRENT_DATE))
  RETURNING id INTO v_id;

  IF v_tier = 'pt' THEN UPDATE public.members SET workout_pt_unlocked = true WHERE member_id = v_member; END IF;
  IF v_tier = 'prep' THEN UPDATE public.members SET workout_prep_unlocked = true WHERE member_id = v_member; END IF;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_assign_workout_plan(text,text,uuid,date,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_member_workout_tier(p_passcode text, p_member_id text, p_pt_unlocked boolean, p_prep_unlocked boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.verify_owner_passcode(p_passcode) THEN RAISE EXCEPTION 'Access denied.'; END IF;
  UPDATE public.members SET workout_pt_unlocked = p_pt_unlocked, workout_prep_unlocked = p_prep_unlocked WHERE member_id = upper(trim(p_member_id));
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_set_member_workout_tier(text,text,boolean,boolean) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_member_assignments(p_passcode text, p_member_id text)
RETURNS TABLE(id uuid, plan_id uuid, plan_name text, tier text, assigned_by text, start_date date, active boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF public.verify_admin_access(p_passcode) IS NULL THEN RAISE EXCEPTION 'Access denied.'; END IF;
  RETURN QUERY SELECT a.id, a.plan_id, p.name, a.tier, a.assigned_by, a.start_date, a.active
    FROM public.workout_assignments a JOIN public.workout_plans p ON p.id = a.plan_id
    WHERE a.member_id = upper(trim(p_member_id))
      AND (a.tier = 'basic' OR public.verify_owner_passcode(p_passcode))
    ORDER BY a.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_member_assignments(text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_workout_logs(p_passcode text, p_member_id text)
RETURNS SETOF public.workout_logs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF public.verify_admin_access(p_passcode) IS NULL THEN RAISE EXCEPTION 'Access denied.'; END IF;
  RETURN QUERY SELECT * FROM public.workout_logs WHERE member_id = upper(trim(p_member_id)) ORDER BY log_date DESC, created_at DESC LIMIT 200;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_workout_logs(text,text) TO anon, authenticated;

-- ── Client-facing: assembled, tier-filtered, credential-gated ────────
CREATE OR REPLACE FUNCTION public.warrior_get_my_workout(p_member_id text, p_passcode text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_member text; v_row public.members; v_result jsonb := '{}'::jsonb; v_plan record; v_tiers text[];
BEGIN
  v_member := upper(trim(p_member_id));
  IF NOT EXISTS (SELECT 1 FROM public.ghost_vault WHERE member_id = v_member AND passcode = trim(p_passcode)) THEN
    RAISE EXCEPTION 'Access denied.';
  END IF;
  SELECT * INTO v_row FROM public.members WHERE member_id = v_member;

  v_tiers := ARRAY['basic'];
  IF v_row.workout_pt_unlocked THEN v_tiers := v_tiers || 'pt'; END IF;
  IF v_row.workout_prep_unlocked THEN v_tiers := v_tiers || 'prep'; END IF;

  FOR v_plan IN
    SELECT p.id, p.name, p.tier, p.description, p.structure
    FROM public.workout_assignments a JOIN public.workout_plans p ON p.id = a.plan_id
    WHERE a.member_id = v_member AND a.active = true AND p.tier = ANY(v_tiers)
  LOOP
    v_result := v_result || jsonb_build_object(v_plan.tier, jsonb_build_object(
      'plan_id', v_plan.id, 'name', v_plan.name, 'description', v_plan.description,
      'days', (
        SELECT jsonb_agg(jsonb_build_object(
          'day_number', day->>'day_number', 'day_label', day->>'day_label',
          'exercises', (
            SELECT jsonb_agg(jsonb_build_object(
              'exercise_id', e.id, 'name', e.name, 'gif_url', e.gif_url, 'category', e.category,
              'muscle_group', e.muscle_group, 'instructions', e.instructions, 'posture_tips', e.posture_tips,
              'sets', ex->>'sets', 'reps', ex->>'reps', 'weight_direction', ex->>'weight_direction',
              'rest_seconds', ex->>'rest_seconds', 'notes', ex->>'notes'
            ))
            FROM jsonb_array_elements(day->'exercises') ex
            JOIN public.workout_exercises e ON e.id = (ex->>'exercise_id')::uuid
          )
        ))
        FROM jsonb_array_elements(v_plan.structure) day
      )
    ));
  END LOOP;

  RETURN jsonb_build_object('tiers_unlocked', to_jsonb(v_tiers), 'plans', v_result);
END;
$$;
GRANT EXECUTE ON FUNCTION public.warrior_get_my_workout(text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.warrior_log_workout(
  p_member_id text, p_passcode text, p_exercise_id uuid, p_plan_id uuid, p_day_number integer,
  p_sets_done integer, p_reps_done integer, p_weight_used numeric
)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_member text; v_id bigint;
BEGIN
  v_member := upper(trim(p_member_id));
  IF NOT EXISTS (SELECT 1 FROM public.ghost_vault WHERE member_id = v_member AND passcode = trim(p_passcode)) THEN
    RAISE EXCEPTION 'Access denied.';
  END IF;
  INSERT INTO public.workout_logs (member_id, exercise_id, plan_id, day_number, sets_done, reps_done, weight_used)
  VALUES (v_member, p_exercise_id, p_plan_id, p_day_number, p_sets_done, p_reps_done, p_weight_used)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.warrior_log_workout(text,text,uuid,uuid,integer,integer,integer,numeric) TO anon, authenticated;
