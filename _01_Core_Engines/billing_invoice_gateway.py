import os
import time
import logging
from datetime import datetime
from fpdf import FPDF
import qrcode

logger = logging.getLogger("billing_gateway")
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

def calculate_due_amount(package_amount: float, paid_amount: float, discount: float = 0.0) -> float:
    """Calculates remaining due amount safely."""
    try:
        pkg = float(package_amount or 0)
        paid = float(paid_amount or 0)
        disc = float(discount or 0)
        return max(0.0, (pkg - disc) - paid)
    except (ValueError, TypeError):
        return 0.0

def generate_invoice_pdf(member_id: str, pkg_amount: float, discount_amount: float = 0.0, gym_name: str = "Bhajrang Fitness SRB", upi_id: str = ""):
    """Generates an invoice PDF with an embedded UPI QR code."""
    invoice_dir = os.path.join(BASE_DIR, 'static', 'invoices')
    qr_dir = os.path.join(BASE_DIR, 'static', 'assets', 'qr_vault')
    os.makedirs(invoice_dir, exist_ok=True)
    os.makedirs(qr_dir, exist_ok=True)

    try:
        pkg = float(pkg_amount or 0)
        disc = float(discount_amount or 0)
    except (ValueError, TypeError):
        pkg, disc = 0.0, 0.0

    net_amount = max(0.0, pkg - disc)
    timestamp = int(time.time())
    date_str = datetime.now().strftime("%d-%b-%Y")
    inv_no = f"INV-{member_id}-{timestamp}"

    qr_path = os.path.join(qr_dir, f"{inv_no}_qr.png")
    
    if upi_id:
        clean_gym = gym_name.replace(' ', '%20')
        upi_url = f"upi://pay?pa={upi_id}&pn={clean_gym}&am={net_amount:.2f}&cu=INR"
    else:
        upi_url = f"Payment for {gym_name} - Invoice {inv_no}"
        
    qr = qrcode.QRCode(version=1, box_size=10, border=2)
    qr.add_data(upi_url)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white")
    qr_img.save(qr_path)

    pdf = FPDF()
    pdf.add_page()
    
    # Header
    pdf.set_font("Arial", 'B', 22)
    pdf.set_text_color(212, 175, 55)
    pdf.cell(190, 15, gym_name.upper(), ln=True, align='C')
    
    pdf.set_font("Arial", 'B', 12)
    pdf.set_text_color(60, 60, 60)
    pdf.cell(190, 8, "PREMIUM MEMBERSHIP INVOICE", ln=True, align='C')
    pdf.line(10, 35, 200, 35)
    pdf.ln(10)

    # Details
    pdf.set_font("Arial", 'B', 10)
    pdf.set_text_color(0, 0, 0)
    pdf.cell(95, 8, f"Invoice No: {inv_no}")
    pdf.set_font("Arial", '', 10)
    pdf.cell(95, 8, f"Date: {date_str}", align='R', ln=True)
    pdf.set_font("Arial", 'B', 10)
    pdf.cell(190, 8, f"Warrior ID: {member_id}", ln=True)
    pdf.line(10, 55, 200, 55)
    pdf.ln(8)

    # Table Header
    pdf.set_fill_color(240, 240, 240)
    pdf.cell(140, 9, "Description", border=1, fill=True)
    pdf.cell(50, 9, "Amount (INR)", border=1, ln=True, align='R', fill=True)
    
    # Table Content
    pdf.set_font("Arial", '', 10)
    pdf.cell(140, 9, "Membership Package", border=1)
    pdf.cell(50, 9, f"Rs. {pkg:.2f}", border=1, ln=True, align='R')
    
    pdf.cell(140, 9, "Discount Applied", border=1)
    pdf.cell(50, 9, f"- Rs. {disc:.2f}", border=1, ln=True, align='R')
    
    # Total
    pdf.set_font("Arial", 'B', 11)
    pdf.set_fill_color(212, 175, 55)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(140, 10, "TOTAL PAYABLE", border=1, fill=True)
    pdf.cell(50, 10, f"Rs. {net_amount:.2f}", border=1, ln=True, align='R', fill=True)
    pdf.ln(12)

    # QR Section
    pdf.set_text_color(0, 0, 0)
    pdf.set_font("Arial", 'B', 10)
    pdf.cell(190, 8, "Scan to Pay via UPI", ln=True, align='C')
    if os.path.exists(qr_path):
        pdf.image(qr_path, x=85, y=pdf.get_y() + 2, w=40)

    # Footer
    pdf.set_y(260)
    pdf.set_font("Arial", 'I', 9)
    pdf.set_text_color(120, 120, 120)
    pdf.cell(190, 10, "Thank you for choosing Bhajrang Fitness! Train Hard, Stay Strong.", ln=True, align='C')

    pdf_filename = f"{inv_no}.pdf"
    pdf_path = os.path.join(invoice_dir, pdf_filename)
    pdf.output(pdf_path)

    try:
        if os.path.exists(qr_path):
            os.remove(qr_path)
    except Exception:
        pass

    pdf_url = f"/static/invoices/{pdf_filename}"
    return inv_no, pdf_url
