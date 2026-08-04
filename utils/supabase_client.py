import os
from dotenv import load_dotenv, find_dotenv

try:
    from supabase import create_client
except Exception:
    create_client = None

# Load environment variables (if present)
dotenv_path = find_dotenv('master_vault.env') or find_dotenv()
if dotenv_path:
    load_dotenv(dotenv_path)


def get_supabase_client():
    """Return a Supabase client if SUPABASE_URL and SUPABASE_KEY are configured, else None.

    This helper centralizes client creation and avoids import-time crashes when
    environment variables are missing or the supabase library is not installed.
    """
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_KEY')
    if not url or not key or create_client is None:
        return None
    try:
        return create_client(url, key)
    except Exception:
        return None
