import os
import logging
from supabase import create_client

logger = logging.getLogger("inventory_api")

_supabase_client = None

def _get_client():
    global _supabase_client
    if _supabase_client is None:
        url = os.getenv('SUPABASE_URL')
        key = os.getenv('SUPABASE_KEY')
        if not url or not key:
            raise RuntimeError('Supabase environment variables not configured.')
        _supabase_client = create_client(url, key)
    return _supabase_client

def create_product(data: dict) -> dict:
    """Creates or updates a product in the inventory table."""
    try:
        supabase = _get_client()
        resp = supabase.table('inventory').upsert(data, on_conflict='sku').execute()
        return {"success": True, "data": resp.data}
    except Exception as e:
        logger.exception(f"Error creating product SKU {data.get('sku')}: {e}")
        return {"success": False, "error": str(e)}

def get_product(sku: str) -> dict | None:
    """Retrieves product details by SKU."""
    try:
        supabase = _get_client()
        resp = supabase.table('inventory').select('*').eq('sku', sku.strip()).execute()
        return resp.data[0] if resp.data else None
    except Exception as e:
        logger.exception(f"Error fetching product SKU {sku}: {e}")
        return None
