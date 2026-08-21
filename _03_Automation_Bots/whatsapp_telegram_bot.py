import os
import re
import logging
import requests

logger = logging.getLogger("BhajrangBots")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - 🤖 BOT ENGINE - %(message)s')

WHATSAPP_GRAPH_API_VERSION = "v20.0"

def _normalize_phone(phone: str) -> str:
    """Normalizes phone numbers to standard international format (defaults to India 91)."""
    digits = re.sub(r'\D', '', str(phone))
    if len(digits) == 10:
        return "91" + digits
    return digits

# ==========================================
# 1. ENTERPRISE TELEGRAM BOT
# ==========================================
def send_telegram_alert(message: str, alert_type: str = "INFO") -> bool:
    """Sends real-time enterprise alerts to Admin Telegram Bot."""
    bot_token = os.getenv('TELEGRAM_BOT_TOKEN')
    chat_id = os.getenv('TELEGRAM_CHAT_ID') or os.getenv('TELEGRAM_ADMIN_CHAT_ID')

    icons = {
        "INFO": "ℹ️",
        "WARNING": "⚠️",
        "BILLING": "💰",
        "SECURITY": "🛡️",
        "NEW_MEMBER": "🏋️‍♂️",
        "AI": "🧠"
    }
    icon = icons.get(alert_type.upper(), "🚨")

    if not bot_token or not chat_id:
        logger.info(f"[SIMULATED TELEGRAM - {icon}]:\n{message}")
        return False

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": f"{icon} *BHAJRANG ALERT*\n\n{message}",
        "parse_mode": "Markdown"
    }

    try:
        response = requests.post(url, json=payload, timeout=10)
        return response.status_code == 200
    except Exception as e:
        logger.error(f"Telegram Bot Request Error: {e}")
        return False

# Backward compatibility alias
send_telegram_message = lambda chat_id, msg: send_telegram_alert(msg)

# ==========================================
# 2. META WHATSAPP BUSINESS CLOUD API
# ==========================================
def _send_meta_whatsapp_text(phone: str, message: str) -> bool:
    access_token = os.getenv('WHATSAPP_ACCESS_TOKEN')
    phone_number_id = os.getenv('WHATSAPP_PHONE_NUMBER_ID')
    safe_phone = _normalize_phone(phone)

    if not access_token or not phone_number_id:
        logger.info(f"📱 [SIMULATED WHATSAPP TO {safe_phone}]:\n{message}")
        return True

    url = f"https://graph.facebook.com/{WHATSAPP_GRAPH_API_VERSION}/{phone_number_id}/messages"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": safe_phone,
        "type": "text",
        "text": {"body": message}
    }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        if response.status_code == 200:
            logger.info(f"✅ WhatsApp text message dispatched to {safe_phone}")
            return True
        logger.error(f"❌ WhatsApp API error {response.status_code}: {response.text}")
        return False
    except Exception as e:
        logger.error(f"❌ WhatsApp Dispatch Exception: {e}")
        return False

def _send_meta_whatsapp_template(phone: str, template_name: str, language_code: str, body_params: list) -> bool:
    access_token = os.getenv('WHATSAPP_ACCESS_TOKEN')
    phone_number_id = os.getenv('WHATSAPP_PHONE_NUMBER_ID')
    safe_phone = _normalize_phone(phone)

    if not access_token or not phone_number_id:
        logger.info(f"📱 [SIMULATED WHATSAPP TEMPLATE '{template_name}' TO {safe_phone}]: {body_params}")
        return True

    url = f"https://graph.facebook.com/{WHATSAPP_GRAPH_API_VERSION}/{phone_number_id}/messages"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": safe_phone,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language_code},
            "components": [
                {
                    "type": "body",
                    "parameters": [{"type": "text", "text": str(p)} for p in body_params]
                }
            ]
        }
    }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        if response.status_code == 200:
            logger.info(f"✅ WhatsApp template '{template_name}' dispatched to {safe_phone}")
            return True
        logger.error(f"❌ WhatsApp Template API error {response.status_code}: {response.text}")
        return False
    except Exception as e:
        logger.error(f"❌ WhatsApp Template Bot Error: {e}")
        return False

def send_whatsapp_message(phone: str, name: str, member_id: str, passcode: str = None) -> bool:
    """Sends the official approved 'welcome_kit' template."""
    language_code = os.getenv('WHATSAPP_TEMPLATE_LANG', 'en_US')
    return _send_meta_whatsapp_template(
        phone,
        template_name="welcome_kit",
        language_code=language_code,
        body_params=[name, member_id, passcode or "N/A"]
    )

def send_attendance_whatsapp(phone: str, name: str, punch_status: str) -> bool:
    """Sends check-in/check-out notifications."""
    if punch_status.upper() == "CHECK-IN":
        text = f"🟢 *CHECK-IN SUCCESSFUL*\nHi {name}, welcome to Bhajrang Fitness! Have a powerful session! 💪"
    else:
        text = f"🔴 *CHECK-OUT SUCCESSFUL*\nHi {name}, great workout today! Rest up and see you tomorrow! 🔱"
    return _send_meta_whatsapp_text(phone, text)

def send_custom_whatsapp(phone: str, message: str) -> bool:
    """Sends general-purpose plain text messages (e.g. payment reminders)."""
    return _send_meta_whatsapp_text(phone, message)
