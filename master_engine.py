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
    return render_template('index.html')

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

@app.route('/api/master_sync')
def master_sync():
    """Polled every 10s by the dashboard/approvals UI (runAutoSync in index.html).

    Returns the exact shape the frontend expects:
    { status, dashboard: { total_members, today_attendance, today_revenue, pending_count, net_profit }, pending_records: [...] }
    """
    client = supabase or get_supabase_client()
    if not client:
        app.logger.info('master_sync: Supabase not configured; returning sample data')
        return jsonify({
            'status': 'success',
            'dashboard': {
                'total_members': len(SAMPLE_MEMBERS),
                'today_attendance': 0,
                'today_revenue': SAMPLE_FINANCE['total_revenue'],
                'pending_count': len(SAMPLE_PENDING),
                'net_profit': SAMPLE_FINANCE['net_profit']
            },
            'pending_records': SAMPLE_PENDING
        })

    try:
        today = datetime.utcnow().date().isoformat()

        total_members = len((client.table('members').select('member_id').execute().data or []))

        today_attendance = len((client.table('attendance_logs')
                                 .select('id')
                                 .gte('punch_in_time', today)
                                 .execute().data or []))

        billing_today = client.table('billing').select('paid').eq('payment_date', today).execute().data or []
        today_revenue = sum(r.get('paid') or 0 for r in billing_today)

        expenses_today = client.table('expenses').select('amount').eq('expense_date', today).execute().data or []
        today_expenses = sum(r.get('amount') or 0 for r in expenses_today)

        pending_rows = (client.table('pending_approvals')
                         .select('id,name,mobile,created_at')
                         .eq('status', 'PENDING')
                         .order('created_at', desc=True)
                         .execute().data or [])

        return jsonify({
            'status': 'success',
            'dashboard': {
                'total_members': total_members,
                'today_attendance': today_attendance,
                'today_revenue': today_revenue,
                'pending_count': len(pending_rows),
                'net_profit': today_revenue - today_expenses
            },
            'pending_records': pending_rows
        })
    except Exception:
        app.logger.exception('master_sync failed')
        return jsonify({'status': 'error', 'message': 'sync_failed'}), 500


@app.route('/api/approve_member', methods=['POST'])
def approve_member():
    """Approve a pending registration: generates member_id, creates the members/ghost_vault/billing
    rows, and marks the pending_approvals row APPROVED (via the approve_member() Postgres function).

    Expects the payload sent by processApproval() in index.html:
    { req_id, class_type, duration, amount, discount, paid }
    """
    data = request.json or {}
    req_id = data.get('req_id')
    class_type = data.get('class_type') or 'Single'
    try:
        duration = int(data.get('duration') or 1)
        amount = int(float(data.get('amount') or 0))
        discount = int(float(data.get('discount') or 0))
        paid = int(float(data.get('paid') or 0))
    except (TypeError, ValueError):
        return jsonify({'status': 'error', 'message': 'invalid_number_fields'}), 400

    if not req_id:
        return jsonify({'status': 'error', 'message': 'missing_req_id'}), 400

    client = ADMIN_SUPABASE or supabase or get_supabase_client()
    if not client:
        app.logger.error('approve_member: Supabase not configured')
        return jsonify({'status': 'error', 'message': 'supabase_not_configured'}), 500

    try:
        rpc_resp = client.rpc('approve_member', {
            'p_approval_id': int(req_id),
            'p_package_name': class_type,
            'p_amount': amount,
            'p_package_months': duration,
            'p_discount': discount,
            'p_paid': paid
        }).execute()

        member_id = rpc_resp.data
        if not member_id:
            app.logger.error('approve_member RPC returned no member_id: %s', rpc_resp)
            return jsonify({'status': 'error', 'message': 'approval_failed'}), 500

        # Send welcome message + email (best-effort — approval succeeds either way)
        try:
            from _03_Automation_Bots.whatsapp_telegram_bot import send_whatsapp_message
            from _03_Automation_Bots.email_notifications import send_welcome_email
            from _01_Core_Engines.ghost_vault_engine import generate_secret_passcode
            pending_row = (client.table('pending_approvals').select('name,mobile,email,dob').eq('id', req_id).limit(1).execute().data or [None])[0]
            if pending_row:
                passcode = generate_secret_passcode(pending_row.get('dob')) if pending_row.get('dob') else None
                if pending_row.get('mobile'):
                    send_whatsapp_message(pending_row.get('mobile'), pending_row.get('name'), member_id, passcode)
                if pending_row.get('email'):
                    send_welcome_email(pending_row.get('email'), pending_row.get('name'), member_id, passcode)
        except Exception:
            app.logger.exception('Failed to send welcome message/email')

        return jsonify({'status': 'success', 'member_id': member_id})
    except Exception as e:
        app.logger.exception('approve_member failed')
        return jsonify({'status': 'error', 'message': str(e)}), 500

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
    from _03_Automation_Bots.whatsapp_telegram_bot import send_custom_whatsapp
    data = request.json
    phone = data.get('phone')
    message = data.get('message')

    result = send_custom_whatsapp(phone, message)
    return jsonify({"status": result})

