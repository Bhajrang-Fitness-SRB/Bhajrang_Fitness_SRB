/*
# Kiosk scan RPC

## Why
Brought in from the live database (was applied directly, never saved as a
migration file in the repo). Single RPC the entrance kiosk calls: looks a
member up by ID and toggles their attendance for the day (check-in if none
open today, check-out if one is open).
*/

CREATE OR REPLACE FUNCTION public.kiosk_scan(p_member_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_member record;
  v_open record;
  v_action text;
begin
  select member_id, name, profile_pic, expiry_date into v_member
  from public.members where member_id = upper(trim(p_member_id)) limit 1;

  if not found then
    return jsonb_build_object('found', false);
  end if;

  select id, punch_out_time into v_open
  from public.attendance_logs
  where member_id = v_member.member_id
    and punch_in_time >= date_trunc('day', now())
    and punch_out_time is null
  order by punch_in_time desc limit 1;

  if found then
    update public.attendance_logs
      set punch_out_time = now(), status = 'CHECKED_OUT'
      where id = v_open.id;
    v_action := 'CHECK-OUT';
  else
    insert into public.attendance_logs (member_id, status)
    values (v_member.member_id, 'CHECKED_IN');
    v_action := 'CHECK-IN';
  end if;

  return jsonb_build_object(
    'found', true,
    'member_id', v_member.member_id,
    'name', v_member.name,
    'profile_pic', v_member.profile_pic,
    'action', v_action,
    'expired', (v_member.expiry_date is not null and v_member.expiry_date < current_date)
  );
end;
$function$;
