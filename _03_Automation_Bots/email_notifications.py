"""
Email notifications for Bhajrang Fitness SRB.

Sends the welcome email (Member ID + Vault Passcode + app link) after a
registration is approved. Uses plain SMTP so it works with any provider —
Gmail (with an App Password), SendGrid's SMTP relay, Zoho Mail, etc.

Required environment variables (set these in Render → Environment):
    SMTP_HOST      e.g. smtp.gmail.com
    SMTP_PORT      e.g. 587
    SMTP_USER      the mailbox that sends the email
    SMTP_PASS      app password / API key for that mailbox
    SMTP_FROM_NAME optional, e.g. "Bhajrang Fitness SRB" (defaults to SMTP_USER)

If these aren't set, sending is skipped silently — this mirrors how the
WhatsApp/Telegram bots already degrade gracefully when unconfigured, so a
missing email setup never crashes the approval flow.
"""

import os
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger("BhajrangEmail")


def _get_smtp_config():
    host = os.getenv('SMTP_HOST')
    port = os.getenv('SMTP_PORT')
    user = os.getenv('SMTP_USER')
    password = os.getenv('SMTP_PASS')
    if not all([host, port, user, password]):
        return None
    return {
        'host': host,
        'port': int(port),
        'user': user,
        'password': password,
        'from_name': os.getenv('SMTP_FROM_NAME', 'Bhajrang Fitness SRB')
    }


def send_welcome_email(to_email, name, member_id, passcode=None):
    """Sends the same welcome info as WhatsApp, but by email. Returns True/False."""
    if not to_email:
        return False

    config = _get_smtp_config()
    if not config:
        logger.warning("Email not sent to %s — SMTP_HOST/PORT/USER/PASS not configured", to_email)
        return False

    passcode_line = f"<p>🔐 <b>Vault Passcode:</b> {passcode}</p>" if passcode else ""

    html_body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto; border: 1px solid #D4AF37; border-radius: 10px; overflow: hidden;">
      <div style="background: #0f0c29; padding: 24px; text-align: center;">
        <h1 style="color: #D4AF37; margin: 0;">🔱 BHAJRANG FITNESS</h1>
        <p style="color: #F7D26A; margin: 4px 0 0;">Train • Transform • Conquer</p>
      </div>
      <div style="padding: 24px; color: #222;">
        <p>Welcome, <b>{name}</b>! Your registration has been approved.</p>
        <p>🆔 <b>Warrior ID:</b> {member_id}</p>
        {passcode_line}
        <p>📱 Access your Member App anytime at:<br>
           <a href="https://bhajrang-fitness-srb.onrender.com/warrior">bhajrang-fitness-srb.onrender.com/warrior</a></p>
        <p style="margin-top: 24px; color: #888; font-size: 12px;">
           Keep your passcode private. See you at the gym!
        </p>
      </div>
    </div>
    """

    msg = MIMEMultipart('alternative')
    msg['Subject'] = "🔱 Welcome to Bhajrang Fitness — Your Warrior ID Inside"
    msg['From'] = f"{config['from_name']} <{config['user']}>"
    msg['To'] = to_email
    msg.attach(MIMEText(html_body, 'html'))

    try:
        with smtplib.SMTP(config['host'], config['port']) as server:
            server.starttls()
            server.login(config['user'], config['password'])
            server.sendmail(config['user'], to_email, msg.as_string())
        logger.info("Welcome email sent to %s", to_email)
        return True
    except Exception:
        logger.exception("Failed to send welcome email to %s", to_email)
        return False
