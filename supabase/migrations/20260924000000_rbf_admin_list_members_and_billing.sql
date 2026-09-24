/*
# Owner/staff-gated member and billing listing RPCs

## Why
Brought in from the live database: this project was previously missing this
file even though the RPCs already exist in production. Recorded here so the
migration history matches what is actually deployed.

`anon_select_members` / `anon_select_billing` (open SELECT policies) are
dropped in the following migration once these gated RPCs replace them as the
app's read path.
*/

CREATE OR REPLACE FUNCTION public.admin_list_members(p_passcode text)
RETURNS SETOF members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if public.verify_admin_access(p_passcode) is null then
    raise exception 'Access denied.';
  end if;
  return query select * from public.members order by created_at desc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_billing(p_passcode text)
RETURNS SETOF billing
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if public.verify_admin_access(p_passcode) is null then
    raise exception 'Access denied.';
  end if;
  return query select * from public.billing order by created_at desc;
end;
$function$;
