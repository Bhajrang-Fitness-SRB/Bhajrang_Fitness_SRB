/*
# Staff-checked CSV import of members
The old import wrote straight into the members table with the public key. That was refused (HTTP 401) every time, and its design
also reset the joining date of existing members to today whenever the CSV had no joining date.
admin_import_members(passcode, records):
  * staff or owner passcode required; at most 1000 rows per call
  * existing member (by member_id): ONLY the columns present in the row are changed; nothing else is touched
  * new member: needs name and phone; joining date defaults to today (India); a 4-digit login passcode is created and returned
  * phone numbers are cleaned to 10 digits; a number that belongs to a different member is refused
  * each row is independent: a bad row is reported and the good rows are still saved
Safe to run twice.
*/
create or replace function public.admin_import_members(p_passcode text, p_records jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  allowed text[] := array['name','phone','whatsapp','email','dob','gender','blood_group','marital_status','father_name','govt_id','occupation','address','city','state','pin','gym_experience_years','joining_date','package','expiry_date','goal','height_cm','weight_kg','medical_conditions'];
  rec jsonb; mid text; keys text[]; cols text; vals text; sets text; norm text; other text; pass text; today date := public._today_ist();
  clean jsonb; inserted int := 0; updated int := 0; failed jsonb := '[]'::jsonb; created jsonb := '[]'::jsonb; exists_row boolean; mname text;
begin
  if public.verify_admin_access(p_passcode) is null then raise exception 'Access denied.'; end if;
  if p_records is null or jsonb_typeof(p_records) <> 'array' then raise exception 'Send a list of members.'; end if;
  if jsonb_array_length(p_records) > 1000 then raise exception 'Too many rows (max 1000 at a time).'; end if;
  for rec in select value from jsonb_array_elements(p_records) loop
    mid := upper(btrim(coalesce(rec ->> 'member_id', '')));
    begin
      if mid = '' then raise exception 'member_id is missing'; end if;
      if length(mid) > 40 then raise exception 'member_id is too long'; end if;
      -- keep only known columns that actually have a value
      select coalesce(array_agg(k order by k), '{}') into keys from jsonb_object_keys(rec) k
        where k = any (allowed) and nullif(btrim(rec ->> k), '') is not null;
      if 'phone' = any (keys) then
        norm := public._norm_mobile(rec ->> 'phone');
        if norm !~ '^[6-9][0-9]{9}$' then raise exception 'phone must be a 10-digit mobile number'; end if;
        rec := jsonb_set(rec, '{phone}', to_jsonb(norm));
        select member_id into other from public.members where public._norm_mobile(phone) = norm and member_id <> mid limit 1;
        if other is not null then raise exception 'phone already belongs to member %', other; end if;
      end if;
      if 'whatsapp' = any (keys) then rec := jsonb_set(rec, '{whatsapp}', to_jsonb(public._norm_mobile(rec ->> 'whatsapp'))); end if;
      rec := jsonb_set(rec, '{member_id}', to_jsonb(mid));
      select exists (select 1 from public.members where member_id = mid) into exists_row;

      if exists_row then
        if array_length(keys, 1) is not null then
          clean := jsonb_build_object('member_id', mid) || coalesce((select jsonb_object_agg(k, rec -> k) from unnest(keys) k), '{}'::jsonb);
          select string_agg(quote_ident(k), ', '), string_agg('r.' || quote_ident(k), ', ') into cols, vals from unnest(keys) k;
          execute format('update public.members set (%s) = (select %s from jsonb_populate_record(null::public.members, $1) r) where member_id = $2', cols, vals) using clean, mid;
          if 'phone' = any (keys) then update public.ghost_vault set mobile = rec ->> 'phone' where member_id = mid; end if;
        end if;
        updated := updated + 1;
      else
        if nullif(btrim(rec ->> 'name'), '') is null then raise exception 'a new member needs a name'; end if;
        if not ('phone' = any (keys)) then raise exception 'a new member needs a phone number'; end if;
        if not ('joining_date' = any (keys)) then rec := rec || jsonb_build_object('joining_date', today::text); keys := array_append(keys, 'joining_date'); end if;
        clean := jsonb_build_object('member_id', mid) || coalesce((select jsonb_object_agg(k, rec -> k) from unnest(keys) k), '{}'::jsonb);
        select string_agg(quote_ident(k), ', '), string_agg('r.' || quote_ident(k), ', ') into cols, vals from unnest(keys) k;
        execute format('insert into public.members (member_id, %s) select r.member_id, %s from jsonb_populate_record(null::public.members, $1) r', cols, vals) using clean;
        pass := lpad((floor(random() * 10000))::int::text, 4, '0');
        mname := btrim(rec ->> 'name');
        insert into public.ghost_vault (name, member_id, mobile, passcode, join_date) values (mname, mid, rec ->> 'phone', pass, (rec ->> 'joining_date'));
        created := created || jsonb_build_object('member_id', mid, 'name', mname, 'phone', rec ->> 'phone', 'passcode', pass);
        inserted := inserted + 1;
      end if;
    exception when others then
      failed := failed || jsonb_build_object('member_id', nullif(mid, ''), 'error', left(sqlerrm, 200));
    end;
  end loop;
  return jsonb_build_object('inserted', inserted, 'updated', updated, 'failed', failed, 'created', created);
end; $$;
revoke all on function public.admin_import_members(text, jsonb) from public;
grant execute on function public.admin_import_members(text, jsonb) to anon, authenticated;
