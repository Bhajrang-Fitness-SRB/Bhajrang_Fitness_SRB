#!/usr/bin/env bash
# Tests push-keys.sh with stand-in "supabase" and "gh" programs (nothing real is contacted).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; T="$(mktemp -d)"; cd "$T"
git init -q . && git config user.email t@t && git config user.name t
mkdir bin; export PATH="$T/bin:$PATH" LOG="$T/calls.log" ENVCOPY="$T/envfile.copy"
cat > bin/supabase <<'S'
#!/usr/bin/env bash
echo "supabase $*" >> "$LOG"; f=""; while [ $# -gt 0 ]; do [ "$1" = "--env-file" ] && f="$2"; shift; done; cp "$f" "$ENVCOPY"
S
cat > bin/gh <<'S'
#!/usr/bin/env bash
echo "gh $* <<< $(cat)" >> "$LOG"
S
chmod +x bin/*; echo "keys.env" > .gitignore
cat > keys.env <<'K'
# comment line
PROJECT_REF=abcdefghij
GITHUB_REPO=owner/repo
GEMINI_API_KEY=AIza-test-123
GROQ_API_KEY=
META_VERIFY_TOKEN=has=equals#and-hash
TELEGRAM_BOT_TOKEN="quoted-value"
SUPABASE_SERVICE_ROLE_KEY=should-be-skipped
SUPABASE_DB_URL=postgresql://postgres.x:p%40ss@host:5432/postgres
BACKUP_PASSPHRASE=twenty chars passphrase!!
VITE_SUPABASE_URL=https://x.supabase.co
K
fail(){ echo "FAIL: $*"; exit 1; }
OUT="$("$ROOT/scripts/keys/push-keys.sh" --dry-run 2>&1)"
[ ! -s "$LOG" ] || fail "dry run sent something"
for secret in AIza-test-123 'twenty chars' 'p%40ss' 'quoted-value'; do echo "$OUT" | grep -q "$secret" && fail "value printed: $secret"; done
echo "$OUT" | grep -q "Supabase secrets (3): GEMINI_API_KEY META_VERIFY_TOKEN TELEGRAM_BOT_TOKEN" || fail "supabase grouping: $OUT"
echo "$OUT" | grep -q "GitHub secrets   (2): SUPABASE_DB_URL BACKUP_PASSPHRASE" || fail "github grouping"
echo "$OUT" | grep -q "Render values    (1): VITE_SUPABASE_URL" || fail "render grouping"
OUT="$("$ROOT/scripts/keys/push-keys.sh" 2>&1)"
grep -q -- "--project-ref abcdefghij" "$LOG" || fail "project ref not passed"
grep -q "^GEMINI_API_KEY=AIza-test-123$" "$ENVCOPY" || fail "gemini missing"
grep -q "^META_VERIFY_TOKEN=has=equals#and-hash$" "$ENVCOPY" || fail "= and # in value broken"
grep -q '^TELEGRAM_BOT_TOKEN=quoted-value$' "$ENVCOPY" || fail "quotes not trimmed"
! grep -qE "GROQ|SERVICE_ROLE|SUPABASE_DB_URL|BACKUP|VITE|PROJECT_REF|GITHUB_REPO" "$ENVCOPY" || fail "wrong keys sent to Supabase"
grep -q "gh secret set SUPABASE_DB_URL --repo owner/repo <<< postgresql://postgres.x:p%40ss@host:5432/postgres" "$LOG" || fail "gh db url"
grep -q "gh secret set BACKUP_PASSPHRASE --repo owner/repo <<< twenty chars passphrase!!" "$LOG" || fail "gh passphrase"
echo "$OUT" | grep -q "Skipping SUPABASE_SERVICE_ROLE_KEY" || fail "reserved not skipped"
for secret in AIza-test-123 'twenty chars' 'p%40ss'; do echo "$OUT" | grep -q "$secret" && fail "value printed on real run"; done
[ "$(stat -c %a keys.env)" = 600 ] || fail "keys.env not chmod 600"
# tracked file is refused
git add -f keys.env; ! "$ROOT/scripts/keys/push-keys.sh" >/dev/null 2>&1 || fail "tracked keys.env accepted"; git rm -q --cached keys.env
# missing project ref is refused
sed -i '/PROJECT_REF/d' keys.env; ! "$ROOT/scripts/keys/push-keys.sh" >/dev/null 2>&1 || fail "missing PROJECT_REF accepted"
echo "KEYS TESTS PASSED"
