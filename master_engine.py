import os
import sys
import time
import json
import datetime
import requests
import traceback
from dateutil.relativedelta import relativedelta
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

# ==========================================
# ☁️ CLOUD & AI LIBRARIES
# ==========================================
from supabase import create_client, Client
import cloudinary
import cloudinary.uploader
from google import genai

# 🤖 Import Groq for Dual AI Core (Fallback)
try:
    from groq import Groq
except ImportError:
    pass

try:
    from whatsapp_telegram_bot import send_telegram_alert, send_whatsapp_message, send_attendance_whatsapp
except ImportError:
    def send_telegram_alert(*args, **kwargs): pass
    def send_whatsapp_message(*args, **kwargs): pass
    def send_attendance_whatsapp(*args, **kwargs): pass

try:
    from billing_invoice_gateway import generate_invoice_pdf
except ImportError:
    def generate_invoice_pdf(*args, **kwargs): return "INV-000", "#"

try:
    from id_generator import generate_warrior_id
except ImportError:
    def generate_warrior_id(*args, **kwargs): return False

# ==========================================
# 1. INITIALIZATION & CONFIG
# ==========================================
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
VAULT_ENV_PATH = os.path.join(BASE_DIR, 'master_vault.env')
load_dotenv(VAULT_ENV_PATH)

app = Flask(__name__, template_folder='templates', static_folder='static')
CORS(app) 
app.secret_key = os.getenv("SECRET_KEY", "SRB_BFRB_2026")
GYM_NAME = "Bhajrang Fitness SRB"

# 🔐 SECRET PORTAL URLs
ADMIN_URL = os.getenv("ADMIN_PORTAL_URL", "/villain")
DESK_URL = os.getenv("DESK_PORTAL_URL", "/administration")
STAFF_URL = os.getenv("STAFF_PORTAL_URL", "/commander")
STUDENT_URL = os.getenv("STUDENT_PORTAL_URL", "/warrior")

# 🔑 MASTER API KEYS
GEMINI_KEY = os.getenv("GEMINI_API_KEY")
GROQ_KEY = os.getenv("GROQ_API_KEY")
CLOUDINARY_KEY = os.getenv("CLOUDINARY_API_KEY")

# ==========================================
# 2. CLOUD INFRASTRUCTURE SETUP
# ==========================================
supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
supabase_key = os.environ.get("SUPABASE_KEY", "")
supabase: Client = None

if supabase_url and supabase_key:
    try:
        supabase = create_client(supabase_url, supabase_key)
        print("✅ SUPABASE CLOUD DB: SECURED")
    except Exception as e:
        print(f"❌ SUPABASE DB ERROR: {e}")

c_name = os.getenv("CLOUDINARY_CLOUD_NAME")
if c_name and CLOUDINARY_KEY:
    cloudinary.config(cloud_name=c_name, api_key=CLOUDINARY_KEY, api_secret=os.getenv("CLOUDINARY_API_SECRET"), secure=True)

# ==========================================
# 🚀 3. FRONTEND ROUTES
# ==========================================
@app.route(ADMIN_URL)
@app.route(DESK_URL)
def admin_portal():
    try:
        return render_template('admin.html')
    except:
        return render_template('index.html')

@app.route(STUDENT_URL)
def member_app(): return render_template('member_app.html')

@app.route('/enroll')
def universal_registration(): return render_template('registration_form.html')

@app.route('/kiosk')
def kiosk_terminal(): return render_template('kiosk.html')

# ==========================================
# 🔄 4. AUTO-SYNC & MASTER TELEMETRY ENGINE
# ==========================================
@app.route('/api/master_sync', methods=['GET'])
def master_sync():
    """Real-time sync API for the Admin Dashboard (No page refresh needed)"""
    try:
        # 1. Fetch Pending Approvals (where original_frozen_id is null/not approved)
        pending_res = supabase.table('pending_approvals').select('*').is_('original_frozen_id', 'null').execute()
        
        # 2. Revenue & Expense Calculations for P/L
        today = datetime.datetime.now().strftime("%Y-%m-%d")
        billing_res = supabase.table('billing').select('*').execute()
        expense_res = supabase.table('expenses').select('*').execute()
        
        total_revenue = sum([b.get('paid', 0) for b in billing_res.data if b.get('paid')])
        today_revenue = sum([b.get('paid', 0) for b in billing_res.data if b.get('paid') and b.get('payment_date') == today])
        total_expenses = sum([e.get('amount', 0) for e in expense_res.data if e.get('amount')])
        net_profit = total_revenue - total_expenses

        # 3. Total Members & Today's Attendance
        members_res = supabase.table('members').select('member_id').execute()
        attendance_res = supabase.table('attendance_logs').select('*').like('punch_in_time', f"%{today}%").execute()

        return jsonify({
            "status": "success",
            "dashboard": {
                "total_members": len(members_res.data),
                "pending_count": len(pending_res.data),
                "today_revenue": today_revenue,
                "net_profit": net_profit,
                "today_attendance": len(attendance_res.data)
            },
            "pending_records": pending_res.data,
            "billing_records": billing_res.data
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})

