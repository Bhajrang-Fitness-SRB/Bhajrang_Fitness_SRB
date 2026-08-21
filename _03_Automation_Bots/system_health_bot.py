import os
import json
import logging
import requests
from datetime import datetime
from dotenv import load_dotenv
from _03_Automation_Bots.whatsapp_telegram_bot import send_telegram_alert

load_dotenv('master_vault.env')

logger = logging.getLogger("system_health_bot")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s: %(message)s')

def check_system_health(timeout: int = 8) -> dict:
    """Monitors connectivity to external APIs and database endpoints."""
    health_report = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "system_status": "healthy",
        "issues": []
    }

    # 1. Supabase Verification
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")
    if not supabase_url or not supabase_key:
        health_report["issues"].append("Supabase credentials unconfigured")
        health_report["system_status"] = "degraded"
    else:
        try:
            resp = requests.get(f"{supabase_url}/rest/v1/", headers={"apikey": supabase_key}, timeout=timeout)
            if not resp.ok:
                health_report["issues"].append(f"Supabase REST endpoint returned HTTP {resp.status_code}")
                health_report["system_status"] = "degraded"
        except requests.RequestException as e:
            health_report["issues"].append(f"Supabase connection timed out/failed: {e}")
            health_report["system_status"] = "degraded"

    # 2. Gemini / AI Verification
    gemini_key = os.getenv("GEMINI_API_KEY")
    groq_key = os.getenv("GROQ_API_KEY")
    if not gemini_key and not groq_key:
        health_report["issues"].append("No AI orchestration keys (Gemini or Groq) are active")
        health_report["system_status"] = "degraded"

    return health_report

def send_health_report(health_report: dict):
    """Dispatches alert to Admin via Telegram if status is degraded."""
    if health_report.get("system_status") != "healthy":
        issues_formatted = "\n• " + "\n• ".join(health_report.get('issues', []))
        message = (
            f"*SYSTEM HEALTH STATUS:* {health_report['system_status'].upper()}\n"
            f"*Timestamp:* {health_report['timestamp']}\n\n"
            f"*Detected Issues:*{issues_formatted}"
        )
        # Using unified alert function
        send_telegram_alert(message, alert_type="WARNING")

if __name__ == "__main__":
    report = check_system_health()
    print(json.dumps(report, indent=2))
    send_health_report(report)
