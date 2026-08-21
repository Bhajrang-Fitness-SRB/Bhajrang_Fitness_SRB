import os
import base64
import logging
from datetime import datetime
from supabase import create_client
from dotenv import load_dotenv

load_dotenv("local_backup.env")

logger = logging.getLogger("local_backup")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

SUPA_URL = os.getenv("SUPABASE_URL")
SUPA_KEY = os.getenv("SUPABASE_KEY")

BACKUP_DIR = os.getenv("BACKUP_DIR", os.path.join(os.path.expanduser("~"), "Bhajrang_Local_Vault"))
SELFIE_DIR = os.path.join(BACKUP_DIR, "selfies")
SIGNATURE_DIR = os.path.join(BACKUP_DIR, "signatures")

def save_base64_image(b64_string: str, out_path: str) -> bool:
    """Decodes base64 strings and saves image files to local storage."""
    if not b64_string:
        return False
    try:
        if "," in b64_string and "base64" in b64_string:
            b64_string = b64_string.split(",", 1)[1]
        with open(out_path, "wb") as f:
            f.write(base64.b64decode(b64_string))
        return True
    except Exception as e:
        logger.warning(f"Could not decode base64 file for {out_path}: {e}")
        return False

def run_backup():
    if not SUPA_URL or not SUPA_KEY:
        logger.error("Missing SUPABASE_URL or SUPABASE_KEY in local_backup.env")
        return

    os.makedirs(SELFIE_DIR, exist_ok=True)
    os.makedirs(SIGNATURE_DIR, exist_ok=True)
    logger.info(f"Starting local backup to: {BACKUP_DIR}")

    try:
        supabase = create_client(SUPA_URL, SUPA_KEY)
        res = supabase.table('pending_approvals').select('*').eq('status', 'APPROVED').execute()
        records = res.data or []
    except Exception as e:
        logger.exception(f"Failed to fetch approved members for backup: {e}")
        return

    if not records:
        logger.info("No approved member records to backup.")
        return

    backed_up = 0
    for record in records:
        mem_id = record.get('original_frozen_id') or f"unassigned_{record.get('id')}"
        
        selfie_saved = save_base64_image(
            record.get('photo_base64'),
            os.path.join(SELFIE_DIR, f"{mem_id}.jpg")
        )
        sig_saved = save_base64_image(
            record.get('signature_b64'),
            os.path.join(SIGNATURE_DIR, f"{mem_id}.png")
        )

        if selfie_saved or sig_saved:
            backed_up += 1

    logger.info(f"✅ Local backup complete: {backed_up}/{len(records)} records synced.")

if __name__ == "__main__":
    run_backup()
