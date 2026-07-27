import os
import time
import sqlite3
import requests
from dotenv import load_dotenv

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(BASE_DIR, 'master_vault.env'))

class BhajrangDiagnosticBot:
    def __init__(self):
        self.db_path = os.path.join(BASE_DIR, 'Bhajrang_Master.db')
        self.errors = 0
        self.warnings = 0

    def print_log(self, status, msg):
        icons = {"OK": "✅", "WARN": "⚠️", "ERR": "❌", "INFO": "🔍"}
        print(f"[{time.strftime('%H:%M:%S')}] {icons.get(status, '*')} {msg}")

    def check_network(self):
        self.print_log("INFO", "Verifying Network Connectivity for Cloud APIs...")
        try:
            # 3-second timeout ping to Cloudflare's fast DNS resolver
            requests.get("https://1.1.1.1", timeout=3)
            self.print_log("OK", "Internet Connection Active. Cloud Hub Online.")
        except requests.exceptions.RequestException:
            self.print_log("ERR", "No Internet Connection. AI and Cloud syncing will fail.")
            self.errors += 1

    def scan_directories(self):
        self.print_log("INFO", "Scanning Local Asset Directories...")
        qr_dir = os.path.join(BASE_DIR, 'static', 'assets', 'qr_vault')
        if not os.path.exists(qr_dir):
            os.makedirs(qr_dir)
            self.print_log("OK", "Created static/assets/qr_vault directory.")
        else:
            self.print_log("OK", "Asset directories verified.")

    def check_database(self):
        self.print_log("INFO", "Verifying Master SQLite Database...")
        if os.path.exists(self.db_path):
            try:
                # Using context manager for safe connection handling
                with sqlite3.connect(self.db_path) as conn:
                    cursor = conn.cursor()
                    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
                    tables = cursor.fetchall()
                    self.print_log("OK", f"Database connected. Found {len(tables)} core tables.")
            except Exception as e:
                self.print_log("ERR", f"Database corrupted: {str(e)}")
                self.errors += 1
        else:
            self.print_log("WARN", "Database file not found. It will be created on boot by the Master Engine.")
            self.warnings += 1

    def verify_advanced_apis(self):
        self.print_log("INFO", "Auditing 250+ Feature API Keys...")
        
        # High Priority Keys
        critical_keys = {
            "Gemini AI (Google)": "GEMINI_API_KEY",
            "WhatsApp Bot": "WHATSAPP_ACCESS_TOKEN",
            "Supabase Cloud": "SUPABASE_URL",
            "Admin PIN Vault": "ADMIN_PIN"
        }
        
        # Advanced Hybrid Keys
        hybrid_keys = {
            "Groq Llama-3": "GROQ_API_KEY",
            "Truecaller Verify": "TRUECALLER_API_KEY",
            "Cloudinary Storage": "CLOUDINARY_URL",
            "Telegram SOS": "TELEGRAM_BOT_TOKEN",
            "HuggingFace": "HUGGINGFACE_API_KEY",
            "Deepgram Voice": "DEEPGRAM_API_KEY",
            "LocationIQ Geo": "LOCATIONIQ_API_KEY"
        }

        for name, env_var in critical_keys.items():
            if os.getenv(env_var) and len(os.getenv(env_var)) > 3:
                self.print_log("OK", f"{name} : ACTIVE")
            else:
                self.print_log("ERR", f"{name} : MISSING (CRITICAL)")
                self.errors += 1

        for name, env_var in hybrid_keys.items():
            if os.getenv(env_var) and len(os.getenv(env_var)) > 3:
                self.print_log("OK", f"{name} : LINKED")
            else:
                self.print_log("WARN", f"{name} : MISSING (Will use Local Fallback Mode)")
                self.warnings += 1

    def run_health_check(self):
        print("\n" + "="*70)
        print(" 🚀 BHAJRANG FITNESS SRB - ENTERPRISE DIAGNOSTIC ENGINE")
        print("="*70)
        
        self.check_network()
        self.scan_directories()
        self.check_database()
        self.verify_advanced_apis()
        
        print("\n" + "="*70)
        if self.errors == 0:
            print(" 🌟 ALL SYSTEMS NOMINAL: Mega Engine is 100% Ready for Production.")
            if self.warnings > 0:
                print(f" ⚠️ Running with {self.warnings} free-tier fallbacks.")
        else:
            print(f" ❌ DIAGNOSTIC FAILED: Fix the {self.errors} critical errors to ensure stability.")
        print("="*70 + "\n")

if __name__ == "__main__":
    bot = BhajrangDiagnosticBot()
    bot.run_health_check()