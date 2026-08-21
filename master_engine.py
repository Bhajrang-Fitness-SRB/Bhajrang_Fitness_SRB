from flask import Flask, render_template, jsonify, request, send_file
import os
import logging
from dotenv import load_dotenv, find_dotenv
import pybase64
import qrcode
import io
from datetime import datetime
import traceback

# Load environment variables
dotenv_path = find_dotenv('master_vault.env') or find_dotenv()
if dotenv_path:
    load_dotenv(dotenv_path)

# Initialize Flask app
app = Flask(__name__)

# Configure Logging
if not app.logger.handlers:
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
ADMIN_PORTAL_URL = os.getenv("ADMIN_PORTAL_URL", "/villain")
DESK_PORTAL_URL = os.getenv("DESK_PORTAL_URL", "/administration")
STAFF_PORTAL_URL = os.getenv("STAFF_PORTAL_URL", "/commander")
STUDENT_PORTAL_URL = os.getenv("STUDENT_PORTAL_URL", "/warrior")

# Initialize Database Clients
from utils.supabase_client import get_supabase_client
supabase = get_supabase_client()

ADMIN_SUPABASE = None
if SUPABASE_SERVICE_ROLE_KEY:
    try:
        from supabase import create_client as _create_client
        ADMIN_SUPABASE = _create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    except Exception:
        app.logger.exception("Failed to create ADMIN_SUPABASE client.")
else:
    app.logger.warning("SUPABASE_SERVICE_ROLE_KEY not set — using anon client.")

# Fallback Sample Data[span_12](start_span)[span_12](end_span)
SAMPLE_MEMBERS = [
    {"id": "RBF26050001", "name": "John Doe", "package": "Gold", "status": "Active", "phone": "9876543210"},
    {"id": "RBF26050002", "name": "Jane Smith", "package": "Platinum", "status": "Active", "phone": "9876543211"}
]
SAMPLE_FINANCE = {"total_revenue": 15000, "total_expenses": 8000, "net_profit": 7000}
SAMPLE_PENDING = [{"id": "RBF26050004", "name": "Alice Brown", "status": "Pending", "phone": "9876543213"}]

# Helper to safely parse floats
def safe_float(val, default=0.0):
    try:
        if val is None or str(val).strip() == "":
            return default
        return float(val)
    except (ValueError, TypeError):
        return default

# --- HTML Routes ---

@app.route('/')
@app.route(ADMIN_PORTAL_URL)
@app.route(DESK_PORTAL_URL)
@app.route(STAFF_PORTAL_URL)
def portals():
    return render_template('index.html')

@app.route('/kiosk')
def kiosk():
    return render_template('kiosk.html')

@app.route(STUDENT_PORTAL_URL)
def warrior():
    return render_template('member_app.html')

@app.route('/register')
@app.route('/enroll')
def register():
    return render_template('registration_form.html')

@app.route('/ghost_vault/portal')
def ghost_vault_portal():
    return render_template('ghost_vault.html')


# --- API Routes ---

@app.route('/api/registration_sync', methods=['POST'])
def registration_sync():
    data = request.json or {}
    name = (data.get('name') or '').strip()
    phone = (data.get('phone') or '').strip()
    face_image = data.get('face_image') or ''

    if not name or not phone or not face_image:
        return jsonify({'status': 'error', 'message': 'Name, phone, and face photo are required.'}), 400

    client = ADMIN_SUPABASE or supabase or get_supabase_client()
    if not client:
        return jsonify({'status': 'error', 'message': 'Database offline'}), 500

    row = {
        'name': name,
        'mobile': phone,
        'email': (data.get('email') or '').strip() or None,
        'dob': data.get('dob') or None,
        'address': (data.get('address') or '').strip() or None,
        'photo_base64': face_image,
        'status': 'PENDING'
    }

    try:
        client.table('pending_approvals').insert(row).execute()
        try:
            from _03_Automation_Bots.whatsapp_telegram_bot import send_telegram_alert
            send_telegram_alert(f"New registration: {name} ({phone})", alert_type="NEW_MEMBER")
        except Exception:
            app.logger.exception('Failed to send new-registration alert')
            
        return jsonify({'status': 'success', 'message': 'Registration received — pending approval.'})
    except Exception:
        app.logger.exception('Registration sync failed')
        return jsonify({'status': 'error', 'message': 'Failed to save registration.'}), 500


