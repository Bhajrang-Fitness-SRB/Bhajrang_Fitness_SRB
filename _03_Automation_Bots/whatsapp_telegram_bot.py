import os
import requests
import logging

# ⚙️ Setup Logger for Terminal
logging.basicConfig(level=logging.INFO, format='%(asctime)s - 🤖 BOT ENGINE - %(message)s')
logger = logging.getLogger("BhajrangBots")

WHATSAPP_GRAPH_API_VERSION = "v20.0"


# ==========================================
# 1. ENTERPRISE TELEGRAM BOT
# ==========================================
def send_telegram_alert(message, alert_type="INFO"):
    """
    Sends real-time enterprise alerts to Admin Telegram Bot
    Alert Types: "INFO", "WARNING", "BILLING", "SECURITY", "NEW_MEMBER"
    """
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
        "text": f"{icon} *BHAJRANG ENTERPRISE ALERT*\n\n{message}",
        "parse_mode": "Markdown"
    }

    try:
        response = requests.post(url, json=payload, timeout=10)
        return response.status_code == 200
    except Exception as e:
        logger.error(f"Telegram Bot Error: {e}")
        return False


# ==========================================
# CORE: Meta WhatsApp Business Cloud API sender
# ==========================================
def _send_meta_whatsapp_text(phone, message):
    """
    Sends a free-form text message via Meta's official WhatsApp Business Cloud API.

    IMPORTANT — Meta's 24-hour window rule: a plain text message like this can only be
    delivered if the recipient has messaged your WhatsApp Business number within the last
    24 hours ("customer service window"). For a business-initiated message — like this
    welcome message, sent right after YOU approve someone who hasn't messaged you first —
    Meta requires an approved MESSAGE TEMPLATE instead, or delivery will silently fail
    with an API error (visible in your Render logs, not to you in the app).

    To fix that: in Meta Business Manager → WhatsApp → Message Templates, create and get
    approval for a template (e.g. "welcome_kit" with variables for name/member_id/passcode),
    then this function would need to send type="template" instead of type="text". Until you
    have an approved template, this will work reliably only for members who message your
    business number first.
    """
    access_token = os.getenv('WHATSAPP_ACCESS_TOKEN')
    phone_number_id = os.getenv('WHATSAPP_PHONE_NUMBER_ID')

    safe_phone = ''.join(filter(str.isdigit, str(phone)))
    if len(safe_phone) == 10:
        safe_phone = "91" + safe_phone

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
            logger.info(f"✅ WhatsApp dispatched to {safe_phone}")
            return True
        logger.error(f"❌ WhatsApp API error {response.status_code}: {response.text}")
        return False
    except Exception as e:
        logger.error(f"❌ WhatsApp Bot Error: {e}")
        return False


def _send_meta_whatsapp_template(phone, template_name, language_code, body_params):
    """
    Sends an approved WhatsApp Message Template via Meta's Cloud API. Unlike free-form
    text, templates can be sent to anyone at any time — no 24-hour window restriction —
    which is why this is used for the welcome message (business-initiated, first contact).
    body_params is an ordered list of strings filling the template's {{1}}, {{2}}, {{3}}...
    """
    access_token = os.getenv('WHATSAPP_ACCESS_TOKEN')
    phone_number_id = os.getenv('WHATSAPP_PHONE_NUMBER_ID')

    safe_phone = ''.join(filter(str.isdigit, str(phone)))
    if len(safe_phone) == 10:
        safe_phone = "91" + safe_phone

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
        logger.error(f"❌ WhatsApp template API error {response.status_code}: {response.text}")
        return False
    except Exception as e:
        logger.error(f"❌ WhatsApp Bot Error: {e}")
        return False


# ==========================================
# 2. SMART WHATSAPP BOT (WELCOME KIT)
# ==========================================
def send_whatsapp_message(phone, name, member_id, passcode=None):
    """
    Sends the approved 'welcome_kit' template with name, member_id, and passcode
    as its 3 body variables (in that order — must match how the template was approved
    in Meta Business Manager). Falls back to blank string for passcode if not provided,
    since template variables cannot be omitted once approved with 3 slots.

    NOTE: language_code below assumes "en_US" — if your template was submitted for
    approval under a different language (e.g. "en" or "en_GB"), update WHATSAPP_TEMPLATE_LANG
    below to match exactly, or Meta will reject the send with a "template not found" error.
    """
    language_code = os.getenv('WHATSAPP_TEMPLATE_LANG', 'en_US')
    return _send_meta_whatsapp_template(
        phone,
        template_name="welcome_kit",
        language_code=language_code,
        body_params=[name, member_id, passcode or "N/A"]
    )


# ==========================================
# 3. SMART WHATSAPP BOT (ATTENDANCE LOG)
# ==========================================
def send_attendance_whatsapp(phone, name, punch_status):
    """
    Sends Real-time IN/OUT alert to member's WhatsApp
    """
    if punch_status == "CHECK-IN":
        text = f"🟢 *CHECK-IN SUCCESSFUL*\nHi {name}, welcome to Bhajrang Fitness! Have a great workout! 💪"
    else:
        text = f"🔴 *CHECK-OUT SUCCESSFUL*\nHi {name}, great session today! See you tomorrow! 🔱"

    return _send_meta_whatsapp_text(phone, text)


# ==========================================
# 4. GENERIC CUSTOM WHATSAPP MESSAGE (for reminders, alerts, etc.)
# ==========================================
def send_custom_whatsapp(phone, message):
    """
    Sends an arbitrary pre-built WhatsApp message to a member.
    Use this (not send_whatsapp_message, which is welcome-kit-specific)
    for reminders, renewal notices, or any other custom text.
    """
    return _send_meta_whatsapp_text(phone, message)


# ==========================================
# TEST THE NOTIFICATION HUB
# ==========================================
if __name__ == "__main__":
    print("\n" + "="*50)
    print("🚀 BHAJRANG OMNI-CHANNEL NOTIFICATION HUB")
    print("="*50)

    send_telegram_alert("Unauthorized Kiosk Access Attempt detected!", alert_type="SECURITY")

    send_whatsapp_message(
        phone="9876543210",
        name="Rajib Biswas",
        member_id="RBF2607123",
        passcode="0723"
    )

    send_attendance_whatsapp("9876543210", "Rajib", "CHECK-IN")
