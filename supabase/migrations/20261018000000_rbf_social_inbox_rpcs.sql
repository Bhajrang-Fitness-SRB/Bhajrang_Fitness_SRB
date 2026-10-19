/*
# Owner Inbox - secure functions for the Social Sales Agent screen

The sa_* tables are private (no anon access). The Owner Inbox screen reads and updates them ONLY through
the functions below. Every one of them first checks the passcode with verify_admin_access() and requires
the OWNER role, exactly like admin_list_agent for the AI Night Agent.

Run AFTER 20261017000000_rbf_social_sales_agent.sql.
*/

-- Which messages were typed by a human (you) rather than the AI.
alter table public.sa_messages add column if not exists by_human boolean not null default false;

-- Internal guard. Not callable from the browser; only used inside the functions below.
create or replace function public.sa_require_owner(p_passcode text)
returns void language plpgsql security definer set search_path = public as $$
declare v jsonb := public.verify_admin_access(p_passcode);
begin
  if v is null or v->>'role' <> 'owner' then raise exception 'Only the owner can do this.'; end if;
end;
$$;
revoke all on function public.sa_require_owner(text) from public, anon, authenticated;

-- ------------------------------------------------------------------ inbox list
create or replace function public.admin_sa_inbox(p_passcode text, p_filter text default 'all', p_limit int default 60)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.sa_require_owner(p_passcode);
  return jsonb_build_object(
    'counts', jsonb_build_object(
      'needs_attention', (select count(*) from public.sa_conversations where needs_attention),
      'new_bookings',    (select count(*) from public.sa_bookings where status = 'NEW'),
      'draft_reminders', (select count(*) from public.sa_followups where status = 'DRAFT'),
      'hot',             (select count(*) from public.sa_conversations where stage = 'hot')
    ),
    'conversations', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.needs_attention desc, c.last_activity desc nulls last)
      from (
        select v.id, v.channel, v.external_id, v.display_name, v.lang, v.stage, v.interests, v.summary,
               v.human_takeover, v.needs_attention, v.attention_reason, v.opted_out, v.member_id,
               v.last_inbound_at, v.last_outbound_at,
               greatest(v.last_inbound_at, v.last_outbound_at, v.created_at) as last_activity,
               (select m.body      from public.sa_messages m where m.conversation_id = v.id order by m.created_at desc limit 1) as last_message,
               (select m.direction from public.sa_messages m where m.conversation_id = v.id order by m.created_at desc limit 1) as last_direction
        from public.sa_conversations v
        where case coalesce(p_filter, 'all')
                when 'attention' then v.needs_attention
                when 'takeover'  then v.human_takeover
                when 'hot'       then v.stage in ('hot', 'booked')
                when 'whatsapp'  then v.channel = 'whatsapp'
                when 'facebook'  then v.channel = 'facebook'
                when 'instagram' then v.channel = 'instagram'
                else true end
        order by v.needs_attention desc, greatest(v.last_inbound_at, v.last_outbound_at, v.created_at) desc nulls last
        limit least(greatest(coalesce(p_limit, 60), 1), 200)
      ) c
    ), '[]'::jsonb)
  );
end;
$$;

-- ------------------------------------------------------------------ one conversation
create or replace function public.admin_sa_thread(p_passcode text, p_conversation_id uuid, p_limit int default 100)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.sa_conversations;
begin
  perform public.sa_require_owner(p_passcode);
  select * into c from public.sa_conversations where id = p_conversation_id;
  if not found then raise exception 'Conversation not found.'; end if;
  return jsonb_build_object(
    'conversation', to_jsonb(c) || jsonb_build_object(
      'member_name', (select m.name from public.members m where m.member_id = c.member_id),
      'member_package', (select m.package from public.members m where m.member_id = c.member_id),
      'member_expiry', (select m.expiry_date from public.members m where m.member_id = c.member_id)),
    'window_open', coalesce(c.last_inbound_at > now() - interval '23 hours 55 minutes', false),
    'messages', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at asc, x.id asc)
      from (select id, direction, body, by_human, created_at from public.sa_messages
            where conversation_id = p_conversation_id order by created_at desc, id desc
            limit least(greatest(coalesce(p_limit, 100), 1), 300)) x
    ), '[]'::jsonb)
  );
end;
$$;

