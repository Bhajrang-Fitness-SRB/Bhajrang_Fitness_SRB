-- Keeps the free-tier Swiss Ephemeris engine (Render) awake so Astro Master answers at once instead of after a ~1 minute cold start.
-- Reads the engine address from the encrypted Vault entry the Agent Hub already uses. /health needs no key and stores nothing.
-- To remove: select cron.unschedule('astro-engine-keepalive');
create or replace function public._astro_engine_ping() returns void
language plpgsql security definer set search_path = public, extensions, vault, net, pg_catalog as $$
declare u text;
begin
  select rtrim(decrypted_secret, '/') into u from vault.decrypted_secrets where name = 'hub_astro_engine_url';
  if u is not null and u ~ '^https://' then
    perform net.http_get(url := u || '/health', timeout_milliseconds := 30000);
  end if;
end $$;
revoke all on function public._astro_engine_ping() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'astro-engine-keepalive';
select cron.schedule('astro-engine-keepalive', '*/10 * * * *', $$select public._astro_engine_ping()$$);
