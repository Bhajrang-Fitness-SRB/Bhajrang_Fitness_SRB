-- Housekeeping: remove a leftover backup table of deleted test invoices.
drop table if exists public.billing_removed_backup;