@app.route('/api/generate_invoice', methods=['POST'])
def generate_invoice():
    # Import from billing_invoice_gateway module
    from _01_Core_Engines.billing_invoice_gateway import generate_invoice_pdf, BASE_DIR
    data = request.json or {}
    member_id = data.get('member_id') or (data.get('member_data') or {}).get('member_id')
    amount = float(data.get('amount') or 0)
    discount = float(data.get('discount') or 0)
    upi_id = os.getenv('GYM_UPI_ID', '')

    if not member_id:
        return jsonify({'status': 'error', 'message': 'missing_member_id'}), 400

    inv_no, pdf_url = generate_invoice_pdf(member_id, amount, discount, upi_id=upi_id)
    pdf_path = os.path.join(BASE_DIR, pdf_url.lstrip('/'))
    return send_file(pdf_path, as_attachment=True, download_name=f"{inv_no}.pdf")

@app.route('/api/ai_marketing')
def ai_marketing():
    # Import from ai_business_marketing module
    from _02_AI_Master_Agents.ai_business_marketing import generate_promo_message
    promo = generate_promo_message()
    return jsonify({"promo_message": promo})


@app.route('/ghost_vault/portal')
def ghost_vault_portal():
    return render_template('ghost_vault.html')


@app.route('/api/member_login', methods=['POST'])
def member_login():
    """Real login for the Warrior App — checks the actual ghost_vault table."""
    from _01_Core_Engines.ghost_vault_engine import validate_credentials
    data = request.json or {}
    member_id = str(data.get('member_id') or '').strip().upper()
    passcode = str(data.get('passcode') or '').strip()

    if not validate_credentials(member_id, passcode):
        return jsonify({'status': 'error', 'message': 'Invalid Warrior ID or Passcode'}), 401

    client = supabase or get_supabase_client()
    if not client:
        return jsonify({'status': 'error', 'message': 'supabase_not_configured'}), 500

    try:
        member_rows = client.table('members').select('*').eq('member_id', member_id).limit(1).execute().data
        if not member_rows:
            return jsonify({'status': 'error', 'message': 'Member profile not found'}), 404
        profile = member_rows[0]

        billing_rows = (client.table('billing').select('due')
                         .eq('member_id', member_id)
                         .order('payment_date', desc=True)
                         .limit(1).execute().data)
        due = billing_rows[0].get('due', 0) if billing_rows else 0

        return jsonify({'status': 'success', 'profile': profile, 'billing': {'due': due}})
    except Exception:
        app.logger.exception('member_login failed')
        return jsonify({'status': 'error', 'message': 'login_failed'}), 500


