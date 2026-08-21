import os
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger("email_notifications")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)

def _get_smtp_config():
    host = os.getenv('SMTP_HOST')
    port = os.getenv('SMTP_PORT', '587')
    user = os.getenv('SMTP_USER')
    password = os.getenv('SMTP_PASS')
    
    if not all([host, port, user, password]):
        return None
        
    try:
        clean_port = int(str(port).strip())
    except ValueError:
        clean_port = 587

    return {
        'host': host.strip(),
        'port': clean_port,
        'user': user.strip(),
        'password': password.strip(),
        'from_name': os.getenv('SMTP_FROM_NAME', 'Bhajrang Fitness SRB')
    }

def send_welcome_email(to_email: str, name: str, member_id: str, passcode: str = None) -> bool:
    """Sends the official registration approval email via SMTP (Supports both SSL and STARTTLS)."""
    if not to_email or "@" not in to_email:
        logger.warning(f"Invalid recipient email provided: '{to_email}'")
        return False

    config = _get_smtp_config()
    if not config:
        logger.warning(f"Email not sent to {to_email} — SMTP credentials not configured.")
        return False

    passcode_html = f"<p>🔐 <b>Vault Passcode:</b> <code style='font-size:16px; background:#f4f4f4; padding:2px 6px; border-radius:4px;'>{passcode}</code></p>" if passcode else ""

    html_body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; border: 1px solid #D4AF37; border-radius: 10px; overflow: hidden;">
      <div style="background: #0f0c29; padding: 24px; text-align: center;">
        <h1 style="color: #D4AF37; margin: 0; font-size: 24px;">🔱 BHAJRANG FITNESS</h1>
        <p style="color: #F7D26A; margin: 6px 0 0; font-size: 14px; letter-spacing: 1px;">TRAIN • TRANSFORM • CONQUER</p>
      </div>
      <div style="padding: 24px; color: #222; background: #ffffff;">
        <p style="font-size: 16px;">Welcome, <b>{name}</b>! Your gym membership registration is approved.</p>
        <div style="background: #fdfaf0; border-left: 4px solid #D4AF37; padding: 12px; margin: 16px 0;">
            <p style="margin: 4px 0;">🆔 <b>Warrior ID:</b> <span style="color:#D4AF37; font-weight:bold;">{member_id}</span></p>
            {passcode_html}
        </div>
        <p>📱 Access your Member Dashboard anytime:</p>
        <p style="text-align: center; margin: 20px 0;">
            <a href="https://bhajrang-fitness-srb.onrender.com/warrior" style="background: #0f0c29; color: #D4AF37; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Enter Warrior Portal</a>
        </p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #888; font-size: 12px; text-align: center;">
           Please keep your passcode confidential. See you on the training floor!
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
        if config['port'] == 465:
            # Native SSL connection
            with smtplib.SMTP_SSL(config['host'], config['port'], timeout=10) as server:
                server.login(config['user'], config['password'])
                server.sendmail(config['user'], to_email, msg.as_string())
        else:
            # Explicit STARTTLS connection (Port 587/25)
            with smtplib.SMTP(config['host'], config['port'], timeout=10) as server:
                server.starttls()
                server.login(config['user'], config['password'])
                server.sendmail(config['user'], to_email, msg.as_string())
                
        logger.info(f"Welcome email successfully dispatched to {to_email}")
        return True
    except Exception as e:
        logger.exception(f"Failed to send welcome email to {to_email}: {e}")
        return False
