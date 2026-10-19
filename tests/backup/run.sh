#!/usr/bin/env bash
# Backup/restore self-test. Needs PostgreSQL tools and two EMPTY scratch databases you can wipe:
#   SRC_URL=postgresql://postgres:pw@localhost:5432/src DST_URL=postgresql://postgres:pw@localhost:5432/dst tests/backup/run.sh
# (roles anon, authenticated, service_role must exist: create role anon nologin; ...)
set -euo pipefail
: "${SRC_URL:?}" "${DST_URL:?}"
cd "$(dirname "$0")/../.."
export BACKUP_PASSPHRASE='correct horse battery staple 42'
psql -q "$SRC_URL" <<'SQL'
create table public.members (member_id text primary key, name text); insert into public.members values ('RB001','Rahul'),('RB002','Priya');
create table public.expenses (id serial primary key, amount int); insert into public.expenses (amount) values (500),(1200);
alter table public.expenses enable row level security; revoke all on public.expenses from anon, authenticated;
SQL
OUT="$(mktemp -d)"; SUPABASE_DB_URL="$SRC_URL" scripts/backup/backup.sh "$OUT"; F="$(ls "$OUT"/*.enc)"
! grep -q Rahul "$F" || { echo "FAIL: readable data in backup"; exit 1; }
! BACKUP_PASSPHRASE=short SUPABASE_DB_URL="$SRC_URL" scripts/backup/backup.sh "$OUT" 2>/dev/null || { echo "FAIL: short passphrase accepted"; exit 1; }
! BACKUP_PASSPHRASE='wrong wrong wrong wrong wrong' CONFIRM=RESTORE scripts/backup/restore.sh "$F" "$DST_URL" 2>/dev/null || { echo "FAIL: wrong passphrase accepted"; exit 1; }
CONFIRM=RESTORE scripts/backup/restore.sh "$F" "$DST_URL" >/dev/null 2>&1
[ "$(psql -At "$DST_URL" -c 'select count(*) from public.members')" = 2 ] || { echo "FAIL: members not restored"; exit 1; }
[ "$(psql -At "$DST_URL" -c "select has_table_privilege('anon','public.expenses','select')")" = f ] || { echo "FAIL: lock-down lost"; exit 1; }
[ "$(psql -At "$DST_URL" -c "select relrowsecurity from pg_class where oid='public.expenses'::regclass")" = t ] || { echo "FAIL: RLS lost"; exit 1; }
echo "BACKUP TESTS PASSED"