-- ------------------------------------------------------------------ change a conversation
-- Pass only what you want to change; NULL means "leave as is".
create or replace function public.admin_sa_set_conversation(
  p_passcode text, p_id uuid,
  p_human_takeover boolean default null, p_needs_attention boolean default null, p_stage text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public.sa_require_owner(p_passcode);
  if p_stage is not null and p_stage not in ('new','interested','hot','booked','customer','lost') then
    raise exception 'Unknown stage.';
  end if;
  update public.sa_conversations set
    human_takeover  = coalesce(p_human_takeover,  human_takeover),
    needs_attention = coalesce(p_needs_attention, needs_attention),
    attention_reason = case when p_needs_attention = false then null else attention_reason end,
    stage           = coalesce(p_stage, stage)
  where id = p_id;
  return found;
end;
$$;

-- ------------------------------------------------------------------ bookings
create or replace function public.admin_sa_bookings(p_passcode text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.sa_require_owner(p_passcode);
  return coalesce((
    select jsonb_agg(to_jsonb(b) order by (b.status = 'NEW') desc, b.created_at desc)
    from (select id, conversation_id, kind, customer_name, contact, channel, preferred_time, details, status, created_at
          from public.sa_bookings
          where status in ('NEW','CONFIRMED') or created_at > now() - interval '30 days'
          order by created_at desc limit 150) b
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_sa_set_booking(p_passcode text, p_id uuid, p_status text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public.sa_require_owner(p_passcode);
  if p_status not in ('NEW','CONFIRMED','DONE','CANCELLED') then raise exception 'Unknown status.'; end if;
  update public.sa_bookings set status = p_status where id = p_id;
  return found;
end;
$$;

-- ------------------------------------------------------------------ renewal reminders
create or replace function public.admin_sa_followups(p_passcode text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.sa_require_owner(p_passcode);
  return coalesce((
    select jsonb_agg(to_jsonb(f) order by (f.status = 'DRAFT') desc, f.created_at desc)
    from (select s.id, s.member_id, coalesce(m.name, s.member_id) as member_name, s.kind, s.expiry_date,
                 s.message, s.wa_link, s.status, s.error, s.created_at
          from public.sa_followups s left join public.members m on m.member_id = s.member_id
          where s.status <> 'SKIPPED' or s.created_at > now() - interval '7 days'
          order by (s.status = 'DRAFT') desc, s.created_at desc limit 120) f
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_sa_mark_followup(p_passcode text, p_id uuid, p_status text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public.sa_require_owner(p_passcode);
  if p_status not in ('SENT','SKIPPED') then raise exception 'Unknown status.'; end if;
  update public.sa_followups set status = p_status where id = p_id and status in ('DRAFT','FAILED');
  return found;
end;
$$;

-- ------------------------------------------------------------------ what the agent knows (edit from the app)
create or replace function public.admin_sa_knowledge(p_passcode text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.sa_require_owner(p_passcode);
  return coalesce((select jsonb_agg(to_jsonb(k) order by k.key) from (select key, title, content, updated_at from public.sa_knowledge) k), '[]'::jsonb);
end;
$$;

create or replace function public.admin_sa_set_knowledge(p_passcode text, p_key text, p_content text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public.sa_require_owner(p_passcode);
  p_content := left(coalesce(p_content, ''), 4000);
  if p_key = 'auto_send_followups' and lower(trim(p_content)) not in ('yes','no') then raise exception 'Use yes or no.'; end if;
  if p_key = 'default_language' and trim(p_content) not in ('en','bn','bn-roman') then raise exception 'Use en, bn or bn-roman.'; end if;
  update public.sa_knowledge set content = case when p_key in ('auto_send_followups') then lower(trim(p_content)) else p_content end,
                                 updated_at = now() where key = p_key;
  return found;
end;
$$;

-- Browser-callable ONLY through the passcode check inside each function (same pattern as admin_list_agent).
grant execute on function public.admin_sa_inbox(text, text, int)                          to anon, authenticated;
grant execute on function public.admin_sa_thread(text, uuid, int)                         to anon, authenticated;
grant execute on function public.admin_sa_set_conversation(text, uuid, boolean, boolean, text) to anon, authenticated;
grant execute on function public.admin_sa_bookings(text)                                  to anon, authenticated;
grant execute on function public.admin_sa_set_booking(text, uuid, text)                   to anon, authenticated;
grant execute on function public.admin_sa_followups(text)                                 to anon, authenticated;
grant execute on function public.admin_sa_mark_followup(text, uuid, text)                 to anon, authenticated;
grant execute on function public.admin_sa_knowledge(text)                                 to anon, authenticated;
grant execute on function public.admin_sa_set_knowledge(text, text, text)                 to anon, authenticated;
