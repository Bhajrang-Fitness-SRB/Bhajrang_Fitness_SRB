import numpy as np
from datetime import datetime, timedelta
from collections import defaultdict
import logging

logger = logging.getLogger(__name__)
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)


class AttendanceEngine:
    def __init__(self, supabase_client):
        self.supabase = supabase_client

    def calculate_attendance_streak(self, member_id):
        """Calculates current attendance streak and a simple next-visit prediction."""
        try:
            logs_resp = self.supabase.table('attendance_logs').select('date, check_in').eq('member_id', member_id).execute()
            logs = logs_resp.data or []
        except Exception:
            logger.exception('Failed to fetch attendance logs')
            return {"streak": 0, "prediction": "No data"}

        if not logs:
            return {"streak": 0, "prediction": "No data"}

        # Extract dates (normalize)
        dates = sorted({
            (l.get('date') if l.get('date') else l.get('check_in', '')[:10]) for l in logs
        })

        # Compute streak (consecutive days up to yesterday)
        streak = 0
        today = datetime.utcnow().date()
        current = today
        for d in reversed(dates):
            try:
                dt = datetime.fromisoformat(d).date()
            except Exception:
                continue
            if dt == current - timedelta(days=1):
                streak += 1
                current = dt
            else:
                break

        # Frequency by weekday
        day_counts = defaultdict(int)
        for d in dates:
            try:
                day = datetime.fromisoformat(d).weekday()
                day_counts[day] += 1
            except Exception:
                continue

        if day_counts:
            most_frequent = max(day_counts, key=day_counts.get)
            confidence = day_counts[most_frequent] / len(dates) * 100
        else:
            most_frequent = None
            confidence = 0

        def _get_next_date(target_weekday):
            today = datetime.utcnow().date()
            days_ahead = target_weekday - today.weekday()
            if days_ahead <= 0:
                days_ahead += 7
            return today + timedelta(days=days_ahead)

        prediction = {
            "likely_day": most_frequent,
            "confidence": confidence,
            "next_suggested_visit": _get_next_date(most_frequent).isoformat() if most_frequent is not None else None
        }

        return {"streak": streak, "total_visits": len(dates), "prediction": prediction}
