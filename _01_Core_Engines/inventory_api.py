# _01_Core_Engines/inventory_api.py
from supabase import create_client
import os

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')


def create_product(data):
    """Creates a product in `inventory` table
    data: {id, name, sku, category, brand, price, stock, expiry_date}
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError('Supabase not configured')
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    resp = supabase.table('inventory').insert(data).execute()
    return resp


def get_product(sku):
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError('Supabase not configured')
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    resp = supabase.table('inventory').select('*').eq('sku', sku).execute()
    return resp.data
