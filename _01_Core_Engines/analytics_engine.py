import matplotlib.pyplot as plt
import io
import base64
from datetime import datetime
from collections import defaultdict

class AnalyticsEngine:
    def __init__(self, supabase_client):
        self.supabase = supabase_client

    def generate_attendance_heatmap(self):
        logs = self.supabase.table('attendance_logs').select('check_in').execute().data or []
        hourly = defaultdict(int)
        for l in logs:
            try:
                dt = datetime.fromisoformat(l['check_in'])
                key = (dt.strftime('%A'), dt.hour)
                hourly[key] += 1
            except Exception:
                continue

        # Very small example heatmap generation: aggregate to matrix
        days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
        hours = list(range(24))
        matrix = [[hourly.get((d, h), 0) for h in hours] for d in days]

        plt.figure(figsize=(12,6))
        plt.imshow(matrix, aspect='auto', cmap='YlOrRd')
        plt.yticks(range(len(days)), days)
        plt.xticks(range(0,24,2))
        plt.colorbar()

        buf = io.BytesIO()
        plt.savefig(buf, format='png')
        buf.seek(0)
        return base64.b64encode(buf.getvalue()).decode()

    def predict_churn_risk(self, member_id):
        member = self.supabase.table('members').select('*').eq('id', member_id).execute().data
        if not member:
            return {"error": "member_not_found"}
        member = member[0]

        attendance = self.supabase.table('attendance_logs').select('*').eq('member_id', member_id).execute().data or []
        billing = self.supabase.table('billing').select('*').eq('member_id', member_id).execute().data or []

        features = {
            'attendance_last_30_days': len([a for a in attendance if a.get('date') and datetime.fromisoformat(a['date']) > datetime.now() - timedelta(days=30)]),
            'payment_delays': len([b for b in billing if b.get('status') in ('delayed','late')]),
            'days_since_last_visit': (datetime.now() - datetime.fromisoformat(attendance[-1]['check_in'])).days if attendance else 999,
            'membership_duration': (datetime.now() - datetime.fromisoformat(member.get('join_date'))).days if member.get('join_date') else 0
        }

        risk_score = 0
        if features['attendance_last_30_days'] < 4:
            risk_score += 40
        if features['payment_delays'] > 0:
            risk_score += 30
        if features['days_since_last_visit'] > 14:
            risk_score += 20
        if features['membership_duration'] < 30:
            risk_score += 10

        return {
            'member_id': member_id,
            'risk_score': risk_score,
            'risk_level': 'High' if risk_score > 50 else 'Medium' if risk_score > 30 else 'Low'
        }
