/*
# Exercise library becomes owner-only; seed a real starter set

## Why
The owner wants the raw exercise library (add/edit/delete an exercise's
name, GIF, instructions, posture cues) visible and editable by the owner
ONLY -- never staff. Staff should still be able to PICK from that library
by name/GIF when building a Basic-tier plan for a client, just not manage
the library itself.

The previous version gated exercise CRUD by the exercise's own `tier`
column (basic -> staff-or-owner, pt/prep -> owner-only), which meant a
'basic' exercise was staff-editable. That's the wrong axis now that the
owner wants ALL exercises owner-only regardless of which plan tier they
end up used in. This migration:
1. Locks admin_upsert_exercise / admin_delete_exercise / admin_list_exercises
   to verify_owner_passcode, full stop.
2. Adds exercise_picker_list(p_passcode) -- read-only, verify_admin_access
   (staff OR owner) -- so the Plan Builder can still show exercise names
   and GIFs to staff without exposing the management screen.
3. Seeds 25 well-established exercises across every major body part/style
   (push, pull, legs, core, posterior-chain/deadlift, supersets, cardio)
   with accurate form instructions and posture-correction notes. No GIFs
   are seeded -- see the reply in chat for why, this is a text-only seed.
*/

-- ── Re-gate exercise CRUD: owner-only, no more tier-based branching ────
DROP FUNCTION IF EXISTS public.admin_list_exercises(text, text);

