-- Run ONCE in the Supabase SQL editor, after deploying the functions.
-- 1) Replace YOUR_PROJECT_REF (Supabase > Project settings > General > Reference ID)
-- 2) Replace the long random text with your own secret, and set the SAME text as the
--    SOCIAL_CRON_SECRET function secret (see README step 4).

select vault.create_secret('PUT-A-LONG-RANDOM-SECRET-HERE', 'social_cron_secret');

-- Every day at 10:00 AM India time (04:30 UTC)
select cron.schedule(
  'social-followups-daily',
  '30 4 * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/social-followups',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-agent-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'social_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To stop it later:  select cron.unschedule('social-followups-daily');
