"""
features/certificates.py

Generate completion/certificate PDFs using WeasyPrint. Produces a signed-looking certificate with member details.
"""
import os
from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML, CSS
from datetime import datetime

TEMPLATE_DIR = os.path.join('templates')
env = Environment(loader=FileSystemLoader(TEMPLATE_DIR), autoescape=select_autoescape(['html','xml']))


def generate_certificate_pdf(member, title='Bhajrang Fitness Completion Certificate', out_path=None):
    out_path = out_path or f"/tmp/certificate_{member.get('id',member.get('member_id','unknown'))}.pdf"
    tpl = env.get_template('certificate_template.html')
    html = tpl.render(member=member, title=title, date=datetime.utcnow().strftime('%d %b %Y'))
    css = CSS(string='@page{size:A4 landscape; margin:12mm} body{font-family:Arial} .stamp{border:2px solid #222;padding:8px;border-radius:6px} ')
    HTML(string=html).write_pdf(out_path, stylesheets=[css])
    return out_path

if __name__ == '__main__':
    m = {'name':'Test Member','id':'M-001','package':'Monthly'}
    print(generate_certificate_pdf(m))
