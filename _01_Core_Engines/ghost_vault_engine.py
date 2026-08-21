import hmac
import hashlib
import logging
import os
from supabase import create_client

logger = logging.getLogger("ghost_vault")

def generate_secret_passcode(dob: str) -> str:
    """Generates 6-character hex passcode from date of birth (e.g. YYYY-MM-DD)."""
    dob_hash = hashlib.sha256(dob.strip().encode('utf-8')).hexdigest()
    return dob_hash[:6].upper()

def encrypt_passcode(passcode: str) -> str:
    """Encrypts passcode for secure DB storage."""
    return hashlib.sha256(passcode.strip().encode('utf-8')).hexdigest()

def validate_credentials(warrior_id: str, passcode: str, supabase_client=None) -> bool:
    """
    Validates warrior credentials against Supabase using constant-time comparison.
    """
    if not warrior_id or not passcode:
        return False

    try:
        if supabase_client:
            client = supabase_client
        else:
            url = os.getenv('SUPABASE_URL')
            key = os.getenv('SUPABASE_KEY')
            if not url or not key:
                logger.error("Supabase credentials missing.")
                return False
            client = create_client(url, key)

        clean_id = str(warrior_id).strip().upper()
        clean_pass = str(passcode).strip().upper()

        resp = (client.table('ghost_vault')
                .select('passcode')
                .eq('member_id', clean_id)
                .limit(1)
                .execute())

        rows = resp.data or []
        if not rows:
            return False

        stored_pass = str(rows[0].get('passcode', '')).strip().upper()
        return hmac.compare_digest(stored_pass, clean_pass)
    except Exception as e:
        logger.exception(f"Credential validation error for warrior {warrior_id}: {e}")
        return False
