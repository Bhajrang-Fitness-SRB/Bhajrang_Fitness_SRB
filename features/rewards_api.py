"""
features/rewards_api.py

Simple rewards/points API that stores points in Supabase 'rewards' table when available
Falls back to a local JSON master_data.json (in data/) when Supabase is not configured.
"""
import os
import json
from datetime import datetime
import logging

try:
    from supabase import create_client
except Exception:
    create_client = None

LOG = logging.getLogger(__name__)
DATA_FILE = os.path.join('data', 'master_data.json')
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')


def _load_local():
    if not os.path.exists(DATA_FILE):
        return {}
    with open(DATA_FILE,'r',encoding='utf-8') as f:
        return json.load(f)


def _save_local(data):
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    with open(DATA_FILE,'w',encoding='utf-8') as f:
        json.dump(data,f,indent=2)


def award_points(member_id, reason, points):
    rec = {'member_id':member_id,'reason':reason,'points':points,'ts':datetime.utcnow().isoformat()}
    if SUPABASE_URL and SUPABASE_KEY and create_client:
        try:
            client = create_client(SUPABASE_URL, SUPABASE_KEY)
            resp = client.table('rewards').insert(rec).execute()
            LOG.info('Awarded points to %s via Supabase', member_id)
            return True
        except Exception:
            LOG.exception('Supabase insert failed; falling back to local')
    # local fallback
    data = _load_local()
    data.setdefault('rewards',[]).append(rec)
    _save_local(data)
    LOG.info('Awarded points to %s locally', member_id)
    return True


def get_points_balance(member_id):
    total = 0
    if SUPABASE_URL and SUPABASE_KEY and create_client:
        try:
            client = create_client(SUPABASE_URL, SUPABASE_KEY)
            rows = client.table('rewards').select('points').eq('member_id', member_id).execute().data
            total = sum(r.get('points',0) for r in (rows or []))
            return total
        except Exception:
            LOG.exception('Supabase read failed; falling back to local')
    data = _load_local()
    for r in data.get('rewards',[]):
        if r.get('member_id')==member_id:
            total += int(r.get('points',0))
    return total


def redeem_points(member_id, sku, cost_points):
    # This is a simple redeem flow that appends a redemption record
    rec = {'member_id':member_id,'sku':sku,'points_spent':cost_points,'ts':datetime.utcnow().isoformat()}
    data = _load_local()
    data.setdefault('redemptions',[]).append(rec)
    _save_local(data)
    LOG.info('Redeemed points for %s locally', member_id)
    return True
