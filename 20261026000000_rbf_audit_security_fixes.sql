/*
# Audit fixes
1. kiosk_scan(member_id) had NO check: anyone with the public key could guess a member number (they are sequential) and get that
   member's name and selfie, and punch a fake check-in/out. The app only uses kiosk_scan_device (approved kiosks only), which calls
   kiosk_scan internally as the database owner, so public access to kiosk_scan is removed.
2. Four helper functions get a fixed search_path (a Supabase security warning).
3. kiosk_register_device: stops one person from filling the device list with junk (max 25 devices waiting for approval, name length capped).
Safe to run twice.
*/
revoke all on function public.kiosk_scan(text) from public, anon, authenticated;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname in ('_today_ist', '_norm_method', '_norm_mobile', 'hub_secret_allowed')
  loop execute format('alter function %s set search_path = public, pg_temp', r.sig); end loop;
end $$;

create or replace function public.kiosk_register_device(p_device_id uuid, p_device_name text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_approved boolean;
begin
  if not exists (select 1 from public.kiosk_devices where device_id = p_device_id)
     and (select count(*) from public.kiosk_devices where approved is not true) >= 25 then
    raise exception 'Too many devices are waiting for approval. Ask the owner to approve or remove some.';
  end if;
  insert into public.kiosk_devices (device_id, device_name)
  values (p_device_id, left(coalesce(nullif(btrim(p_device_name), ''), 'Unnamed device'), 60))
  on conflict (device_id) do update set last_seen = now()
  returning approved into v_approved;
  return v_approved;
end; $$;
revoke all on function public.kiosk_register_device(uuid, text) from public;
grant execute on function public.kiosk_register_device(uuid, text) to anon, authenticated;
