03_
import os
import json
from datetime import datetime
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('master_vault.env')

def backup_database():
    """
    Backs up Supabase database to local storage
    """
    try:
        # Initialize Supabase client
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_KEY")
        supabase = create_client(supabase_url, supabase_key)
        
        # Fetch data from key tables
        members = supabase.table('members').select("*").execute()
        billing = supabase.table('billing').select("*").execute()
        attendance = supabase.table('attendance_logs').select("*").execute()
        
        # Create backup directory
        backup_dir = "backups"
        os.makedirs(backup_dir, exist_ok=True)
        
        # Create timestamped backup file
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_file = f"{backup_dir}/backup_{timestamp}.json"
        
        # Save backup data
        backup_data = {
            "timestamp": timestamp,
            "members": members.data,
            "billing": billing.data,
            "attendance": attendance.data
        }
        
        with open(backup_file, 'w') as f:
            json.dump(backup_data, f, indent=2)
        
        print(f" Database backup created: {backup_file}")
        return backup_file
        
    except Exception as e:
        print(f" Backup failed: {e}")
        return None

if __name__ == "__main__":
    backup_database()
