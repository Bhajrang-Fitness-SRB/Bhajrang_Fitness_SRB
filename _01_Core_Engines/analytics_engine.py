import io
import base64
import logging
from datetime import datetime, timedelta
from collections import defaultdict

# Configure Matplotlib for headless Render servers before importing pyplot
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

logger = logging.getLogger("analytics_engine")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)

class AnalyticsEngine:
    def __init__(self, supabase_client):
        self.supabase = supabase_client

    def generate_attendance_heatmap(self) -> str:
        if not self.supabase:
            logger.error("Database client uninitialized in AnalyticsEngine.")
            return ""

        try:
            logs = self.supabase.table('attendance_logs').select('check_in').execute().data or []
        except Exception as e:
            logger.exception(f"Error fetching logs for heatmap: {e}")
            return ""

        hourly = defaultdict(int)
        for l in logs:
            raw_check_in = l.get('check_in')
            if not raw_check_in:
                continue
            try:
                dt = datetime.fromisoformat(raw_check_in.replace('Z', '+00:00'))
                key = (dt.strftime('%A'), dt.hour)
                hourly[key] += 1
            except Exception:
                continue

        days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        hours = list(range(24))
        matrix = [[hourly.get((d, h), 0) for h in hours] for d in days]

        fig, ax = plt.subplots(figsize=(12, 6))
        cax = ax.imshow(matrix, aspect='auto', cmap='YlOrRd')
        ax.set_yticks(range(len(days)))
        ax.set_yticklabels(days)
        ax.set_xticks(range(0, 24, 2))
        ax.set_xticklabels([f"{h:02d}:00" for h in range(0, 24, 2)])
        ax.set_title("Gym Traffic & Attendance Heatmap", fontsize=14, pad=12)
        fig.colorbar(cax, orientation='vertical')
        plt.tight_layout()

        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=150)
        plt.close(fig)  # Prevent server memory leaks
        buf.seek(0)
        return base64.b64encode(buf.getvalue()).decode('utf-8')

    def predict_churn_risk(self, member_id: str) -> dict:
        if not self.supabase:
            return {"error": "database_not_connected"}

        try:
            member_resp = self.supabase.table('members').select('*').eq('id', member_id).execute().data
            if not member_resp:
                return {"error": "member_not_found"}
            member = member_resp[0]

            attendance = self.supabase.table('attendance_logs').select('*').eq('member_id', member_id).execute().data or []
            billing = self.supabase.table('billing').select('*').eq('member_id', member_id).execute().data or []
        except Exception as e:
            logger.exception(f"Failed querying data for churn prediction: {e}")
            return {"error": "query_failed", "details": str(e)}

        now = datetime.now()
        thirty_days_ago = now - timedelta(days=30)

        # Count attendance in the last 30 days
        recent_visits = 0
        for a in attendance:
            d_val = a.get('date') or a.get('check_in')
            if d_val:
                try:
                    dt = datetime.fromisoformat(d_val[:10])
                    if dt >= thirty_days_ago:
                        recent_visits += 1
                except Exception:
                    continue

        payment_delays = len([b for b in billing if b.get('status') in ('delayed', 'late', 'unpaid')])

        days_since_last_visit = 999
        if attendance:
            try:
                last_check_in = attendance[-1].get('check_in') or attendance[-1].get('date')
                if last_check_in:
                    dt_last = datetime.fromisoformat(last_check_in[:10])
                    days_since_last_visit = (now - dt_last).days
            except Exception:
                pass

        membership_duration = 0
        if member.get('join_date'):
            try:
                join_dt = datetime.fromisoformat(member['join_date'][:10])
                membership_duration = (now - join_dt).days
            except Exception:
                pass

        risk_score = 0
        if recent_visits < 4:
            risk_score += 40
        if payment_delays > 0:
            risk_score += 30
        if days_since_last_visit > 14:
            risk_score += 20
        if membership_duration < 30:
            risk_score += 10

        return {
            'member_id': member_id,
            'risk_score': risk_score,
            'risk_level': 'High' if risk_score >= 50 else 'Medium' if risk_score >= 30 else 'Low',
            'metrics': {
                'attendance_last_30_days': recent_visits,
                'payment_delays': payment_delays,
                'days_since_last_visit': days_since_last_visit,
                'membership_duration_days': membership_duration
            }
        }