@app.route('/api/telemetry')
def telemetry():
    try:
        client = ADMIN_SUPABASE or supabase or get_supabase_client()
        total_members = len(SAMPLE_MEMBERS)
        if client:
            try:
                resp = client.table('members').select('id').execute()
                total_members = len(resp.data or [])
            except Exception:
                pass

        return jsonify({
            "total_members": total_members,
            "today_revenue": SAMPLE_FINANCE["total_revenue"],
            "active_attendance": 12,
            "pending_requests": len(SAMPLE_PENDING)
        })
    except Exception:
        return jsonify({'error': 'internal'}), 500


@app.route('/api/members')
def members():
    client = ADMIN_SUPABASE or supabase or get_supabase_client()
    if client:
        try:
            resp = client.table('members').select('*').execute()
            return jsonify(resp.data or [])
        except Exception:
            app.logger.exception('Members read failed')
    return jsonify(SAMPLE_MEMBERS)


@app.route('/api/get_all_members')
def get_all_members():
    client = ADMIN_SUPABASE or supabase or get_supabase_client()
    if not client:
        return jsonify({'status': 'success', 'members': SAMPLE_MEMBERS})
    try:
        resp = client.table('members').select('member_id,name,phone,package,joining_date').order('joining_date', desc=True).execute()
        return jsonify({'status': 'success', 'members': resp.data or []})
    except Exception as e:
        app.logger.exception('get_all_members failed')
        # Debug field removed for production security[span_13](start_span)[span_13](end_span)
        return jsonify({'status': 'error', 'message': 'fetch_failed', 'members': []}), 500


@app.route('/api/pending')
def pending():
    client = ADMIN_SUPABASE or supabase or get_supabase_client()
    if not client:
        return jsonify(SAMPLE_PENDING)
    try:
        resp = client.table('pending_approvals').select('*').order('created_at', desc=True).execute()
        return jsonify(resp.data or [])
    except Exception:
        app.logger.exception('Pending approvals read failed')
        return jsonify(SAMPLE_PENDING)


@app.route('/api/master_sync')
def master_sync():
    client = ADMIN_SUPABASE or supabase or get_supabase_client()
    if not client:
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
        today_attendance = len((client.table('attendance_logs').select('id').gte('punch_in_time', today).execute().data or []))
        
        billing_today = client.table('billing').select('paid').eq('payment_date', today).execute().data or []
        today_revenue = sum(safe_float(r.get('paid')) for r in billing_today)

        expenses_today = client.table('expenses').select('amount').eq('expense_date', today).execute().data or []
        today_expenses = sum(safe_float(r.get('amount')) for r in expenses_today)

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
    data = request.json or {}
    req_id = data.get('req_id')
    class_type = data.get('class_type', 'Single')
    
    amount = safe_float(data.get('amount'))
    discount = safe_float(data.get('discount'))
    paid = safe_float(data.get('paid'))
    
    try:
        duration = int(data.get('duration') or 1)
    except ValueError:
        duration = 1

    if not req_id:
        return jsonify({'status': 'error', 'message': 'missing_req_id'}), 400

    client = ADMIN_SUPABASE or supabase or get_supabase_client()
    if not client:
        return jsonify({'status': 'error', 'message': 'Database unavailable'}), 500

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
            return jsonify({'status': 'error', 'message': 'approval_failed'}), 500

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
            app.logger.exception('Failed to send welcome messages')

        return jsonify({'status': 'success', 'member_id': member_id})
    except Exception as e:
        app.logger.exception('approve_member failed')
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/generate_invoice', methods=['POST'])
def generate_invoice():
    from _01_Core_Engines.billing_invoice_gateway import generate_invoice_pdf, BASE_DIR
    data = request.json or {}
    member_id = data.get('member_id') or (data.get('member_data') or {}).get('member_id')
    
    # Safely convert potential empty strings to floats[span_14](start_span)[span_14](end_span)
    amount = safe_float(data.get('amount'))
    discount = safe_float(data.get('discount'))
    upi_id = os.getenv('UPI_ID', '')

    if not member_id:
        return jsonify({'status': 'error', 'message': 'missing_member_id'}), 400

    try:
        inv_no, pdf_url = generate_invoice_pdf(member_id, amount, discount, upi_id=upi_id)
        pdf_path = os.path.join(BASE_DIR, pdf_url.lstrip('/'))
        return send_file(pdf_path, as_attachment=True, download_name=f"{inv_no}.pdf")
    except Exception as e:
        app.logger.exception('generate_invoice failed')
        return jsonify({'status': 'error', 'message': 'Invoice generation failed.'}), 500