@app.route('/api/get_warrior_plan', methods=['POST'])
def get_warrior_plan():
    """Generates a real AI workout + diet plan (Gemini/Groq via AIOrchestrator).
    Falls back to a sensible static plan if no AI key is configured or the call fails."""
    data = request.json or {}
    profile = {
        'experience_level': data.get('experience_level', 'beginner'),
        'goal': data.get('goal', 'general fitness'),
        'days_available': data.get('days_available', 5),
        'injuries': data.get('injuries', 'None'),
        'preferred_time': data.get('preferred_time', 'evening'),
        'weight': data.get('weight'),
        'height': data.get('height'),
        'age': data.get('age'),
        'diet_preference': data.get('diet_preference', 'vegetarian'),
        'activity_level': data.get('activity_level', 'moderate')
    }
    try:
        from _02_AI_Master_Agents.ai_workout_generator import AIWorkoutGenerator
        from _02_AI_Master_Agents.ai_diet_generator import AIDietGenerator
        workout = AIWorkoutGenerator().generate_workout_plan(profile)
        diet = AIDietGenerator().generate_diet_plan(profile)
        return jsonify({'status': 'success', 'workout': workout, 'diet': diet})
    except Exception:
        app.logger.exception('get_warrior_plan failed')
        return jsonify({'status': 'error', 'message': 'plan_generation_failed'}), 500


@app.route('/api/ai_master', methods=['POST'])
def ai_master():
    """Generic free-form AI prompt endpoint — powers the 'Engage AI' box in Omni AI Hub."""
    data = request.json or {}
    prompt = (data.get('prompt') or '').strip()
    if not prompt:
        return jsonify({'response': 'Please enter a prompt.'})
    try:
        from _02_AI_Master_Agents.ai_orchestrator import AIOrchestrator
        result = AIOrchestrator().generate_with_fallback(prompt)
        response_text = result if isinstance(result, str) else result.get('message', 'AI offline — try again shortly.')
        return jsonify({'response': response_text})
    except Exception:
        app.logger.exception('ai_master failed')
        return jsonify({'response': '[ERROR] AI request failed.'}), 500


@app.route('/api/growth_insights')
def growth_insights():
    """Data-driven business suggestions for the admin, grounded in your real numbers
    (not generic hype) — pulls actual revenue/expense/member trends from Supabase and
    asks the AI to suggest concrete, realistic next actions."""
    client = supabase or get_supabase_client()
    if not client:
        return jsonify({'status': 'error', 'message': 'supabase_not_configured'}), 500

    try:
        members = client.table('members').select('member_id,expiry_date').execute().data or []
        billing = client.table('billing').select('amount,paid,due,payment_date').execute().data or []
        expenses = client.table('expenses').select('amount,expense_date').execute().data or []

        total_revenue = sum(r.get('paid') or 0 for r in billing)
        total_due = sum(r.get('due') or 0 for r in billing)
        total_expenses = sum(r.get('amount') or 0 for r in expenses)
        today = datetime.utcnow().date()
        expiring_soon = [m for m in members if m.get('expiry_date') and
                          0 <= (datetime.fromisoformat(str(m['expiry_date'])[:10]).date() - today).days <= 7]

        summary = (
            f"Total members: {len(members)}. Total revenue collected: Rs.{total_revenue}. "
            f"Total pending dues: Rs.{total_due}. Total expenses: Rs.{total_expenses}. "
            f"Memberships expiring within 7 days: {len(expiring_soon)}."
        )

        from _02_AI_Master_Agents.ai_orchestrator import AIOrchestrator
        prompt = (
            f"You are a practical small-gym business advisor. Based on this real data — {summary} — "
            f"give 4-5 concrete, realistic action items to improve retention, reduce dues, and grow "
            f"revenue this month. No hype, no guarantees, just specific actionable steps a small gym "
            f"owner in India could actually do this week."
        )
        insights = AIOrchestrator().generate_with_fallback(prompt)

        return jsonify({
            'status': 'success',
            'summary': summary,
            'insights': insights if isinstance(insights, str) else insights.get('message', 'AI offline — using cached suggestions.')
        })
    except Exception:
        app.logger.exception('growth_insights failed')
        return jsonify({'status': 'error', 'message': 'insights_failed'}), 500

if __name__ == '__main__':
    app.run(debug=True, port=int(os.getenv("PORT", 5000)))