# ==========================================
# 📝 5. ENROLLMENT & APPROVAL WORKFLOW
# ==========================================
@app.route('/api/submit_registration', methods=['POST'])
def submit_registration():
    data = request.json
    try:
        extra_data = {
            "father_name": data.get('father_name'), "gender": data.get('gender'),
            "blood_group": data.get('blood_group'), "govt_id": data.get('govt_id'),
            "occupation": data.get('occupation'), "marital_status": data.get('marital_status'),
            "whatsapp": data.get('whatsapp'), "city": data.get('city'),
            "state": data.get('state'), "pin": data.get('pin'), "gym_exp": data.get('gym_exp')
        }
        
        payload = {
            "name": data.get('name'),
            "mobile": data.get('phone'),
            "email": data.get('email'),
            "dob": data.get('dob') if data.get('dob') else None,
            "address": data.get('address'),
            "photo_base64": data.get('photo_base64'),
            "signature_b64": data.get('signature_b64'),
            "match_status": json.dumps(extra_data)
        }
        
        supabase.table('pending_approvals').insert(payload).execute()
        send_telegram_alert(f"⚠️ Action Required: New Enrolment from {data.get('name')} ({data.get('phone')}).", "NEW_MEMBER")
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})

@app.route('/api/approve_member', methods=['POST'])
def approve_member():
    data = request.json
    req_id = data.get('req_id')
    package_name = f"{data.get('class_type')} - {data.get('duration')} Months"
    
    amount = int(data.get('amount', 0))
    discount = int(data.get('discount', 0))
    paid = int(data.get('paid', 0))
    due = (amount - discount) - paid
    duration_months = int(data.get('duration', 1))

    try:
        # Fetch Pending Record
        pending_record = supabase.table('pending_approvals').select('*').eq('id', req_id).execute()
        if not pending_record.data:
            return jsonify({"status": "error", "message": "Pending record not found."})
        
        p_data = pending_record.data[0]
        phone = p_data.get('mobile')
        name = p_data.get('name')
        
        extra_fields = {}
        if p_data.get('match_status'):
            try: extra_fields = json.loads(p_data.get('match_status'))
            except: pass

        # Generate ID & Dates
        now = datetime.datetime.now()
        yy = now.strftime("%y")
        mm = now.strftime("%m")
        last_4 = phone[-4:] if phone and len(phone) >= 4 else "0000"
        member_id = f"RBF{yy}{mm}{last_4}"
        passcode = f"01{member_id[-2:]}"
        
        join_date = now.strftime("%Y-%m-%d")
        expiry_date = (now + relativedelta(months=duration_months)).strftime("%Y-%m-%d")

        # Upload Photo to Cloudinary
        image_url = ""
        if p_data.get('photo_base64'):
            try:
                upload_res = cloudinary.uploader.upload(p_data['photo_base64'], folder="bhajrang_verified")
                image_url = upload_res.get('secure_url')
            except: pass

        # 1. Sync `members` Table
        member_insert = {
            "member_id": member_id, "name": name, "father_name": extra_fields.get('father_name'),
            "dob": p_data.get('dob'), "gender": extra_fields.get('gender'),
            "blood_group": extra_fields.get('blood_group'), "govt_id": extra_fields.get('govt_id'),
            "occupation": extra_fields.get('occupation'), "marital_status": extra_fields.get('marital_status'),
            "phone": phone, "whatsapp": extra_fields.get('whatsapp'), "email": p_data.get('email'),
            "address": p_data.get('address'), "city": extra_fields.get('city'),
            "state": extra_fields.get('state'), "pin": extra_fields.get('pin'),
            "gym_experience_years": extra_fields.get('gym_exp'), "profile_pic": image_url,
            "joining_date": join_date, "package": package_name, "expiry_date": expiry_date
        }
        supabase.table('members').insert(member_insert).execute()

        # 2. Sync `ghost_vault` Table
        supabase.table('ghost_vault').insert({
            "name": name, "member_id": member_id, "mobile": phone,
            "passcode": passcode, "join_date": join_date
        }).execute()

        # 3. Sync `billing` Table
        supabase.table('billing').insert({
            "member_id": member_id, "package_name": package_name,
            "amount": amount, "discount": discount, "paid": paid, "due": due,
            "payment_date": join_date, "expiry_date": expiry_date
        }).execute()
        
        # 4. Mark Pending as Approved
        supabase.table('pending_approvals').update({"original_frozen_id": member_id, "status": "APPROVED"}).eq('id', req_id).execute()

        # 5. Send Automated WhatsApp Notification
        welcome_msg = f"🎉 Welcome to Bhajrang Fitness SRB, Warrior!\n\nName: {name}\nYour Official ID: *{member_id}*\nApp Passcode: *{passcode}*\nPackage: {package_name}\n\nLogin to Warrior Portal: {STUDENT_URL}"
        send_whatsapp_message(phone, welcome_msg)

        return jsonify({"status": "success", "member_id": member_id})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})

