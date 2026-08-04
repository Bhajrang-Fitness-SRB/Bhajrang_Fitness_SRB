from flask import Flask, render_template, jsonify, request, send_file
import os
from dotenv import load_dotenv, find_dotenv
from supabase import create_client
import pybase64
import qrcode
from PIL import Image
import io
import requests
from datetime import datetime
import uuid
import json
import random
import string

# Load environment variables (search for master_vault.env from project root)
dotenv_path = find_dotenv('master_vault.env') or find_dotenv()
if dotenv_path:
    load_dotenv(dotenv_path)

# Initialize Flask app
app = Flask(__name__)

# Configuration with safe defaults so route decorators never receive None
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
ADMIN_PORTAL_URL = os.getenv("ADMIN_PORTAL_URL") or "/villain"
DESK_PORTAL_URL = os.getenv("DESK_PORTAL_URL") or "/administration"
STAFF_PORTAL_URL = os.getenv("STAFF_PORTAL_URL") or "/commander"
STUDENT_PORTAL_URL = os.getenv("STUDENT_PORTAL_URL") or "/warrior"

# Use helper to create supabase client when available
from utils.supabase_client import get_supabase_client
supabase = get_supabase_client()

# Admin/service-role client for trusted writes (only if configured)
ADMIN_SUPABASE = None
if SUPABASE_SERVICE_ROLE_KEY:
    try:
        from supabase import create_client as _create_client
        ADMIN_SUPABASE = _create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    except Exception:
        ADMIN_SUPABASE = None

# Sample data for demonstration / fallback
SAMPLE_MEMBERS = [
    {"id": "RBF26050001", "name": "John Doe", "package": "Gold", "status": "Active", "phone": "9876543210"},
    {"id": "RBF26050002", "name": "Jane Smith", "package": "Platinum", "status": "Active", "phone": "9876543211"},
    {"id": "RBF26050003", "name": "Mike Johnson", "package": "Silver", "status": "Expired", "phone": "9876543212"}
]

SAMPLE_FINANCE = {
    "total_revenue": 15000,
    "total_expenses": 8000,
    "net_profit": 7000
}

SAMPLE_PENDING = [
    {"id": "RBF26050004", "name": "Alice Brown", "package": "None", "status": "Pending", "phone": "9876543213"},
    {"id": "RBF26050005", "name": "Bob White", "package": "None", "status": "Pending", "phone": "9876543214"}
]

# Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route(ADMIN_PORTAL_URL)
def admin_portal():
    return render_template('admin.html')

@app.route('/kiosk')
def kiosk():
    return render_template('kiosk.html')

@app.route('/warrior')
def warrior():
    return render_template('member_app.html')

@app.route('/register')
def register():
    return render_template('registration_form.html')

@app.route('/api/telemetry')
def telemetry():
    # In real implementation, fetch from Supabase when available
    try:
        client = supabase or get_supabase_client()
        if client:
            try:
                total_members_resp = client.table('members').select('id').execute()
                total_members = len(total_members_resp.data or [])
            except Exception:
                total_members = len(SAMPLE_MEMBERS)
        else:
            total_members = len(SAMPLE_MEMBERS)

        today_revenue = SAMPLE_FINANCE["total_revenue"]
        active_attendance = 12  # Mock data
        pending_requests = len(SAMPLE_PENDING)

        return jsonify({
            "total_members": total_members,
            "today_revenue": today_revenue,
            "active_attendance": active_attendance,
            "pending_requests": pending_requests
        })
    except Exception as e:
        app.logger.exception('Telemetry endpoint error')
        return jsonify({'error': 'internal'}), 500

@app.route('/api/members')
def members():
    # Prefer live data when Supabase is configured, otherwise return sample data
    client = supabase or get_supabase_client()
    if client:
        try:
            resp = client.table('members').select('*').execute()
            if getattr(resp, 'error', None):
                app.logger.error('Supabase members read error: %s', resp.error)
                return jsonify(SAMPLE_MEMBERS)
            return jsonify(resp.data or [])
        except Exception as e:
            app.logger.exception('Supabase members read failed')
            return jsonify(SAMPLE_MEMBERS)
    return jsonify(SAMPLE_MEMBERS)

@app.route('/api/pending')
def pending():
    """Return pending approvals from Supabase or fallback sample data.

    This endpoint logs errors and returns sample data when Supabase is not configured
    or when an error occurs, to avoid crashing the web UI.
    """
    client = supabase or get_supabase_client()
    if not client:
        app.logger.info('Supabase not configured; returning SAMPLE_PENDING')
        return jsonify(SAMPLE_PENDING)
    try:
        resp = client.table('pending_approvals').select('*').order('created_at', desc=True).execute()
        app.logger.debug('pending read resp data=%s error=%s', getattr(resp,'data',None), getattr(resp,'error',None))
        if getattr(resp, 'error', None):
            app.logger.error('Supabase pending read error: %s', resp.error)
            return jsonify(SAMPLE_PENDING)
        return jsonify(resp.data or [])
    except Exception:
        app.logger.exception('Unexpected error reading pending_approvals')
        return jsonify(SAMPLE_PENDING)

@app.route('/api/finance')
def finance():
    client = supabase or get_supabase_client()
    if client:
        try:
            resp = client.table('billing').select('amount').execute()
            amounts = [r.get('amount', 0) for r in (resp.data or [])]
            total_revenue = sum(amounts)
            return jsonify({
                'total_revenue': total_revenue,
                'total_expenses': SAMPLE_FINANCE['total_expenses'],
                'net_profit': total_revenue - SAMPLE_FINANCE['total_expenses']
            })
        except Exception:
            app.logger.exception('Supabase finance read failed')
            return jsonify(SAMPLE_FINANCE)
    return jsonify(SAMPLE_FINANCE)

