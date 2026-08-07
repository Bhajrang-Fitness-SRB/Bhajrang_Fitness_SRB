import hashlib
from datetime import datetime


def generate_secret_passcode(dob):
    """
    Generates secret passcode based on date of birth.
    """
    dob_hash = hashlib.sha256(dob.encode()).hexdigest()
    passcode = dob_hash[:6].upper()
    return passcode


def validate_credentials(warrior_id, passcode):
    """
    Validates warrior credentials against the real ghost_vault table in Supabase.
    Returns True only if a matching member_id + passcode pair actually exists.
    """
    if not warrior_id or not passcode:
        return False

    try:
        from utils.supabase_client import get_supabase_client
        client = get_supabase_client()
        if not client:
            return False

        rows = (client.table('ghost_vault')
                .select('passcode')
                .eq('member_id', str(warrior_id).strip().upper())
                .limit(1)
                .execute().data)

        if not rows:
            return False

        return str(rows[0].get('passcode', '')).strip() == str(passcode).strip()
    except Exception:
        return False


def encrypt_passcode(passcode):
    """
    Encrypts passcode for secure storage.
    """
    return hashlib.sha256(passcode.encode()).hexdigest()
