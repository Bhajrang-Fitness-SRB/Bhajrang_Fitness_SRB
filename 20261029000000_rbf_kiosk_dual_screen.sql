/*
# Kiosk dual screen: gym QR on the kiosk + manual entry with passcode

1. kiosk_gate_token(device_id): an APPROVED kiosk can show the same rotating gym QR that Admin > Gym QR shows,
   so the kiosk screen can have a scanner and the members' QR side by side. Not available to unapproved devices.
2. kiosk_manual_checkin(device_id, identifier, passcode): a member types Member ID OR mobile number + passcode at the kiosk.
   * Same attempt limit as the phone QR: 10 wrong tries in 10 minutes blocks that member for 10 minutes.
   * Extra limit per kiosk: 30 wrong tries in 10 minutes blocks the kiosk for 10 minutes (stops guessing mobile numbers).
   * Wrong ID, wrong mobile and wrong passcode all give the same message, so nobody can find out which IDs or mobiles exist.
   * A mobile number shared by two members only works for the one whose passcode matches.
   * Then it records check-in / check-out exactly like the kiosk scan (30 second double-scan guard, expired members get the renew notice).
Safe to run twice.
*/
alter table public.gate_scan_log add column if not exists device_id uuid;
create index if not exists gate_scan_log_device_idx on public.gate_scan_log (device_id, created_at desc) where device_id is not null;

create or replace function public.kiosk_gate_token(p_device_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare w bigint := public._gate_window(); g public.gate_settings;
begin
  if not exists (select 1 from public.kiosk_devices where device_id = p_device_id and approved = true) then
    raise exception 'Device not approved.';
  end if;
  update public.kiosk_devices set last_seen = now() where device_id = p_device_id;
  select * into g from public.gate_settings where id;
  return jsonb_build_object('token', public._gate_token(w), 'seconds_left', 60 - (extract(epoch from now())::bigint % 60),
    'location_set', g.latitude is not null, 'radius_ft', round((g.radius_m / 0.3048)::numeric, 0));
end; $$;

create or replace function public.kiosk_manual_checkin(p_device_id uuid, p_identifier text, p_passcode text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_in text := btrim(coalesce(p_identifier, ''));
  v_id text := upper(v_in);
  v_mob text := public._norm_mobile(v_in);
  v_cands text[]; v_ok text[]; c text; v_blocked boolean; res jsonb;
  v_bad constant jsonb := jsonb_build_object('ok', false, 'reason', 'bad_login', 'message', 'Member ID / mobile or passcode is not correct.');
begin
  if not exists (select 1 from public.kiosk_devices where device_id = p_device_id and approved = true) then
    raise exception 'Device not approved.';
  end if;
  update public.kiosk_devices set last_seen = now() where device_id = p_device_id;
  if v_in = '' or btrim(coalesce(p_passcode, '')) = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing', 'message', 'Enter your Member ID or mobile number, and your passcode.');
  end if;

  -- kiosk-wide limit
  if (select count(*) from public.gate_scan_log where device_id = p_device_id and not ok and created_at > now() - interval '10 minutes') >= 30 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_attempts', 'message', 'Too many wrong tries on this kiosk. Please wait 10 minutes, or ask the staff.');
  end if;

  -- who could this be? (Member ID, or a 10-digit mobile that matches phone / WhatsApp)
  select coalesce(array_agg(m.member_id), '{}') into v_cands from (
    select member_id from public.members
    where member_id = v_id
       or (length(v_mob) = 10 and (public._norm_mobile(phone) = v_mob or public._norm_mobile(whatsapp) = v_mob))
    limit 5) m;

  -- per-member limit
  foreach c in array v_cands loop
    select count(*) >= 10 into v_blocked from public.gate_scan_log where member_id = c and not ok and created_at > now() - interval '10 minutes';
    if v_blocked then
      return jsonb_build_object('ok', false, 'reason', 'too_many_attempts', 'message', 'Too many wrong tries for this member. Please wait 10 minutes, or ask the staff.');
    end if;
  end loop;

  v_ok := '{}';
  foreach c in array v_cands loop
    if public._member_pass_ok(c, p_passcode) then v_ok := v_ok || c; end if;
  end loop;

  if coalesce(array_length(v_ok, 1), 0) <> 1 then
    if coalesce(array_length(v_cands, 1), 0) = 0 then
      insert into public.gate_scan_log (device_id, ok, reason) values (p_device_id, false, 'bad_login');
    else
      foreach c in array v_cands loop
        insert into public.gate_scan_log (device_id, member_id, ok, reason) values (p_device_id, c, false, 'bad_login');
      end loop;
    end if;
    return v_bad;
  end if;

  res := public.kiosk_scan_device(p_device_id, v_ok[1]);
  insert into public.gate_scan_log (device_id, member_id, ok, reason) values (p_device_id, v_ok[1], true, 'kiosk_manual');
  return res || jsonb_build_object('ok', true);
end; $$;

revoke all on function public.kiosk_gate_token(uuid), public.kiosk_manual_checkin(uuid, text, text) from public;
grant execute on function public.kiosk_gate_token(uuid), public.kiosk_manual_checkin(uuid, text, text) to anon, authenticated;
