import os
import sys
import time
import datetime
import requests
import traceback
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

# 🤖 Import Groq for Dual AI Core
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
# 📝 4. CORE API ROUTES
# ==========================================
@app.route('/api/get_all_members', methods=['GET'])
def get_all_members():
    try:
        res = supabase.table('members').select('*').execute()
        return jsonify({"status": "success", "members": res.data})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})

@app.route('/api/registration_sync', methods=['POST'])
def registration_sync():
    data = request.json
    phone = data.get('phone')
    name = data.get('name')
    face_base64 = data.get('face_image')
    
    image_url = ""
    if face_base64:
        try:
            upload_result = cloudinary.uploader.upload(face_base64, folder="bhajrang_biometrics")
            image_url = upload_result.get('secure_url')
        except: pass
            
    try:
        now = datetime.datetime.now()
        yy = now.strftime("%y")
        mm = now.strftime("%m")
        last_4_phone = phone[-4:] if phone and len(phone) >= 4 else "0000"
        member_id = f"RBF{yy}{mm}{last_4_phone}"
        passcode = f"{data.get('dob', '').split('-')[1] if len(data.get('dob', '').split('-')) >= 2 else '01'}{member_id[-2:]}"
        
        member_data = {
            "member_id": member_id, "name": name, "phone": phone, "dob": data.get('dob'),
            "profile_pic": image_url, "joining_date": now.strftime("%Y-%m-%d"), "package": "Active"
        }
        supabase.table('members').insert(member_data).execute()
        supabase.table('ghost_vault').insert({ "name": name, "member_id": member_id, "mobile": phone, "passcode": passcode, "join_date": now.strftime("%Y-%m-%d %H:%M:%S") }).execute()
        
        return jsonify({"status": "success", "message": f"Profile Secured! ID: {member_id}"})
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

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