@app.route('/api/punch_kiosk', methods=['POST'])
def punch_kiosk():
    data = request.json or {}
    member_id = str(data.get('member_id') or '').strip().upper()
    if not member_id:
        return jsonify({'status': 'error', 'message': 'No Warrior ID provided.'}), 400

    client = ADMIN_SUPABASE or supabase or get_supabase_client()
    if not client:
        return jsonify({'status': 'error', 'message': 'System offline.'}), 500

    try:
        member_rows = client.table('members').select('*').eq('member_id', member_id).limit(1).execute().data
        if not member_rows:
            return jsonify({'status': 'error', 'message': 'Warrior ID not found.'})
        
        member = member_rows[0]
        expiry = member.get('expiry_date')
        
        if expiry:
            # Safely check expiry date accounting for potential ISO Z timezone characters
            clean_expiry = str(expiry)[:10]
            if clean_expiry < datetime.utcnow().date().isoformat():
                return jsonify({'status': 'error', 'message': 'Membership Expired.'})

        open_session = (client.table('attendance_logs').select('id')
                         .eq('member_id', member_id).is_('punch_out_time', 'null')
                         .order('punch_in_time', desc=True).limit(1).execute().data)

        name = member.get('name', 'Warrior')
        if open_session:
            client.table('attendance_logs').update({
                'punch_out_time': datetime.utcnow().isoformat(),
                'status': 'CHECK-OUT'
            }).eq('id', open_session[0]['id']).execute()
            message = f"Goodbye {name}, great session today!"
            punch_status = "CHECK-OUT"
        else:
            client.table('attendance_logs').insert({
                'member_id': member_id,
                'punch_in_time': datetime.utcnow().isoformat(),
                'status': 'CHECK-IN'
            }).execute()
            message = f"Welcome {name}, Crush your limits!"
            punch_status = "CHECK-IN"

        try:
            from _03_Automation_Bots.whatsapp_telegram_bot import send_attendance_whatsapp
            if member.get('phone'):
                send_attendance_whatsapp(member.get('phone'), name, punch_status)
        except Exception:
            app.logger.exception('Failed to send attendance WhatsApp')

        return jsonify({'status': 'success', 'name': name, 'message': message})
    except Exception:
        app.logger.exception('punch_kiosk failed')
        return jsonify({'status': 'error', 'message': 'System error.'}), 500


@app.route('/api/member_login', methods=['POST'])
def member_login():
    from _01_Core_Engines.ghost_vault_engine import validate_credentials
    data = request.json or {}
    member_id = str(data.get('member_id') or '').strip().upper()
    passcode = str(data.get('passcode') or '').strip()

    if not validate_credentials(member_id, passcode):
        return jsonify({'status': 'error', 'message': 'Invalid Warrior ID or Passcode'}), 401

    client = ADMIN_SUPABASE or supabase or get_supabase_client()
    if not client:
        return jsonify({'status': 'error', 'message': 'Database offline'}), 500

    try:
        profile = client.table('members').select('*').eq('member_id', member_id).limit(1).execute().data
        if not profile:
            return jsonify({'status': 'error', 'message': 'Profile not found'}), 404

        billing = (client.table('billing').select('due')
                         .eq('member_id', member_id)
                         .order('payment_date', desc=True)
                         .limit(1).execute().data)
        
        due = billing[0].get('due', 0) if billing else 0
        return jsonify({'status': 'success', 'profile': profile[0], 'billing': {'due': due}})
    except Exception:
        app.logger.exception('member_login failed')
        return jsonify({'status': 'error', 'message': 'login_failed'}), 500


@app.route('/api/get_warrior_plan', methods=['POST'])
def get_warrior_plan():
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
    data = request.json or {}
    prompt = (data.get('prompt') or '').strip()
    if not prompt:
        return jsonify({'response': 'Please enter a prompt.'})
    try:
        from _02_AI_Master_Agents.ai_orchestrator import AIOrchestrator
        result = AIOrchestrator().generate_with_fallback(prompt)
        response_text = result if isinstance(result, str) else result.get('message', 'AI offline.')
        return jsonify({'response': response_text})
    except Exception:
        app.logger.exception('ai_master failed')
        return jsonify({'response': '[ERROR] AI request failed.'}), 500

if __name__ == '__main__':
    app.run(debug=True, port=int(os.getenv("PORT", 5000)))
