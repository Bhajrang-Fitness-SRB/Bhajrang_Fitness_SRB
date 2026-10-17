/*
# Photo storage: mandatory selfie + member progress photos

## Buckets
- member-selfies: one compressed selfie per member, captured at signup
- progress-photos: transformation/progress photos members upload over time

## Security note
Both buckets are public (readable by anyone with the exact file URL). This
app has no per-user auth -- it's a shared-passcode model throughout -- so
this is the same tradeoff already accepted everywhere else, not a new one.
File names are random/unguessable, which is the mitigation in place.

## progress_photos table
Tracks each upload's URL, an optional note, and the date, per member.
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('member-selfies', 'member-selfies', true, 5242880, ARRAY['image/jpeg','image/png','image/webp']),
  ('progress-photos', 'progress-photos', true, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "public_read_selfies" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'member-selfies');
CREATE POLICY "public_upload_selfies" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'member-selfies');
CREATE POLICY "public_read_progress" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'progress-photos');
CREATE POLICY "public_upload_progress" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'progress-photos');

CREATE TABLE IF NOT EXISTS public.progress_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id text NOT NULL,
  photo_url text NOT NULL,
  note text,
  taken_at date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.progress_photos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON TABLE public.progress_photos TO anon, authenticated;
CREATE POLICY "anon_all_progress_photos" ON public.progress_photos FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
