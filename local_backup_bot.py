# Run this file locally on your PC (e.g., python local_backup_bot.py)
import os
import requests
from supabase import create_client

# Your credentials
SUPA_URL = "YOUR_SUPABASE_URL"
SUPA_KEY = "YOUR_SUPABASE_KEY"
supabase = create_client(SUPA_URL, SUPA_KEY)

BACKUP_DIR = "C:\\Bhajrang_Local_Vault"
os.makedirs(BACKUP_DIR, exist_ok=True)

print("Starting Local Sync...")
# Fetch approved records that have base64 images
res = supabase.table('pending_approvals').select('*').eq('status', 'approved').execute()

for record in res.data:
    mem_id = record.get('assigned_id')
    print(f"Backing up data for {mem_id}...")
    
    # Save Selfie
    if record.get('selfie_b64'):
        # Code to decode base64 and save to BACKUP_DIR/selfies/mem_id.jpg
        pass
        
    # Delete from cloud after backup to save space (Cut-Paste logic)
    # supabase.table('pending_approvals').delete().eq('id', record.get('id')).execute()

print("Local Backup Complete!")