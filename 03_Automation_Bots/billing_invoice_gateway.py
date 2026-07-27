import os
import time
from fpdf import FPDF
from datetime import datetime

def generate_invoice_pdf(member_id, package_amount, discount, gym_name="BHAJRANG FITNESS", upi_id=""):
    """
    Generates a Professional Enterprise-grade PDF Invoice
    """
    total_amount = float(package_amount) - float(discount)
    if total_amount < 0: total_amount = 0

    invoice_id = f"INV-{int(time.time())}"
    date_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Initialize PDF
    pdf = FPDF()
    pdf.add_page()
    
    # Header Section
    pdf.set_font("Arial", 'B', 22)
    pdf.cell(0, 10, txt=gym_name, ln=True, align='C')
    
    pdf.set_font("Arial", 'B', 12)
    pdf.cell(0, 10, txt="OFFICIAL PAYMENT RECEIPT", ln=True, align='C')
    pdf.ln(10)
    
    # Invoice Details (Left and Right aligned)
    pdf.set_font("Arial", '', 12)
    pdf.cell(100, 8, txt=f"Invoice No: {invoice_id}", ln=False)
    pdf.cell(90, 8, txt=f"Date: {date_str}", ln=True, align='R')
    
    pdf.cell(190, 8, txt=f"Warrior ID: {member_id}", ln=True)
    pdf.ln(10)
    
    # Table Header
    pdf.set_font("Arial", 'B', 12)
    pdf.cell(130, 10, txt=" Description", border=1)
    pdf.cell(60, 10, txt="Amount (INR) ", border=1, ln=True, align='R')
    
    # Table Body
    pdf.set_font("Arial", '', 12)
    pdf.cell(130, 10, txt=" Gym Membership Package", border=1)
    pdf.cell(60, 10, txt=f"{float(package_amount):.2f} ", border=1, ln=True, align='R')
    
    pdf.cell(130, 10, txt=" Discount", border=1)
    pdf.cell(60, 10, txt=f"- {float(discount):.2f} ", border=1, ln=True, align='R')
    
    # Grand Total
    pdf.set_font("Arial", 'B', 14)
    pdf.cell(130, 12, txt=" GRAND TOTAL", border=1)
    pdf.cell(60, 12, txt=f"{total_amount:.2f} ", border=1, ln=True, align='R')
    
    pdf.ln(20)
    
    # Footer & Payment Details
    pdf.set_font("Arial", 'I', 10)
    pdf.cell(0, 8, txt="Thank you for choosing Bhajrang Fitness! Stay Strong, Stay Disciplined.", ln=True, align='C')
    
    if upi_id:
        pdf.set_font("Arial", 'B', 11)
        pdf.cell(0, 10, txt=f"Pay via UPI: {upi_id}", ln=True, align='C')

    # Save the PDF to the static folder so it can be downloaded
    os.makedirs("static/invoices", exist_ok=True)
    pdf_filename = f"{invoice_id}.pdf"
    pdf_path = os.path.join("static", "invoices", pdf_filename)
    pdf.output(pdf_path)
    
    return invoice_id, f"/static/invoices/{pdf_filename}"