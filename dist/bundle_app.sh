#!/bin/bash
# dist/bundle_app.sh
# Creates a single installable bundle folder for the app
set -e
OUT=dist/app_bundle_$(date +%Y%m%d_%H%M%S)
mkdir -p $OUT
# Copy core app
rsync -av --exclude 'venv' --exclude 'node_modules' . $OUT/
# Create a simple installer script
cat > $OUT/install.sh <<'SH'
#!/bin/bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
echo "Create .env with required keys and run: python run.py"
SH
chmod +x $OUT/install.sh
zip -r ${OUT}.zip $OUT
echo "Created bundle: ${OUT}.zip"
