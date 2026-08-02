import os
from datetime import datetime
import uuid

def calculate_due_amount(member_id, package_amount):
    """
    Calculates due amount for member
    """
    # In real implementation, fetch from billing table
    return package_amount

def create_invoice(member_data, amount):
    """
    Creates invoice and saves as PDF
    """
    # For demo, create a simple text file
    invoice_id = str(uuid.uuid4())[:8]
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    invoice_content = f"""
    ==================================
    BHAJRANG FITNESS SRB - INVOICE
    ==================================
    Invoice ID: {invoice_id}
    Date: {timestamp}
    
    Member ID: {member_data.get('id')}
    Name: {member_data.get('name')}
    Package: {member_data.get('package')}
    
    Amount: {amount}
    ==================================
    Thank you for choosing Bhajrang Fitness!
    """
    
    # Save to static/invoice directory
    invoice_path = f"static/invoice/invoice_{invoice_id}.txt"
    os.makedirs(os.path.dirname(invoice_path), exist_ok=True)
    
    with open(invoice_path, 'w') as f:
        f.write(invoice_content)
    
    return invoice_path

def send_payment_reminder(member_phone, due_amount):
    """
    Sends payment reminder via WhatsApp
    """
    # This would integrate with WhatsApp bot
    message = f"Reminder: Your due amount is {due_amount}. Please pay at your earliest convenience."
    # send_whatsapp_message(member_phone, message)
    return "Reminder sent"
