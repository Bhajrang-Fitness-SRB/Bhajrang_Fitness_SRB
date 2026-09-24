/*
# Drop unused/superseded anon access

## Why
Brought in from the live database (applied directly, never saved as a
migration file). Two cleanups:

1. Remove DELETE capability that no legitimate code path ever uses.
   Confirmed by scanning src/App.tsx: zero .delete() calls target any of
   these tables.
2. Drop the open `anon_select_members` / `anon_select_billing` policies —
   now that admin_list_members / admin_list_billing (previous migration)
   exist as gated RPCs, the app no longer needs unrestricted table SELECT
   for these two tables.
*/

DROP POLICY IF EXISTS anon_delete_members ON public.members;
DROP POLICY IF EXISTS anon_delete_billing ON public.billing;
DROP POLICY IF EXISTS anon_delete_attendance ON public.attendance_logs;
DROP POLICY IF EXISTS anon_delete_expenses ON public.expenses;
DROP POLICY IF EXISTS anon_delete_packages ON public.packages;
DROP POLICY IF EXISTS anon_delete_ai_plans ON public.ai_plans;

-- notices and freeze_requests used bundled "ALL" policies (select+insert+update+delete
-- in one). Both are confirmed used for select/insert/update only — replace the single
-- ALL policy with three narrower ones so delete capability is dropped without touching
-- the operations the app actually performs.
DROP POLICY IF EXISTS anon_all_notices ON public.notices;
CREATE POLICY anon_select_notices ON public.notices FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY anon_insert_notices ON public.notices FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY anon_update_notices ON public.notices FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS anon_all_freeze ON public.freeze_requests;
CREATE POLICY anon_select_freeze ON public.freeze_requests FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY anon_insert_freeze ON public.freeze_requests FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY anon_update_freeze ON public.freeze_requests FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS anon_select_members ON public.members;
DROP POLICY IF EXISTS anon_select_billing ON public.billing;
