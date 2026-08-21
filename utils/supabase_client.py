import os
import logging
from supabase import create_client, Client

logger = logging.getLogger("supabase_client")

_supabase_client: Client | None = None

def get_supabase_client() -> Client | None:
    """Returns a singleton Supabase client instance using standard environment variables."""
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")

    if not url or not key:
        logger.warning("SUPABASE_URL or SUPABASE_KEY missing in environment.")
        return None

    try:
        _supabase_client = create_client(url, key)
        return _supabase_client
    except Exception as e:
        logger.exception(f"Failed to initialize Supabase client: {e}")
        return None
