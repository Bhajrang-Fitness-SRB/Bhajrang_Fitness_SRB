import os
import requests
import logging

# ⚙️ Setup Logger for Terminal
logging.basicConfig(level=logging.INFO, format='%(asctime)s - 🤖 BOT ENGINE - %(message)s')
logger = logging.getLogger("BhajrangBots")

# ==========================================
# 1. ENTERPRISE TELEGRAM BOT
# ==========================================
def send_telegram_alert(message, alert_type="INFO"):
    """
    Sends real-time enterprise alerts to Admin Telegram Bot
    Alert Types: "INFO", "WARNING", "BILLING", "SECURITY", "NEW_MEMBER"
    """
    bot_token = os.getenv('TELEGRAM_BOT_TOKEN')
    chat_id = os.getenv('TELEGRAM_CHAT_ID')

    # 🎨 Dynamic Icons based on Event Type
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
# 2. SMART WHATSAPP BOT (WELCOME KIT)
# ==========================================
def send_whatsapp_message(phone, name, member_id, passcode=None):
    """
    Sends Automated Welcome WhatsApp Message to New Member with App Link & Passcode
    """
    api_token = os.getenv('WHATSAPP_API_TOKEN')
    instance_url = os.getenv('WHATSAPP_INSTANCE_URL') # If using UltraMsg or similar gateway
    
    # 🔧 Auto Format Phone Number (Add 91 for India if missing)
    safe_phone = ''.join(filter(str.isdigit, str(phone)))
    if len(safe_phone) == 10:
        safe_phone = "91" + safe_phone

    welcome_text = (
        f"🔥 *WELCOME TO BHAJRANG FITNESS* 🔥\n\n"
        f"Greeting Warrior *{name}*!\n"
        f"Your journey to greatness begins today. 💪\n\n"
        f"🛡️ *YOUR SECURE CREDENTIALS:*\n"
        f"🆔 Warrior ID: `{member_id}`\n"
    )
    
    if passcode:
        welcome_text += f"🔐 Vault Passcode: `{passcode}`\n\n"
    else:
        welcome_text += "\n"
        
    welcome_text += (
        f"📱 *Download Your Member App:*\n"
        f"🌐 https://bhajrang-fitness-srb.onrender.com/app\n\n"
        f"Show your Digital QR Pass at the Kiosk scanner upon arrival.\n"
        f"Stay Strong, Stay Disciplined! 🔱"
    )

    if not api_token:
        logger.info(f"📱 [SIMULATED WHATSAPP TO {safe_phone}]:\n{welcome_text}")
        return True

    # 🌐 Cloud API Gateway Execution (Meta / UltraMsg Pattern)
    try:
        if instance_url:
            payload = { "token": api_token, "to": safe_phone, "body": welcome_text }
            headers = {'content-type': 'application/x-www-form-urlencoded'}
            response = requests.post(instance_url, data=payload, headers=headers, timeout=10)
            
            if response.status_code == 200:
                logger.info(f"✅ Welcome Kit dispatched to {safe_phone}")
                return True
        return False
    except Exception as e:
        logger.error(f"❌ WhatsApp Bot Error: {e}")
        return False


# ==========================================
# 3. SMART WHATSAPP BOT (ATTENDANCE LOG)
# ==========================================
def send_attendance_whatsapp(phone, name, punch_status):
    """
    Sends Real-time IN/OUT alert to member's WhatsApp
    """
    api_token = os.getenv('WHATSAPP_API_TOKEN')
    instance_url = os.getenv('WHATSAPP_INSTANCE_URL')
    
    safe_phone = ''.join(filter(str.isdigit, str(phone)))
    if len(safe_phone) == 10: safe_phone = "91" + safe_phone

    if punch_status == "CHECK-IN":
        text = f"🟢 *CHECK-IN SUCCESSFUL*\nHi {name}, welcome to Bhajrang Fitness! Have a great workout! 💪"
    else:
        text = f"🔴 *CHECK-OUT SUCCESSFUL*\nHi {name}, great session today! See you tomorrow! 🔱"

    if not api_token:
        logger.info(f"⏱️ [SIMULATED ATTENDANCE TO {safe_phone}]: {text}")
        return True

    try:
        if instance_url:
            payload = { "token": api_token, "to": safe_phone, "body": text }
            headers = {'content-type': 'application/x-www-form-urlencoded'}
            requests.post(instance_url, data=payload, headers=headers, timeout=5)
            return True
    except Exception as e:
        logger.error(f"WhatsApp Attendance Error: {e}")
        return False


# ==========================================
# 4. GENERIC CUSTOM WHATSAPP MESSAGE (for reminders, alerts, etc.)
# ==========================================
def send_custom_whatsapp(phone, message):
    """
    Sends an arbitrary pre-built WhatsApp message to a member.
    Use this (not send_whatsapp_message, which is welcome-kit-specific)
    for reminders, renewal notices, or any other custom text.
    """
    api_token = os.getenv('WHATSAPP_API_TOKEN')
    instance_url = os.getenv('WHATSAPP_INSTANCE_URL')

    safe_phone = ''.join(filter(str.isdigit, str(phone)))
    if len(safe_phone) == 10:
        safe_phone = "91" + safe_phone

    if not api_token:
        logger.info(f"📱 [SIMULATED WHATSAPP TO {safe_phone}]:\n{message}")
        return True

    try:
        if instance_url:
            payload = {"token": api_token, "to": safe_phone, "body": message}
            headers = {'content-type': 'application/x-www-form-urlencoded'}
            response = requests.post(instance_url, data=payload, headers=headers, timeout=10)
            if response.status_code == 200:
                logger.info(f"✅ Custom message dispatched to {safe_phone}")
                return True
        return False
    except Exception as e:
        logger.error(f"❌ WhatsApp Bot Error: {e}")
        return False


# ==========================================
# TEST THE NOTIFICATION HUB
# ==========================================
if __name__ == "__main__":
    print("\n" + "="*50)
    print("🚀 BHAJRANG OMNI-CHANNEL NOTIFICATION HUB")
    print("="*50)
    
    # Test 1: Telegram Security Alert
    send_telegram_alert("Unauthorized Kiosk Access Attempt detected!", alert_type="SECURITY")
    
    # Test 2: WhatsApp Welcome Kit
    send_whatsapp_message(
        phone="9876543210", 
        name="Rajib Biswas", 
        member_id="RBF2607123", 
        passcode="0723"
    )
    
    # Test 3: Attendance Alert
    send_attendance_whatsapp("9876543210", "Rajib", "CHECK-IN")
