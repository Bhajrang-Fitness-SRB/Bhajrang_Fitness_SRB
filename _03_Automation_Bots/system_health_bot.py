import json
import requests
import os
from datetime import datetime
from dotenv import load_dotenv
import logging

load_dotenv('master_vault.env')

logger = logging.getLogger(__name__)
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s: %(message)s')


def check_system_health(timeout: int = 8):
    """
    Monitors system health and API status and returns a structured report.
    """
    health_report = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "system_status": "healthy",
        "issues": []
    }

    # Check Supabase API
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")
    if not supabase_url or not supabase_key:
        health_report["issues"].append("Supabase configuration missing")
        health_report["system_status"] = "degraded"
        return health_report

    try:
        resp = requests.get(f"{supabase_url}/rest/v1/", headers={"apikey": supabase_key}, timeout=timeout)
        if not resp.ok:
            health_report["issues"].append(f"Supabase API returned {resp.status_code}")
            health_report["system_status"] = "degraded"
    except requests.RequestException as e:
        logger.exception("Supabase connection error")
        health_report["issues"].append(f"Supabase connection error: {e}")
        health_report["system_status"] = "degraded"

    # Check Gemini API key presence
    try:
        gemini_key = os.getenv("GEMINI_API_KEY")
        if not gemini_key or gemini_key == "your_google_gemini_api_key":
            health_report["issues"].append("Gemini API key not configured")
            health_report["system_status"] = "degraded"
    except Exception as e:
        logger.exception("Gemini API check error")
        health_report["issues"].append(f"Gemini API check error: {e}")
        health_report["system_status"] = "degraded"

    return health_report


def send_health_report(health_report):
    """
    Sends health report to admin via Telegram if degraded.
    """
    if health_report.get("system_status") != "healthy":
        from _03_Automation_Bots.whatsapp_telegram_bot import send_telegram_message
        admin_chat_id = os.getenv("TELEGRAM_ADMIN_CHAT_ID")
        if not admin_chat_id:
            logger.error("TELEGRAM_ADMIN_CHAT_ID not configured; cannot send health alert")
            return
        message = (
            f"System Health Alert!\n"
            f"Status: {health_report['system_status']}\n"
            f"Issues: {', '.join(health_report['issues'])}"
        )
        send_telegram_message(admin_chat_id, message)


if __name__ == "__main__":
    report = check_system_health()
    print(json.dumps(report, indent=2))
    send_health_report(report)
