import os
from dotenv import load_dotenv
import requests

load_dotenv('master_vault.env')

def send_whatsapp_message(phone_number, message):
    """
    Sends WhatsApp message using WhatsApp Business API
    """
    try:
        access_token = os.getenv("WHATSAPP_ACCESS_TOKEN")
        phone_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID")
        
        url = f"https://graph.facebook.com/v17.0/{phone_id}/messages"
        
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        
        data = {
            "messaging_product": "whatsapp",
            "to": phone_number,
            "type": "text",
            "text": {
                "body": message
            }
        }
        
        response = requests.post(url, headers=headers, json=data)
        return "success" if response.status_code == 200 else "failed"
        
    except Exception as e:
        print(f"Error sending WhatsApp message: {e}")
        return "error"

def send_telegram_message(chat_id, message):
    """
    Sends Telegram message using Telegram Bot API
    """
    try:
        bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        
        data = {
            "chat_id": chat_id,
            "text": message
        }
        
        response = requests.post(url, data=data)
        return "success" if response.status_code == 200 else "failed"
        
    except Exception as e:
        print(f"Error sending Telegram message: {e}")
        return "error"

def send_welcome_message(phone_number, member_name):
    """
    Sends welcome message to new member
    """
    message = f"Namaste {member_name}! Welcome to Bhajrang Fitness SRB. Your journey to fitness starts now!"
    return send_whatsapp_message(phone_number, message)
