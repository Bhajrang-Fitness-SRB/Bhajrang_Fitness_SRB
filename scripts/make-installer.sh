#!/usr/bin/env bash
# Builds release/gym-software-installer.zip : a blank, branch-ready install kit.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=release/gym-software; rm -rf release; mkdir -p $OUT/app $OUT/database $OUT/functions
# 1. app, built generic ("My Gym") with neutral placeholder images
cp -r public /tmp/rbf_public_backup 2>/dev/null || true
python3 - <<'PY'
from PIL import Image, ImageDraw
import glob
for f in glob.glob('public/brand/*'):
    im = Image.open(f); w, h = im.size
    n = Image.new('RGB', (w, h), (15, 19, 32)); d = ImageDraw.Draw(n); r = min(w, h)//3; cx, cy = w//2, h//2
    d.ellipse([cx-r, cy-r, cx+r, cy+r], outline=(245, 196, 81), width=max(2, r//12)); d.rectangle([cx-r//2, cy-r//10, cx+r//2, cy+r//10], fill=(245, 196, 81))
    n.save(f)
PY
VITE_GYM_NAME="My Gym" npx vite build >/dev/null
rm -rf public && mv /tmp/rbf_public_backup public     # restore your real logo files
cp -r dist/. $OUT/app/
# 2. database: baseline + every migration + blank finish
{ for f in $(ls supabase/migrations/*.sql | sort); do echo "-- ===== $(basename $f) ====="; cat "$f"; echo; done; cat installer/blank-footer.sql; } > $OUT/database/install.sql
# 3. edge functions
cp -r supabase/functions/. $OUT/functions/
# generic names inside functions and SQL (setup.mjs swaps "My Gym" for the real name)
sed -i -E 's/SRB Bhajrang Fitness|Bhajrang Fitness|BHAJRANG FITNESS/My Gym/g; s/Team Bhajrang/Team My Gym/g; s/\bBhajrang\b/My Gym/g' $(grep -rlI -i bhajrang $OUT/functions $OUT/database || true)
# 4. setup + docs
cp installer/setup.mjs installer/INSTALL.md $OUT/
(cd release && zip -qr gym-software-installer.zip gym-software)
echo "Built: release/gym-software-installer.zip"