@app.route('/api/generate_qr/<member_id>')
def generate_qr(member_id):
    # Create QR code
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(member_id)
    qr.make(fit=True)

    img = qr.make_image(fill='black', back_color='white')

    # Save to bytes
    img_buffer = io.BytesIO()
    img.save(img_buffer, format='PNG')
    img_buffer.seek(0)

    # Encode to base64
    img_str = pybase64.b64encode(img_buffer.getvalue()).decode()

    return jsonify({"qr_code": img_str})

@app.route('/api/approve_member', methods=['POST'])
def approve_member():
    """Approve a pending approval by moving it into the members table and deleting the pending row.

    Expects JSON with one of: pending_id (primary key of pending_approvals) or assigned_id (the proposed member id).
    Uses SUPABASE_SERVICE_ROLE_KEY for server-side trusted writes if available."""
    data = request.json or {}
    pending_id = data.get('pending_id') or data.get('id')
    assigned_id = data.get('assigned_id') or data.get('member_id') or data.get('assignedId')

    client = ADMIN_SUPABASE or supabase or get_supabase_client()
    if not client:
        app.logger.error('approve_member: Supabase not configured')
        return jsonify({'error': 'supabase_not_configured'}), 500

    try:
        # Fetch the pending row
        if pending_id:
            row_resp = client.table('pending_approvals').select('*').eq('id', pending_id).limit(1).execute()
        elif assigned_id:
            row_resp = client.table('pending_approvals').select('*').eq('assigned_id', assigned_id).limit(1).execute()
        else:
            return jsonify({'error': 'missing_identifier'}), 400

        app.logger.debug('row_resp: data=%s error=%s', getattr(row_resp,'data',None), getattr(row_resp,'error',None))
        pending_row = (row_resp.data or [None])[0]
        if not pending_row:
            return jsonify({'error': 'pending_not_found'}), 404

        # Build member record from pending_row (map fields as needed)
        member_data = {
            'id': pending_row.get('assigned_id') or str(uuid.uuid4()),
            'name': pending_row.get('name') or pending_row.get('full_name'),
            'phone': pending_row.get('phone'),
            'package': pending_row.get('package') or 'Default',
            'status': 'Active',
            'created_at': datetime.utcnow().isoformat()
        }

        insert_resp = client.table('members').insert(member_data).execute()
        app.logger.debug('insert_resp: data=%s error=%s', getattr(insert_resp,'data',None), getattr(insert_resp,'error',None))
        if getattr(insert_resp, 'error', None):
            app.logger.error('Failed to insert member: %s', insert_resp.error)
            return jsonify({'error': 'insert_failed'}), 500

        # Delete the pending row
        try:
            del_resp = client.table('pending_approvals').delete().eq('id', pending_row.get('id')).execute()
            app.logger.debug('del_resp: data=%s error=%s', getattr(del_resp,'data',None), getattr(del_resp,'error',None))
            if getattr(del_resp, 'error', None):
                app.logger.warning('Failed to delete pending row: %s', del_resp.error)
        except Exception:
            app.logger.exception('Failed to delete pending row after insert')

        # Send welcome message (best-effort)
        try:
            from _03_Automation_Bots.whatsapp_telegram_bot import send_welcome_message
            if member_data.get('phone'):
                send_welcome_message(member_data.get('phone'), member_data.get('name'))
        except Exception:
            app.logger.exception('Failed to send welcome message')

        return jsonify({'status': 'approved', 'member_id': member_data['id']})
    except Exception:
        app.logger.exception('approve_member failed')
        return jsonify({'error': 'internal'}), 500

@app.route('/api/generate_id')
def generate_id():
    # Import from id_generator module
    from _01_Core_Engines.id_generator import generate_unique_id
    new_id = generate_unique_id()
    return jsonify({"new_id": new_id})

@app.route('/api/validate_vault', methods=['POST'])
def validate_vault():
    # Import from ghost_vault_engine module
    from _01_Core_Engines.ghost_vault_engine import validate_credentials
    data = request.json
    warrior_id = data.get('warrior_id')
    passcode = data.get('passcode')

    is_valid = validate_credentials(warrior_id, passcode)
    return jsonify({"valid": is_valid})

@app.route('/api/send_whatsapp', methods=['POST'])
def send_whatsapp():
    # Import from whatsapp_telegram_bot module
    from _03_Automation_Bots.whatsapp_telegram_bot import send_whatsapp_message
    data = request.json
    phone = data.get('phone')
    message = data.get('message')

    result = send_whatsapp_message(phone, message)
    return jsonify({"status": result})

@app.route('/api/generate_invoice', methods=['POST'])
def generate_invoice():
    # Import from billing_invoice_gateway module
    from _01_Core_Engines.billing_invoice_gateway import create_invoice
    data = request.json
    member_data = data.get('member_data')
    amount = data.get('amount')

    invoice_path = create_invoice(member_data, amount)
    return send_file(invoice_path, as_attachment=True)

@app.route('/api/ai_marketing')
def ai_marketing():
    # Import from ai_business_marketing module
    from _02_AI_Master_Agents.ai_business_marketing import generate_promo_message
    promo = generate_promo_message()
    return jsonify({"promo_message": promo})

if __name__ == '__main__':
    app.run(debug=True, port=int(os.getenv("PORT", 5000)))
