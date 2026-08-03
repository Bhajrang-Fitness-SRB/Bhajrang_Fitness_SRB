# _01_Core_Engines/billing_invoice_gateway.py
"""
Invoice generation helper: computes per-line totals and renders invoice HTML using Jinja templates.
"""
import os
import math
from jinja2 import Environment, FileSystemLoader, select_autoescape
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
TEMPLATE_DIR = os.path.join(os.path.dirname(BASE_DIR), 'templates')
env = Environment(loader=FileSystemLoader(TEMPLATE_DIR), autoescape=select_autoescape(['html','xml']))


def _round_currency(x):
    return float(round(x, 2))


def compute_invoice_totals(invoice):
    """
    invoice: {
        'number': str,
        'date': iso str,
        'items': [ {description, sku, qty, unit_price, discount_percent, discount_amount, pt_fee, prep_fee, pro_fee, tax_percent} ],
        'paid': float
    }
    returns computed invoice dict with subtotal, taxes_and_fees, total, due, line totals
    """
    items = []
    subtotal = 0.0
    taxes_and_fees = 0.0

    for it in invoice.get('items', []):
        qty = float(it.get('qty', 1))
        unit = float(it.get('unit_price', 0))
        base = qty * unit
        discount_amount = float(it.get('discount_amount', 0) or 0)
        if it.get('discount_percent'):
            discount_amount = base * float(it.get('discount_percent')) / 100.0
        pt_fee = float(it.get('pt_fee', 0) or 0)
        prep_fee = float(it.get('prep_fee', 0) or 0)
        pro_fee = float(it.get('pro_fee', 0) or 0)
        taxable = base - discount_amount + pt_fee + prep_fee + pro_fee
        tax_percent = float(it.get('tax_percent', 0) or 0)
        tax_amount = taxable * tax_percent / 100.0
        line_total = taxable + tax_amount
        subtotal += base
        taxes_and_fees += (discount_amount * -1) + pt_fee + prep_fee + pro_fee + tax_amount
        items.append({
            'description': it.get('description'),
            'sku': it.get('sku'),
            'qty': qty,
            'unit_price': _round_currency(unit),
            'discount_amount': _round_currency(discount_amount),
            'pt_fee': _round_currency(pt_fee),
            'prep_fee': _round_currency(prep_fee),
            'pro_fee': _round_currency(pro_fee),
            'tax_percent': tax_percent,
            'line_total': _round_currency(line_total)
        })

    subtotal = _round_currency(subtotal)
    taxes_and_fees = _round_currency(taxes_and_fees)

    total = subtotal + taxes_and_fees
    total = _round_currency(total)

    paid = float(invoice.get('paid', 0) or 0)
    due = _round_currency(total - paid)

    round_off = _round_currency(total - round(total, 0))

    return {
        'items': items,
        'subtotal': subtotal,
        'taxes_and_fees': taxes_and_fees,
        'total': total,
        'paid': _round_currency(paid),
        'due': due,
        'round_off': round_off,
        'number': invoice.get('number') or f"INV-{int(datetime.utcnow().timestamp())}",
        'date': invoice.get('date') or datetime.utcnow().isoformat()
    }


def render_invoice_html(invoice, member=None, settings=None, template_name='invoice_template_premium.html'):
    ctx = compute_invoice_totals(invoice)
    ctx_invoice = {
        'number': ctx['number'],
        'date': ctx['date'],
        'items': ctx['items'],
        'subtotal': ctx['subtotal'],
        'taxes_and_fees': ctx['taxes_and_fees'],
        'total': ctx['total'],
        'paid': ctx['paid'],
        'due': ctx['due'],
        'round_off': ctx['round_off']
    }
    template = env.get_template(template_name)
    html = template.render(invoice=ctx_invoice, member=member or {}, settings=settings or {})
    return html


if __name__ == '__main__':
    # quick local test
    sample = {
        'items':[{'description':'Monthly Membership','sku':'PKG001','qty':1,'unit_price':1000,'discount_percent':10,'pt_fee':50,'prep_fee':20,'pro_fee':0,'tax_percent':18}],
        'paid':200
    }
    html = render_invoice_html(sample, member={'name':'Test','id':'W-001','phone':'9999999999'}, settings={'gym_name':'Bhajrang Fitness SRB'})
    open('/tmp/test_invoice.html','w',encoding='utf-8').write(html)
    print('Wrote /tmp/test_invoice.html')
