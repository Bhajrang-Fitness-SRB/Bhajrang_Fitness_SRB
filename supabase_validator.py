import os
import sys
from dotenv import load_dotenv
from supabase import create_client, Client

# ANSI Colors for Sci-Fi Terminal Output
class Colors:
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    CYAN = '\033[96m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

# ১. Load Master Vault (.env)
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
VAULT_PATH = os.path.join(BASE_DIR, 'master_vault.env')

print(f"\n{Colors.CYAN}{Colors.BOLD}===================================================={Colors.ENDC}")
print(f"{Colors.CYAN}{Colors.BOLD}   🔱 SUPABASE ENV VALIDATOR & TABLE CHECKER 🔱   {Colors.ENDC}")
print(f"{Colors.CYAN}{Colors.BOLD}===================================================={Colors.ENDC}\n")

if not os.path.exists(VAULT_PATH):
    print(f"{Colors.FAIL}❌ ERROR: master_vault.env file not found at {VAULT_PATH}{Colors.ENDC}")
    sys.exit(1)

load_dotenv(VAULT_PATH)
print(f"{Colors.OKGREEN}✅ Master Vault (.env) Loaded Successfully.{Colors.ENDC}")

# ২. Check Env Variables
supa_url = os.getenv("SUPABASE_URL", "").strip()
supa_key = os.getenv("SUPABASE_KEY", "").strip()

if not supa_url or not supa_key:
    print(f"{Colors.FAIL}❌ CRITICAL ERROR: SUPABASE_URL or SUPABASE_KEY is missing in your .env file!{Colors.ENDC}")
    sys.exit(1)

if supa_url.endswith('/'):
    print(f"{Colors.WARNING}⚠️ WARNING: SUPABASE_URL ends with a slash (/). Stripping it to prevent 404 errors.{Colors.ENDC}")
    supa_url = supa_url.rstrip('/')

print(f"{Colors.OKGREEN}✅ Env Credentials Formatted Correctly.{Colors.ENDC}")

# ৩. Connect to Supabase
try:
    print(f"\n{Colors.CYAN}🔌 Attempting to connect to Cloud Database...{Colors.ENDC}")
    supabase: Client = create_client(supa_url, supa_key)
    print(f"{Colors.OKGREEN}✅ Connection Established!{Colors.ENDC}")
except Exception as e:
    print(f"{Colors.FAIL}❌ CONNECTION FAILED! Please check if your Project URL and API Key are valid.{Colors.ENDC}")
    print(f"Error Details: {str(e)}")
    sys.exit(1)

# ৪. Validate Required Tables
required_tables = ['members', 'ghost_vault', 'attendance_logs', 'billing']
print(f"\n{Colors.CYAN}🔍 Scanning Required Core Tables...{Colors.ENDC}")

missing_tables = 0

for table in required_tables:
    try:
        # We perform a select limit 1 to check if table exists and is accessible
        response = supabase.table(table).select("*").limit(1).execute()
        print(f"   {Colors.OKGREEN}[OK]{Colors.ENDC} Table '{table}' is LIVE and accessible.")
    except Exception as e:
        missing_tables += 1
        print(f"   {Colors.FAIL}[MISSING or ERROR]{Colors.ENDC} Table '{table}': {str(e)}")
        
print(f"\n{Colors.CYAN}{Colors.BOLD}===================================================={Colors.ENDC}")
if missing_tables == 0:
    print(f"{Colors.OKGREEN}{Colors.BOLD}🎉 ALL CLEAR! Supabase is 100% Ready for the Engine.{Colors.ENDC}")
else:
    print(f"{Colors.FAIL}{Colors.BOLD}⚠️ FOUND {missing_tables} TABLE ISSUE(S)!{Colors.ENDC}")
    print(f"{Colors.WARNING}Please go to Supabase Dashboard -> Table Editor and ensure these tables exist with correct columns.{Colors.ENDC}")
print(f"{Colors.CYAN}{Colors.BOLD}===================================================={Colors.ENDC}\n")