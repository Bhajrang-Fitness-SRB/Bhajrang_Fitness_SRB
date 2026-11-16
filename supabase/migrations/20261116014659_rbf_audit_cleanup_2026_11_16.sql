-- Harden helper functions: pin search_path (advisor: function_search_path_mutable)
alter function public._safe_date(text)    set search_path = public, pg_catalog;
alter function public._ist_today()        set search_path = public, pg_catalog;
alter function public._last10(text)       set search_path = public, pg_catalog;
alter function public._short_name(text)   set search_path = public, pg_catalog;
alter function public._member_expiry(text) set search_path = public, pg_catalog;

-- Cover the two foreign keys flagged as unindexed
create index if not exists astro_readings_profile_id_idx on public.astro_readings (profile_id);
create index if not exists sa_bookings_conversation_id_idx on public.sa_bookings (conversation_id);

-- Remove the superseded packages backup (old package list, replaced by grouped packages; unused by the app)
drop table if exists public.packages_old_backup;