CREATE OR REPLACE FUNCTION public.admin_upsert_exercise(
  p_passcode text, p_id uuid, p_name text, p_tier text, p_category text,
  p_muscle_group text, p_equipment text, p_gif_url text, p_instructions text, p_posture_tips text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.verify_owner_passcode(p_passcode) THEN RAISE EXCEPTION 'Access denied.'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.workout_exercises (name, tier, category, muscle_group, equipment, gif_url, instructions, posture_tips)
    VALUES (p_name, coalesce(p_tier, 'basic'), p_category, p_muscle_group, p_equipment, p_gif_url, p_instructions, p_posture_tips)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.workout_exercises SET name=p_name, category=p_category, muscle_group=p_muscle_group,
      equipment=p_equipment, gif_url=coalesce(p_gif_url, gif_url), instructions=p_instructions, posture_tips=p_posture_tips
    WHERE id = p_id;
    v_id := p_id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_exercises(p_passcode text)
RETURNS SETOF public.workout_exercises
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.verify_owner_passcode(p_passcode) THEN RAISE EXCEPTION 'Access denied.'; END IF;
  RETURN QUERY SELECT * FROM public.workout_exercises ORDER BY category, name;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_exercises(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_exercise(p_passcode text, p_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.verify_owner_passcode(p_passcode) THEN RAISE EXCEPTION 'Access denied.'; END IF;
  DELETE FROM public.workout_exercises WHERE id = p_id;
  RETURN true;
END;
$$;

-- ── Read-only picker: staff (or owner) building ANY tier of plan can
--    still see exercise names/GIFs, without the management screen ─────
CREATE OR REPLACE FUNCTION public.exercise_picker_list(p_passcode text)
RETURNS SETOF public.workout_exercises
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF public.verify_admin_access(p_passcode) IS NULL THEN RAISE EXCEPTION 'Access denied.'; END IF;
  RETURN QUERY SELECT * FROM public.workout_exercises WHERE active = true ORDER BY category, name;
END;
$$;
GRANT EXECUTE ON FUNCTION public.exercise_picker_list(text) TO anon, authenticated;

-- ── Seed a real starter library (text only -- no GIFs; see chat reply) ──
CREATE UNIQUE INDEX IF NOT EXISTS workout_exercises_name_uidx ON public.workout_exercises (lower(name));

INSERT INTO public.workout_exercises (name, tier, category, muscle_group, equipment, instructions, posture_tips) VALUES
('Push-Up', 'basic', 'Push', 'Chest, Shoulders, Triceps', 'Bodyweight',
  'Hands slightly wider than shoulders, body in one straight line from head to heels. Lower chest to just above the floor, elbows at about 45° from the torso, then press back up.',
  'Common fault: hips sagging or piking up. Fix: brace the core like you''re about to be punched in the stomach, squeeze the glutes throughout the rep.'),
('Incline Push-Up', 'basic', 'Push', 'Chest, Shoulders, Triceps', 'Bench or box',
  'Hands on a bench or box, body straight, lower chest toward the edge and press back up. Easier regression than a flat push-up.',
  'Keep the hips in line with the shoulders and ankles — don''t let them drop below the incline plane.'),
('Diamond Push-Up', 'basic', 'Push', 'Triceps, Chest', 'Bodyweight',
  'Hands together under the chest forming a diamond shape with thumbs and index fingers touching. Lower and press up, keeping elbows close to the body.',
  'Don''t flare the elbows out wide — keep them tracking back along the ribs to protect the shoulders.'),
('Barbell Bench Press', 'basic', 'Push', 'Chest, Shoulders, Triceps', 'Barbell, bench',
  'Feet flat on the floor, natural arch in the lower back, bar lowered to mid-chest with control, then pressed up over the shoulders.',
  'Common fault: bouncing the bar off the chest. Fix: pause briefly at the chest and drive up with control. Keep wrists straight, not bent back.'),
('Dumbbell Shoulder Press', 'basic', 'Push', 'Shoulders, Triceps', 'Dumbbells',
  'Seated or standing, dumbbells at shoulder height, press straight overhead until arms are extended, then lower with control.',
  'Avoid arching the lower back excessively to press the weight up — that means the load is too heavy. Keep the ribcage down.'),
('Overhead Triceps Extension', 'basic', 'Push', 'Triceps', 'Dumbbell or cable',
  'Hold the weight overhead with both hands, lower it behind the head by bending only at the elbow, then extend back up.',
  'Keep the upper arms still and close to the ears throughout — only the forearm should move.'),
('Pull-Up', 'basic', 'Pull', 'Back, Biceps', 'Pull-up bar',
  'Hang from the bar with an overhand grip, pull the chest toward the bar leading with the elbows, then lower with control to a full hang.',
  'Avoid kipping/swinging the legs for momentum on a strict pull-up. Fix: engage the core and pull in a straight vertical line.'),
('Lat Pulldown', 'basic', 'Pull', 'Back, Biceps', 'Cable machine',
  'Grip the bar wider than shoulder-width, pull it down to the upper chest while driving the elbows down and back, then control it back up.',
  'Don''t lean back excessively or use body momentum — keep the torso mostly upright and let the lats do the work.'),
('Seated Cable Row', 'basic', 'Pull', 'Back, Biceps', 'Cable machine',
  'Sit with knees slightly bent, pull the handle to the lower ribs while squeezing the shoulder blades together, then extend arms forward with control.',
  'Avoid rounding the lower back at the start of the pull — keep a neutral spine and initiate the row with the shoulder blades, not the arms.'),
('Bent-Over Barbell Row', 'basic', 'Pull', 'Back, Biceps', 'Barbell',
  'Hinge at the hips with a flat back, bar hanging below the shoulders, pull it to the lower ribs, then lower with control.',
  'Common fault: rounding the back to lift heavier. Fix: brace the core, keep the chest up, and reduce the weight if form breaks down.'),
('Dumbbell Bicep Curl', 'basic', 'Pull', 'Biceps', 'Dumbbells',
  'Elbows tucked at the sides, curl the dumbbells up toward the shoulders, squeeze at the top, then lower slowly.',
  'Don''t swing the weight up using the shoulders or lower back — isolate the movement to the elbow joint only.'),
('Bodyweight Squat', 'basic', 'Legs', 'Quads, Glutes, Hamstrings', 'Bodyweight',
  'Feet shoulder-width apart, sit the hips back and down until thighs are roughly parallel to the floor, then drive back up through the heels.',
  'Common fault: knees caving inward. Fix: actively push the knees out in line with the toes throughout the movement.'),
('Barbell Back Squat', 'basic', 'Legs', 'Quads, Glutes, Hamstrings', 'Barbell, rack',
  'Bar rests on the upper back, feet shoulder-width, descend by pushing the hips back and bending the knees, then drive up through the whole foot.',
  'Avoid letting the lower back round at the bottom ("butt wink"). Fix: brace the core hard before descending and only squat as deep as neutral spine allows.'),
('Walking Lunge', 'basic', 'Legs', 'Quads, Glutes', 'Bodyweight or dumbbells',
  'Step forward into a lunge until the back knee nearly touches the floor, front shin vertical, then push off to bring the back foot through into the next step.',
  'Keep the front knee tracking over the front foot, not caving inward or shooting past the toes excessively.'),
('Romanian Deadlift', 'basic', 'Legs', 'Hamstrings, Glutes, Lower back', 'Barbell or dumbbells',
  'Slight bend in the knees, hinge at the hips pushing them back while lowering the weight along the legs, feel a stretch in the hamstrings, then drive hips forward to stand.',
  'Common fault: rounding the lower back. Fix: keep the chest proud and the spine neutral — the movement is a hip hinge, not a spinal bend.'),
('Leg Press', 'basic', 'Legs', 'Quads, Glutes', 'Leg press machine',
  'Feet shoulder-width on the platform, lower the weight by bending the knees toward the chest, then press back up without locking the knees hard at the top.',
  'Don''t let the lower back round off the pad at the bottom of the movement — limit the range if that happens.'),
('Standing Calf Raise', 'basic', 'Legs', 'Calves', 'Bodyweight or machine',
  'Rise up onto the balls of the feet as high as possible, pause, then lower slowly until a stretch is felt in the calves.',
  'Control the lowering phase — dropping quickly skips most of the muscle-building stimulus.'),
('Plank', 'basic', 'Core', 'Core, Shoulders', 'Bodyweight',
  'Forearms on the floor, body in one straight line from head to heels, core braced, hold the position for time.',
  'Common fault: hips sagging or hiking up. Fix: imagine pulling the belly button toward the spine and squeezing the glutes.'),
('Bicycle Crunch', 'basic', 'Core', 'Abs, Obliques', 'Bodyweight',
  'Lying on the back, bring opposite elbow to opposite knee in a pedaling motion while the other leg extends straight.',
  'Avoid pulling on the neck with the hands — the hands support the head lightly, the core does the work.'),
('Hanging Leg Raise', 'basic', 'Core', 'Lower abs, Hip flexors', 'Pull-up bar',
  'Hang from the bar, raise the legs (straight or bent at the knee) up toward the chest with control, then lower slowly without swinging.',
  'Avoid using momentum/swinging to throw the legs up — control both the raise and the lowering phase equally.'),
('Russian Twist', 'basic', 'Core', 'Obliques, Abs', 'Bodyweight or weight plate',
  'Sit with knees bent and torso leaned back slightly, feet lifted or grounded, rotate the torso to touch the floor on each side.',
  'Rotate through the torso, not just swinging the arms — keep the movement controlled rather than fast and sloppy.'),
('Conventional Deadlift', 'basic', 'Full body / Posterior chain', 'Back, Glutes, Hamstrings', 'Barbell',
  'Feet hip-width, bar over mid-foot, hinge down keeping the back flat, grip the bar, then drive through the floor to stand tall, hips and shoulders rising together.',
  'The single most important cue: the back must stay flat/neutral throughout — this is a straight-set, heavy-loading movement, so form matters more here than almost anywhere else. If the back rounds, the weight is too heavy.'),
('Kettlebell Swing', 'basic', 'Full body / Posterior chain', 'Glutes, Hamstrings, Core', 'Kettlebell',
  'Hinge at the hips to swing the kettlebell back between the legs, then snap the hips forward explosively to swing it up to chest height, arms staying relaxed.',
  'This is a hip-hinge, not a squat and not a front-raise with the arms. Fix: think "snap the hips" — the arms are just along for the ride.'),
('Burpee', 'basic', 'Full body / Cardio', 'Full body', 'Bodyweight',
  'From standing, drop into a squat, place hands down, kick back into a plank (optionally add a push-up), jump feet back in, then explode up into a jump.',
  'Keep the core braced through the plank position so the lower back doesn''t sag — slow down the transitions if form starts breaking.'),
('Jumping Jacks', 'basic', 'Cardio', 'Full body', 'Bodyweight',
  'Jump feet out while raising arms overhead, then jump back to the starting position, repeating at a steady rhythm.',
  'Land softly with slightly bent knees each time rather than landing stiff-legged, to protect the knees and ankles.'),
('Mountain Climbers', 'basic', 'Cardio', 'Core, Shoulders, Legs', 'Bodyweight',
  'In a high plank position, drive knees alternately toward the chest at a running pace while keeping the hips low and stable.',
  'Don''t let the hips pop up into a piked position — keep them level with the shoulders throughout, like a moving plank.')
ON CONFLICT (lower(name)) DO NOTHING;
