from weasyprint import HTML, CSS
from _01_Core_Engines.billing_invoice_gateway import render_invoice_html
import sys, os


def generate_pdf(invoice, member=None, settings=None, out_path='/tmp/invoice.pdf'):
    html = render_invoice_html(invoice, member=member, settings=settings)
    css = CSS(string='@page { size: A5 portrait; margin:10mm }')
    HTML(string=html).write_pdf(out_path, stylesheets=[css])
    return out_path

if __name__ == '__main__':
    sample = {'items':[{'description':'Monthly Membership','sku':'PKG001','qty':1,'unit_price':1000,'discount_percent':10,'pt_fee':50,'prep_fee':20,'pro_fee':0,'tax_percent':18}], 'paid':200}
    path = generate_pdf(sample, member={'name':'Test'}, settings={'gym_name':'Bhajrang Fitness SRB'})
    print('Wrote', path)
