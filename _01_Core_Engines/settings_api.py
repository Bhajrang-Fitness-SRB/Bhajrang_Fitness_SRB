# _01_Core_Engines/settings_api.py
from supabase import create_client
import os

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')


def get_settings():
    if not SUPABASE_URL or not SUPABASE_KEY:
        return {}
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    resp = supabase.table('settings').select('*').limit(1).execute()
    if resp.data:
        return resp.data[0]
    return {}


def set_settings(data):
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError('Supabase not configured')
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    # Upsert behavior
    resp = supabase.table('settings').upsert(data, on_conflict='id').execute()
    return resp
