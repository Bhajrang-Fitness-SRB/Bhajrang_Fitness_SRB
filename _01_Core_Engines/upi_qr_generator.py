# UPI QR generator (helper)

import qrcode
from PIL import Image, ImageDraw, ImageFont
import io
import base64


def generate_upi_qr(upi_id, amount, member_name, notes="Gym Payment"):
    upi_uri = f"upi://pay?pa={upi_id}&pn={member_name}&am={amount}&cu=INR&tn={notes}"
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(upi_uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")

    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.load_default()
        draw.text((10, img.size[1] - 30), f"Pay {amount}", fill="black", font=font)
    except Exception:
        pass

    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return base64.b64encode(buf.getvalue()).decode()
