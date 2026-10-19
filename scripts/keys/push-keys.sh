#!/usr/bin/env bash
# Reads keys.env and sends every filled-in key to where it is used.
#   Supabase Edge Function Secrets  <- needs the Supabase CLI, logged in (supabase login)
#   GitHub Actions secrets          <- needs the GitHub CLI, logged in (gh auth login)
#   Render                          <- 2 public values; the script only prints them for you to paste
# Usage: scripts/keys/push-keys.sh [--dry-run] [path/to/keys.env]     (--dry-run shows names only, sends nothing)
set -euo pipefail
set +x
DRY=0; FILE=keys.env
for a in "$@"; do case "$a" in --dry-run) DRY=1;; *) FILE="$a";; esac; done
[ -f "$FILE" ] || { echo "No $FILE. Run: cp keys.env.example keys.env  and paste your keys." >&2; exit 2; }

# keys.env must never be committed
if git ls-files --error-unmatch "$FILE" >/dev/null 2>&1; then echo "STOP: $FILE is tracked by git. Run: git rm --cached $FILE" >&2; exit 3; fi
git check-ignore -q "$FILE" 2>/dev/null || echo "Warning: $FILE is not git-ignored here. Do not commit it." >&2
chmod 600 "$FILE" 2>/dev/null || true

SETUP_ONLY=" PROJECT_REF GITHUB_REPO "
GITHUB_NAMES=" SUPABASE_DB_URL BACKUP_PASSPHRASE "
RENDER_NAMES=" VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY "
# Supabase supplies these to functions itself and refuses to store them.
RESERVED=" SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY "

declare -A VAL; ORDER=()
while IFS= read -r line || [ -n "$line" ]; do
  [[ "$line" =~ ^[[:space:]]*# ]] && continue                          # comment lines only (values may contain #)
  [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=(.*)$ ]] || continue
  k="${BASH_REMATCH[1]}"; v="${BASH_REMATCH[2]}"
  v="${v#"${v%%[![:space:]]*}"}"; v="${v%"${v##*[![:space:]]}"}"       # trim
  v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"                   # optional quotes
  [ -n "$v" ] || continue                                              # blank = skip
  VAL[$k]="$v"; ORDER+=("$k")
done < "$FILE"

SB=(); GH=(); RD=()
for k in "${ORDER[@]}"; do
  if   [[ "$SETUP_ONLY" == *" $k "* ]]; then :
  elif [[ "$RESERVED"   == *" $k "* ]]; then echo "Skipping $k: Supabase provides it automatically." >&2
  elif [[ "$GITHUB_NAMES" == *" $k "* ]]; then GH+=("$k")
  elif [[ "$RENDER_NAMES" == *" $k "* ]]; then RD+=("$k")
  else SB+=("$k"); fi
done

echo "Supabase secrets (${#SB[@]}): ${SB[*]:-none}"
echo "GitHub secrets   (${#GH[@]}): ${GH[*]:-none}"
echo "Render values    (${#RD[@]}): ${RD[*]:-none}  <- paste these two in Render -> Environment yourself"
[ "$DRY" = 1 ] && { echo "(dry run: nothing sent)"; exit 0; }

if [ "${#SB[@]}" -gt 0 ]; then
  [ -n "${VAL[PROJECT_REF]:-}" ] || { echo "Set PROJECT_REF in $FILE first." >&2; exit 4; }
  TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT; chmod 600 "$TMP"
  for k in "${SB[@]}"; do printf '%s=%s\n' "$k" "${VAL[$k]}" >> "$TMP"; done
  supabase secrets set --env-file "$TMP" --project-ref "${VAL[PROJECT_REF]}"
fi
if [ "${#GH[@]}" -gt 0 ]; then
  [ -n "${VAL[GITHUB_REPO]:-}" ] || { echo "Set GITHUB_REPO in $FILE first." >&2; exit 4; }
  for k in "${GH[@]}"; do printf '%s' "${VAL[$k]}" | gh secret set "$k" --repo "${VAL[GITHUB_REPO]}"; done
fi
echo "Done. Secrets saved. Keep keys.env private, or delete it after use (re-fill it only when a key changes)."
