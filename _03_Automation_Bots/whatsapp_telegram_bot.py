import os
import logging
from dotenv import load_dotenv
import requests
from typing import Dict, Any

load_dotenv('master_vault.env')

logger = logging.getLogger(__name__)
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s: %(message)s')


def _is_2xx(status_code: int) -> bool:
    return 200 <= status_code < 300


def send_whatsapp_message(phone_number: str, message: str, timeout: int = 10) -> Dict[str, Any]:
    """
    Sends WhatsApp message using WhatsApp Business API.
    Returns a structured result dictionary.
    """
    access_token = os.getenv("WHATSAPP_ACCESS_TOKEN")
    phone_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID")

    if not access_token or not phone_id:
        logger.error("WhatsApp credentials missing (WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID)")
        return {"ok": False, "error": "credentials_missing"}

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

    try:
        resp = requests.post(url, headers=headers, json=data, timeout=timeout)
        if _is_2xx(resp.status_code):
            logger.info("WhatsApp message sent to %s status=%s", phone_number, resp.status_code)
            return {"ok": True, "status_code": resp.status_code, "body": resp.json() if resp.content else None}
        logger.warning("WhatsApp send failed status=%s body=%s", resp.status_code, resp.text)
        return {"ok": False, "status_code": resp.status_code, "body": resp.text}
    except requests.RequestException as e:
        logger.exception("WhatsApp request exception")
        return {"ok": False, "error": str(e)}


def send_telegram_message(chat_id: str, message: str, timeout: int = 10) -> Dict[str, Any]:
    """
    Sends Telegram message using Telegram Bot API.
    Returns a structured result dictionary.
    """
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not bot_token:
        logger.error("TELEGRAM_BOT_TOKEN is not configured")
        return {"ok": False, "error": "credentials_missing"}

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"

    data = {
        "chat_id": chat_id,
        "text": message
    }

    try:
        resp = requests.post(url, data=data, timeout=timeout)
        if _is_2xx(resp.status_code):
            logger.info("Telegram message sent to chat_id=%s status=%s", chat_id, resp.status_code)
            return {"ok": True, "status_code": resp.status_code, "body": resp.json() if resp.content else None}
        logger.warning("Telegram send failed status=%s body=%s", resp.status_code, resp.text)
        return {"ok": False, "status_code": resp.status_code, "body": resp.text}
    except requests.RequestException as e:
        logger.exception("Telegram request exception")
        return {"ok": False, "error": str(e)}


def send_welcome_message(phone_number: str, member_name: str) -> Dict[str, Any]:
    """
    Sends welcome message to new member via WhatsApp.
    """
    message = f"Namaste {member_name}! Welcome to Bhajrang Fitness SRB. Your journey to fitness starts now!"
    return send_whatsapp_message(phone_number, message)
