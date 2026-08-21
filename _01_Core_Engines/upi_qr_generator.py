import io
import base64
import logging
import qrcode
from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger("upi_qr_generator")

def generate_upi_qr(upi_id: str, amount: float, member_name: str, notes: str = "Gym Payment") -> str:
    """Generates a branded Base64-encoded QR code for instant UPI payment."""
    clean_name = member_name.replace(" ", "%20")
    clean_notes = notes.replace(" ", "%20")
    upi_uri = f"upi://pay?pa={upi_id}&pn={clean_name}&am={amount:.2f}&cu=INR&tn={clean_notes}"

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(upi_uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert('RGB')

    # Add text overlay footer
    draw = ImageDraw.Draw(img)
    text = f"Pay INR {amount:.2f}"
    
    try:
        font = ImageFont.load_default()
        # Calculate bounding box for center alignment
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        x_pos = (img.size[0] - text_width) // 2
        y_pos = img.size[1] - 25
        draw.text((x_pos, y_pos), text, fill="black", font=font)
    except Exception as e:
        logger.warning(f"Could not render font label on QR: {e}")

    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return base64.b64encode(buf.getvalue()).decode('utf-8')
