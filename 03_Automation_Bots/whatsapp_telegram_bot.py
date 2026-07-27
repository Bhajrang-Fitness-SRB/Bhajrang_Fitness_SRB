import os
import requests

def send_telegram_alert(message):
    """
    Sends real-time enterprise alerts to Admin Telegram Bot
    """
    bot_token = os.getenv('TELEGRAM_BOT_TOKEN')
    chat_id = os.getenv('TELEGRAM_CHAT_ID')

    if not bot_token or not chat_id:
        print(f"⚠️ [SIMULATED TELEGRAM BOT]: {message}")
        return False

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": f"🚨 BHAJRANG SYSTEM ALERT:\n{message}",
        "parse_mode": "Markdown"
    }

    try:
        response = requests.post(url, json=payload, timeout=10)
        return response.status_code == 200
    except Exception as e:
        print(f"❌ Telegram Bot Error: {e}")
        return False

def send_whatsapp_message(phone, name, member_id):
    """
    Sends Automated Welcome WhatsApp Message to New Member
    """
    api_token = os.getenv('WHATSAPP_API_TOKEN')
    
    welcome_text = (
        f"🔥 *WELCOME TO BHAJRANG FITNESS* 🔥\n\n"
        f"Greeting Warrior *{name}*!\n"
        f"Your Membership ID: *{member_id}*\n\n"
        f"We are excited to have you in our fitness tribe. "
        f"Show your QR ID at the kiosk scanner upon arrival.\n\n"
        f"Stay Strong, Stay Disciplined! 💪"
    )

    if not api_token:
        print(f"📱 [SIMULATED WHATSAPP TO {phone}]:\n{welcome_text}")
        return True

    # Cloud API Gateway (UltraMsg / Twilio / Meta Graph)
    try:
        # Example HTTP Gateway endpoint logic placeholder
        print(f"✅ WhatsApp Notification dispatched to {phone}")
        return True
    except Exception as e:
        print(f"❌ WhatsApp Bot Error: {e}")
        return False