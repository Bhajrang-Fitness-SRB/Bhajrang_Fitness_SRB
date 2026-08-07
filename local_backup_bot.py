r"""
Run this file locally on your PC to back up member photos/signatures
from Supabase to a local folder.

Setup (one-time):
  1. pip install supabase python-dotenv
  2. Create a file named `local_backup.env` in this same folder with:
       SUPABASE_URL=https://qcabkhhbcdjyefbwzexj.supabase.co
       SUPABASE_KEY=your-service-or-anon-key-here
       BACKUP_DIR=C:\Bhajrang_Local_Vault      (optional, has a default)

Run:
  python local_backup_bot.py
"""
import os
import base64
import datetime
from supabase import create_client
from dotenv import load_dotenv

load_dotenv("local_backup.env")

SUPA_URL = os.getenv("SUPABASE_URL")
SUPA_KEY = os.getenv("SUPABASE_KEY")

if not SUPA_URL or not SUPA_KEY:
    raise SystemExit(
        "❌ Missing credentials. Create a 'local_backup.env' file next to this script "
        "with SUPABASE_URL and SUPABASE_KEY set (see the instructions at the top of this file)."
    )

supabase = create_client(SUPA_URL, SUPA_KEY)

BACKUP_DIR = os.getenv("BACKUP_DIR", os.path.join(os.path.expanduser("~"), "Bhajrang_Local_Vault"))
SELFIE_DIR = os.path.join(BACKUP_DIR, "selfies")
SIGNATURE_DIR = os.path.join(BACKUP_DIR, "signatures")
os.makedirs(SELFIE_DIR, exist_ok=True)
os.makedirs(SIGNATURE_DIR, exist_ok=True)


def save_base64_image(b64_string, out_path):
    """Decodes a base64 image string (with or without a data: URI prefix) and writes it to disk."""
    if not b64_string:
        return False
    try:
        if "," in b64_string and b64_string.strip().startswith("data:"):
            b64_string = b64_string.split(",", 1)[1]
        with open(out_path, "wb") as f:
            f.write(base64.b64decode(b64_string))
        return True
    except Exception as e:
        print(f"   ⚠️ Could not decode/save image: {e}")
        return False


def main():
    print(f"Starting Local Sync → backing up into: {BACKUP_DIR}")

    # Field names matched to the real schema used in master_engine.py:
    # status is stored uppercase as "APPROVED", and the assigned member ID
    # is stored in `original_frozen_id`, not `assigned_id`.
    res = supabase.table('pending_approvals').select('*').eq('status', 'APPROVED').execute()

    if not res.data:
        print("No approved records found to back up.")
        return

    backed_up = 0
    for record in res.data:
        mem_id = record.get('original_frozen_id') or f"unassigned_{record.get('id')}"
        name = record.get('name', 'Unknown')
        print(f"Backing up data for {mem_id} ({name})...")

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

    print(f"✅ Local Backup Complete! {backed_up}/{len(res.data)} records backed up to {BACKUP_DIR}")
    print(f"   Finished at {datetime.datetime.now().isoformat()}")


if __name__ == "__main__":
    main()
