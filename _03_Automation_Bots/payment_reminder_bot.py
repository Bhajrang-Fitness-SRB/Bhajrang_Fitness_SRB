import os
import logging
from datetime import datetime
from supabase import create_client
from _03_Automation_Bots.whatsapp_telegram_bot import send_custom_whatsapp

logger = logging.getLogger("payment_reminder_bot")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def send_payment_reminders():
    """Runs scheduled reminders for members with overdue or pending fees."""
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_KEY')
    upi_id = os.getenv('UPI_ID', '')
    
    if not url or not key:
        logger.error("Supabase configuration missing in payment_reminder_bot.")
        return

    try:
        supabase = create_client(url, key)
        today_iso = datetime.utcnow().date().isoformat()
        
        # Query for pending bills where due_date is on or before today
        due_resp = (
            supabase.table('billing')
            .select('id, member_id, amount, due_date, status')
            .in_('status', ['Pending', 'Unpaid', 'Late'])
            .lte('due_date', today_iso)
            .execute()
        )
        due_bills = due_resp.data or []
    except Exception as e:
        logger.exception(f"Failed to fetch due billing records from database: {e}")
        return

    if not due_bills:
        logger.info("No overdue or pending payments found today.")
        return

    logger.info(f"Processing {len(due_bills)} overdue payment reminder(s)...")

    for bill in due_bills:
        try:
            member_id = bill.get('member_id')
            member_resp = supabase.table('members').select('name, phone').eq('id', member_id).execute()
            member = member_resp.data[0] if member_resp.data else None
            
            if not member or not member.get('phone'):
                logger.warning(f"Skipping Bill #{bill.get('id')}: Member '{member_id}' has no registered phone.")
                continue

            amount = bill.get('amount', 0)
            due_date = bill.get('due_date', today_iso)
            member_name = member.get('name', 'Warrior')

            upi_info = f"\n💳 Pay instantly via UPI: {upi_id}" if upi_id else ""
            
            message = (
                f"🔱 *BHAJRANG FITNESS SRB — PAYMENT REMINDER*\n\n"
                f"Dear *{member_name}*,\n"
                f"Your gym membership fee of *₹{amount:,.2f}* was due on *{due_date}*.\n"
                f"{upi_info}\n\n"
                f"Kindly clear your dues to continue uninterrupted biometric access.\n"
                f"Train Hard, Stay Strong! 💪"
            )
            
            # Use custom text sender instead of the template-based welcome sender
            send_custom_whatsapp(member['phone'], message)
            
        except Exception as e:
            logger.exception(f"Failed to process reminder for Bill #{bill.get('id')}: {e}")

if __name__ == '__main__':
    send_payment_reminders()
