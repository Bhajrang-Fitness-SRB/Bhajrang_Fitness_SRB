import os
import logging
from dotenv import load_dotenv, find_dotenv

logger = logging.getLogger("SupabaseClient")

try:
    from supabase import create_client
except Exception:
    logger.exception("Failed to import the 'supabase' package — check requirements.txt and Render's build logs for an install error.")
    create_client = None

# Load environment variables (if present)
dotenv_path = find_dotenv('master_vault.env') or find_dotenv()
if dotenv_path:
    load_dotenv(dotenv_path)


def get_supabase_client():
    """Return a Supabase client if SUPABASE_URL and SUPABASE_KEY are configured, else None.

    This helper centralizes client creation and avoids import-time crashes when
    environment variables are missing or the supabase library is not installed.
    Any failure is logged (not silently swallowed) so the real cause shows up in
    Render's Logs tab instead of a generic "supabase_not_configured" error.
    """
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_KEY')

    if create_client is None:
        logger.error("Supabase client unavailable — the 'supabase' package failed to import at startup.")
        return None
    if not url:
        logger.error("SUPABASE_URL is not set in the environment.")
        return None
    if not key:
        logger.error("SUPABASE_KEY is not set in the environment.")
        return None

    try:
        return create_client(url, key)
    except Exception:
        logger.exception("create_client(url, key) raised an exception — SUPABASE_URL/SUPABASE_KEY may be malformed.")
        return None
