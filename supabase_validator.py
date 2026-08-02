# supabase_validator.py
import os
from dotenv import load_dotenv
from supabase import create_client

# Load environment variables
load_dotenv('master_vault.env')

# Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

def test_supabase_connection():
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print(" Supabase connection successful!")
        
        # Test query
        response = supabase.table('members').select("*").limit(1).execute()
        print(" Database query successful!")
        print(f"Sample data: {response.data}")
        
    except Exception as e:
        print(f" Supabase connection failed: {e}")

if __name__ == "__main__":
    test_supabase_connection()
