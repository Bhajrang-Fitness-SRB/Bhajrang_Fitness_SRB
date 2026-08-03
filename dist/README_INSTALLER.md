# dist/README_INSTALLER.md
This installer bundle creates a portable copy of the application.

Usage:
- unzip app_bundle_YYYYMMDD_HHMMSS.zip
- cd app_bundle_YYYYMMDD_HHMMSS
- ./install.sh

Notes:
- After install, create a .env with required keys (SUPABASE_*, REDIS_*, etc.)
- For production, run behind gunicorn and a process manager. See README for detailed deploy steps.
