# tests/test_invoice.py
from _01_Core_Engines.billing_invoice_gateway import compute_invoice_totals


def test_compute_simple_invoice():
    invoice = {
        'items': [
            {'description':'Monthly', 'qty':1, 'unit_price':1000, 'discount_percent':10, 'pt_fee':50, 'prep_fee':20, 'tax_percent':18}
        ],
        'paid': 500
    }
    res = compute_invoice_totals(invoice)
    assert 'total' in res
    assert res['paid'] == 500
    assert res['due'] >= 0
