#!/usr/bin/env bash
# Encrypted backup of the app's database (the "public" schema: members, billing, attendance, settings, hub data, functions, permissions).
# Needs: pg_dump, pg_restore, openssl, and two environment variables:
#   SUPABASE_DB_URL     Supabase "Session pooler" connection string (works from GitHub, which is IPv4-only)
#   BACKUP_PASSPHRASE   at least 20 characters; without it the backup can never be opened
# Usage: scripts/backup/backup.sh [output-folder]   (default ./backups)
set -euo pipefail
set +x

: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL (Supabase > Connect > Session pooler)}"
: "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE (20+ characters)}"
if [ "${#BACKUP_PASSPHRASE}" -lt 20 ]; then echo "BACKUP_PASSPHRASE is too short (need 20+ characters)." >&2; exit 2; fi

OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"
STAMP="$(TZ=Asia/Kolkata date +%Y%m%d-%H%M)"
RAW="$(mktemp)"; CHECK="$(mktemp)"
trap 'rm -f "$RAW" "$CHECK"' EXIT

# Privileges are KEPT on purpose: they hold the lock-down (who may read which table). Owners are dropped so it restores anywhere.
pg_dump "$SUPABASE_DB_URL" --format=custom --compress=9 --schema=public --no-owner --file="$RAW"

SIZE="$(stat -c %s "$RAW")"
TABLES="$(pg_restore --list "$RAW" | grep -c ' TABLE DATA ' || true)"
if [ "$SIZE" -lt 2000 ] || [ "$TABLES" -lt 1 ]; then
  echo "Backup looks empty or broken (size=$SIZE bytes, tables=$TABLES). Not saving it." >&2; exit 3
fi

OUT="$OUT_DIR/bhajrang-$STAMP.dump.enc"
openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -pass env:BACKUP_PASSPHRASE -in "$RAW" -out "$OUT"

# Prove the saved file opens with the passphrase and is a readable backup, before trusting it.
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:BACKUP_PASSPHRASE -in "$OUT" -out "$CHECK"
[ "$(pg_restore --list "$CHECK" | grep -c ' TABLE DATA ')" -eq "$TABLES" ] || { echo "Round-trip check failed." >&2; rm -f "$OUT"; exit 4; }

( cd "$OUT_DIR" && sha256sum "$(basename "$OUT")" > "$(basename "$OUT").sha256" )
MEMBERS="$(psql "$SUPABASE_DB_URL" -Atc 'select count(*) from public.members' 2>/dev/null || echo '?')"
echo "OK  $OUT  ($(stat -c %s "$OUT") bytes, $TABLES tables, $MEMBERS members at backup time)"
