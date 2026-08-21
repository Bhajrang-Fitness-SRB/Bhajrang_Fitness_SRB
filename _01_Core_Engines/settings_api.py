import os
import logging
from supabase import create_client

logger = logging.getLogger("settings_api")

_client = None

def _get_client():
    global _client
    if _client is None:
        url = os.getenv('SUPABASE_URL')
        key = os.getenv('SUPABASE_KEY')
        if not url or not key:
            return None
        _client = create_client(url, key)
    return _client

def get_settings() -> dict:
    client = _get_client()
    if not client:
        logger.warning("Supabase client unavailable; returning default settings.")
        return {"gym_name": "Bhajrang Fitness SRB", "theme": "warrior_gold"}
    try:
        resp = client.table('settings').select('*').limit(1).execute()
        return resp.data[0] if resp.data else {}
    except Exception as e:
        logger.exception(f"Error reading system settings: {e}")
        return {}

def set_settings(data: dict) -> dict:
    client = _get_client()
    if not client:
        raise RuntimeError('Supabase not configured in environment.')
    try:
        resp = client.table('settings').upsert(data, on_conflict='id').execute()
        return {"success": True, "data": resp.data}
    except Exception as e:
        logger.exception(f"Error saving system settings: {e}")
        return {"success": False, "error": str(e)}
