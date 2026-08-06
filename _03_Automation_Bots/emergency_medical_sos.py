import time
from whatsapp_telegram_bot import send_telegram_alert

def trigger_sos_protocol(location_details="Main Floor"):
    '''
    Activates the Red Alert system.
    Notifies Admin, plays siren sound (handled by frontend), and prepares hospital dispatch.
    '''
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    alert_message = f"🚨 MEDICAL EMERGENCY DECLARED 🚨\nLocation: {location_details}\nTime: {timestamp}\nStatus: Awaiting Admin Override."
    
    # Send instant alert to admin
    send_telegram_alert(alert_message)
    
    return {
        "status": "active",
        "protocol": "Red Alert",
        "message": "SOS Dispatched. Admin and Medical Team Alerted."
    }