# ==========================================
# 💰 6. EXPENSES & UTILITIES
# ==========================================
@app.route('/api/add_expense', methods=['POST'])
def add_expense():
    data = request.json
    try:
        supabase.table('expenses').insert({
            "expense_name": data.get('name'),
            "amount": int(data.get('amount', 0))
        }).execute()
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})

@app.route('/api/get_all_members', methods=['GET'])
def get_all_members():
    try:
        res = supabase.table('members').select('*').execute()
        return jsonify({"status": "success", "members": res.data})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})

@app.route('/api/generate_invoice', methods=['POST'])
def create_invoice():
    data = request.json
    member_id = data.get('member_id')
    pkg = float(data.get('package', 0))
    discount = float(data.get('discount', 0))
    try:
        inv_no, pdf_url = generate_invoice_pdf(member_id, pkg, discount, GYM_NAME, os.getenv("UPI_ID", ""))
        return jsonify({"status": "success", "message": "Invoice securely generated", "pdf_url": pdf_url})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})

# ==========================================
# 🤖 7. DUAL AI CORE (GEMINI + GROQ)
# ==========================================
@app.route('/api/ai_master', methods=['POST'])
def ai_master():
    data = request.json
    prompt = data.get('prompt', '')
    sys_instruct = "You are the Elite AI Coach for 'Bhajrang Fitness SRB'. Generate professional workout or diet plans."
    
    if GEMINI_KEY:
        try:
            client = genai.Client(api_key=GEMINI_KEY)
            full_prompt = f"System Instruction: {sys_instruct}\n\nUser Request: {prompt}"
            res = client.models.generate_content(model='gemini-1.5-flash', contents=full_prompt)
            return jsonify({"response": f"[💎 GEMINI] {res.text}"})
        except Exception as e:
            pass
    if GROQ_KEY:
        try:
            groq_client = Groq(api_key=GROQ_KEY)
            chat_completion = groq_client.completions.create(
                model="llama3-8b-8192", prompt=f"{sys_instruct}\n\nUser: {prompt}\nAI:", temperature=0.7, max_tokens=1024
            )
            return jsonify({"response": f"[⚡ GROQ] {chat_completion.choices[0].text}"})
        except Exception as e:
            return jsonify({"response": f"❌ Both AI Cores Offline: {str(e)}"})
            
    return jsonify({"response": "❌ AI Keys missing!"})

# ==========================================
# 🛑 8. KIOSK ATTENDANCE & MEMBER APP API
# ==========================================
@app.route('/api/punch_kiosk', methods=['POST'])
def punch_kiosk():
    data = request.json
    mem_id = data.get('member_id')
    try:
        # Check if member exists
        member = supabase.table('members').select('*').eq('member_id', mem_id).execute()
        if not member.data: return jsonify({"status": "error", "message": "Invalid Warrior ID!"})
        
        # Check if already punched in today
        today = datetime.datetime.now().strftime("%Y-%m-%d")
        logs = supabase.table('attendance_logs').select('*').eq('member_id', mem_id).like('punch_in_time', f"%{today}%").execute()
        
        if logs.data:
            # Already in, so Punch Out
            supabase.table('attendance_logs').update({"punch_out_time": datetime.datetime.now().isoformat()}).eq('id', logs.data[0]['id']).execute()
            msg = f"Goodbye {member.data[0]['name']}, Workout Complete! 💪"
        else:
            # Punch In
            supabase.table('attendance_logs').insert({"member_id": mem_id}).execute()
            msg = f"Welcome {member.data[0]['name']}, Crush your limits! 🔥"
            
        return jsonify({"status": "success", "message": msg, "name": member.data[0]['name'], "pic": member.data[0]['profile_pic']})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})

@app.route('/api/member_login', methods=['POST'])
def member_login():
    data = request.json
    mem_id = data.get('member_id')
    passcode = data.get('passcode')
    try:
        # Verify from Ghost Vault
        verify = supabase.table('ghost_vault').select('*').eq('member_id', mem_id).eq('passcode', passcode).execute()
        if not verify.data: return jsonify({"status": "error", "message": "Invalid ID or Passcode"})
        
        # Fetch Full Data
        mem_data = supabase.table('members').select('*').eq('member_id', mem_id).execute()
        bill_data = supabase.table('billing').select('*').eq('member_id', mem_id).execute()
        
        return jsonify({"status": "success", "profile": mem_data.data[0], "billing": bill_data.data[0] if bill_data.data else {}})
    except Exception as e:
        return jsonify({"status": "error", "message": "Login Failed!"})

# ==========================================
# 🚀 9. SERVER LAUNCHER
# ==========================================
if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
