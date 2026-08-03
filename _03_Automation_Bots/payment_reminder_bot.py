from datetime import datetime
from _03_Automation_Bots.whatsapp_telegram_bot import send_whatsapp_message
from _01_Core_Engines.billing_invoice_gateway import calculate_due_amount
import os
from supabase import create_client
import logging

logger = logging.getLogger(__name__)
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)


def send_payment_reminders():
    """Runs daily at 10 AM. Sends WhatsApp reminders to members with due payments."""
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_KEY')
    if not url or not key:
        logger.error('Supabase config missing')
        return

    supabase = create_client(url, key)

    due_resp = supabase.table('billing').select('id, member_id, amount, due_date').eq('status', 'Pending').lte('due_date', datetime.utcnow().date().isoformat()).execute()
    due_members = due_resp.data or []

    for bill in due_members:
        try:
            member_resp = supabase.table('members').select('name, phone').eq('id', bill['member_id']).execute()
            member = member_resp.data[0] if member_resp.data else None
            if not member:
                continue
            message = f"Payment Reminder\n\nDear {member['name']},\nYour gym fee of {bill['amount']} is due on {bill['due_date']}.\nPlease pay via UPI: {os.getenv('UPI_ID')}\n\n- Bhajrang Fitness SRB"
            send_whatsapp_message(member['phone'], message)
        except Exception:
            logger.exception('Failed to send reminder for bill %s', bill.get('id'))


if __name__ == '__main__':
    send_payment_reminders()
