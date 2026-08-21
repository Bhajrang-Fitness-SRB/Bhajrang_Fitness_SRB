import time
import logging
from _03_Automation_Bots.whatsapp_telegram_bot import send_telegram_alert

logger = logging.getLogger("emergency_sos")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - 🚨 SOS PROTOCOL - %(message)s')

def trigger_sos_protocol(location_details: str = "Main Gym Floor", member_name: str = "Unknown Member") -> dict:
    """
    Activates Red Alert SOS Protocol:
    1. Sends urgent security dispatch to Admin Telegram Bot.
    2. Logs timestamped event for insurance and audit purposes.
    """
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    alert_message = (
        f"🚨 *MEDICAL EMERGENCY DECLARED* 🚨\n\n"
        f"📍 *Location:* {location_details}\n"
        f"👤 *Involved:* {member_name}\n"
        f"⏰ *Time:* {timestamp}\n"
        f"⚠️ *Status:* Immediate Floor Assistance Required!"
    )
    
    # Send instant priority alert to Telegram Admin
    dispatched = send_telegram_alert(alert_message, alert_type="SECURITY")
    
    if dispatched:
        logger.info(f"SOS Protocol successfully broadcasted for location: {location_details}")
    else:
        logger.warning("Telegram Bot unconfigured or delivery failed during SOS trigger.")

    return {
        "status": "active",
        "protocol": "Red Alert",
        "timestamp": timestamp,
        "dispatched": dispatched,
        "message": "SOS Dispatched. Admin and Medical Emergency Response Team Alerted."
    }

if __name__ == '__main__':
    trigger_sos_protocol(location_details="Bench Press Section", member_name="Demo Test")
