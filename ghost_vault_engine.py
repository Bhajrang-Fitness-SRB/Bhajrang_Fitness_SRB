import os
import datetime
from flask import Blueprint, render_template, request, jsonify
from dotenv import load_dotenv
from google import genai
from google.genai import types

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(BASE_DIR, 'master_vault.env'))

# Create a Blueprint for Ghost Vault
ghost_vault_bp = Blueprint('ghost_vault_bp', __name__, template_folder='templates')

# Master PIN Verification Middleware / Check
MASTER_PIN = os.getenv("ADMIN_PIN", "925529")

@ghost_vault_bp.route('/ghost_vault/portal', methods=['GET'])
def vault_portal():
    return render_template('ghost_vault.html')

@ghost_vault_bp.route('/api/vault/verify', methods=['POST'])
def verify_vault():
    data = request.json
    pin = data.get('pin')
    if pin == MASTER_PIN:
        return jsonify({"status": "success", "message": "Access Granted to Ghost Vault."})
    return jsonify({"status": "error", "message": "Intruder Alert: Invalid Pin!"})

# 🧠 OMNI AI & GENERATION HUB FOR MASTER & STUDENTS
@ghost_vault_bp.route('/api/vault/ai_generate', methods=['POST'])
def vault_ai_generate():
    data = request.json
    mode = data.get('mode', 'general') # options: gym, medical, bike_trip, daily_routine, creator
    prompt = data.get('prompt', '')

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return jsonify({"status": "error", "response": "❌ AI Core Offline: GEMINI_API_KEY missing."})

    client = genai.Client(api_key=api_key)

    # Contextual System Instructions based on your needs
    sys_instruct = "You are the supreme AI of 'Bhajrang Fitness SRB' Ghost Vault. Assist Rajib Biswas with precision."
    
    if mode == 'gym':
        sys_instruct = "You are an expert Gym & Workout Master. Provide advanced training splits, injury prevention, and performance metrics."
    elif mode == 'medical':
        sys_instruct = "You are a professional Medical & Fitness Health Advisor. Analyze student injuries, rehabilitation, nutrition, and body vitals safely."
    elif mode == 'bike_trip':
        sys_instruct = "You are an expert Motorcycle Tour & Adventure Planner. Plan routes, maintenance checks, gear safety, and endurance nutrition for long rides."
    elif mode == 'daily_routine':
        sys_instruct = "You are a Life Productivity Coach. Structure daily routines, time-blocking, habit stacking, and energy management for a high-performance lifestyle."
    elif mode == 'creator':
        sys_instruct = "You are an Out-of-Station Innovation & Business Creator. Brainstorm new gym expansions, marketing campaigns, and startup strategies."

    try:
        res = client.models.generate_content(
            model='gemini-1.5-flash',
            config=types.GenerateContentConfig(system_instruction=sys_instruct, temperature=0.7),
            contents=prompt,
        )
        return jsonify({"status": "success", "response": res.text})
    except Exception as e:
        return jsonify({"status": "error", "response": f"❌ Neural Net Error: {str(e)}"})