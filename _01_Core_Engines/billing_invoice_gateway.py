import os
import time
from datetime import datetime
from fpdf import FPDF
import qrcode

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# ^ NOTE: this file lives inside 03_Automation_Bots/, but the Flask app's
# static/ folder is at the project root. Without going up one level here,
# invoices would be saved to 03_Automation_Bots/static/invoices/ instead
# of the folder Flask actually serves — resulting in a broken pdf_url.

def generate_invoice_pdf(member_id, pkg_amount, discount_amount, gym_name="Bhajrang Fitness SRB", upi_id=""):
    print(f"⏳ [BILLING ENGINE] Generating Premium Invoice for {member_id}...")
    
    # ১. ফোল্ডার তৈরি করা (যদি না থাকে)
    invoice_dir = os.path.join(BASE_DIR, 'static', 'invoices')
    qr_dir = os.path.join(BASE_DIR, 'static', 'assets', 'qr_vault')
    os.makedirs(invoice_dir, exist_ok=True)
    os.makedirs(qr_dir, exist_ok=True)

    # ২. হিসাব-নিকাশ
    net_amount = float(pkg_amount) - float(discount_amount)
    timestamp = int(time.time())
    date_str = datetime.now().strftime("%d-%b-%Y")
    inv_no = f"INV-{member_id}-{timestamp}"

    # ৩. ডাইনামিক UPI QR Code জেনারেট করা
    qr_path = os.path.join(qr_dir, f"{inv_no}_qr.png")
    
    # যদি UPI ID থাকে, তবে স্ক্যান করলেই পেমেন্ট অ্যাপে অ্যামাউন্ট বসে যাবে!
    if upi_id:
        upi_url = f"upi://pay?pa={upi_id}&pn={gym_name.replace(' ', '%20')}&am={net_amount}&cu=INR"
    else:
        upi_url = f"Payment for {gym_name} - Invoice {inv_no}"
        
    qr = qrcode.QRCode(version=1, box_size=10, border=2)
    qr.add_data(upi_url)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white")
    qr_img.save(qr_path)

    # ৪. PDF ডিজাইন তৈরি করা (fpdf ব্যবহার করে)
    pdf = FPDF()
    pdf.add_page()
    
    # Header - Gym Name
    pdf.set_font("Arial", 'B', 24)
    pdf.set_text_color(212, 175, 55) # Bhajrang Gold Color
    pdf.cell(200, 15, gym_name.upper(), ln=True, align='C')
    
    pdf.set_font("Arial", 'B', 14)
    pdf.set_text_color(50, 50, 50)
    pdf.cell(200, 10, "PREMIUM MEMBERSHIP INVOICE", ln=True, align='C')
    pdf.line(10, 35, 200, 35)
    pdf.ln(10)

    # Invoice Details
    pdf.set_font("Arial", 'B', 12)
    pdf.set_text_color(0, 0, 0)
    pdf.cell(100, 10, f"Invoice No: {inv_no}")
    pdf.set_font("Arial", '', 12)
    pdf.cell(90, 10, f"Date: {date_str}", align='R', ln=True)
    pdf.set_font("Arial", 'B', 12)
    pdf.cell(200, 10, f"Warrior ID: {member_id}", ln=True)
    pdf.line(10, 60, 200, 60)
    pdf.ln(10)

    # Billing Table Header
    pdf.set_font("Arial", 'B', 12)
    pdf.set_fill_color(240, 240, 240)
    pdf.cell(140, 10, "Description", border=1, fill=True)
    pdf.cell(50, 10, "Amount (INR)", border=1, ln=True, align='R', fill=True)
    
    # Billing Table Content
    pdf.set_font("Arial", '', 12)
    pdf.cell(140, 10, "Premium Gym Membership Package", border=1)
    pdf.cell(50, 10, f"Rs. {pkg_amount:.2f}", border=1, ln=True, align='R')
    
    pdf.cell(140, 10, "Discount Applied", border=1)
    pdf.cell(50, 10, f"- Rs. {discount_amount:.2f}", border=1, ln=True, align='R')
    
    # Total Row
    pdf.set_font("Arial", 'B', 14)
    pdf.set_fill_color(212, 175, 55) # Gold
    pdf.set_text_color(255, 255, 255) # White text
    pdf.cell(140, 12, "TOTAL PAYABLE", border=1, fill=True)
    pdf.cell(50, 12, f"Rs. {net_amount:.2f}", border=1, ln=True, align='R', fill=True)
    pdf.ln(15)

    # QR Code Section
    pdf.set_text_color(0, 0, 0)
    pdf.set_font("Arial", 'B', 12)
    pdf.cell(200, 10, "Scan to Pay via Any UPI App", ln=True, align='C')
    pdf.image(qr_path, x=85, y=140, w=40)
    
    # Footer
    pdf.set_y(260)
    pdf.set_font("Arial", 'I', 10)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(200, 10, "Thank you for choosing Bhajrang Fitness! Train Hard, Stay Strong.", ln=True, align='C')

    # ৫. PDF সেভ করা
    pdf_filename = f"{inv_no}.pdf"
    pdf_path = os.path.join(invoice_dir, pdf_filename)
    pdf.output(pdf_path)

    # ৬. টেম্পোরারি QR ইমেজ ডিলিট করে দেওয়া (জায়গা বাঁচানোর জন্য)
    try:
        os.remove(qr_path)
    except:
        pass

    pdf_url = f"/static/invoices/{pdf_filename}"
    print(f"✅ Invoice Generated Successfully: {pdf_url}")
    return inv_no, pdf_url
