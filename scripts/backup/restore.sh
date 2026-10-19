#!/usr/bin/env bash
# Restore an encrypted backup made by backup.sh.
# SAFEST: restore into a NEW, empty Supabase project, check everything, then point the app at it.
# Usage: BACKUP_PASSPHRASE=... scripts/backup/restore.sh <file.dump.enc> <TARGET_DB_URL>
# The target database is OVERWRITTEN (tables with the same names are dropped and recreated). You must type RESTORE to continue.
set -euo pipefail
set +x
FILE="${1:?Usage: restore.sh <file.dump.enc> <TARGET_DB_URL>}"
TARGET="${2:?Give the TARGET database URL}"
: "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE}"
[ -f "$FILE" ] || { echo "File not found: $FILE" >&2; exit 2; }

if [ -f "$FILE.sha256" ]; then ( cd "$(dirname "$FILE")" && sha256sum -c "$(basename "$FILE").sha256" ) || { echo "File is damaged or changed." >&2; exit 3; }; fi

PLAIN="$(mktemp)"; trap 'rm -f "$PLAIN"' EXIT
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:BACKUP_PASSPHRASE -in "$FILE" -out "$PLAIN" 2>/dev/null \
  || { echo "Could not open the backup: wrong passphrase or damaged file." >&2; exit 4; }
pg_restore --list "$PLAIN" >/dev/null || { echo "Backup file is not readable." >&2; exit 5; }

HOST="$(printf '%s' "$TARGET" | sed -E 's#^[a-z]+://[^@]*@##; s#[/?].*$##')"
echo "About to OVERWRITE the database at: $HOST"
if [ "${CONFIRM:-}" != "RESTORE" ]; then read -r -p "Type RESTORE to continue: " ANS; [ "$ANS" = "RESTORE" ] || { echo "Cancelled."; exit 1; }; fi

# Errors about roles that do not exist on a non-Supabase target are normal; real data errors are shown.
pg_restore --no-owner --clean --if-exists --dbname="$TARGET" "$PLAIN" || echo "pg_restore finished with warnings (see above)."
echo "Restore done. Check: members count, a recent payment, then test a staff login."
