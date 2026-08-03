from datetime import datetime
from supabase import create_client
import os

class EquipmentTracker:
    def __init__(self):
        url = os.getenv('SUPABASE_URL')
        key = os.getenv('SUPABASE_KEY')
        self.supabase = create_client(url, key)

    def log_equipment_usage(self, equipment_id, member_id):
        data = {
            "equipment_id": equipment_id,
            "member_id": member_id,
            "start_time": datetime.utcnow().isoformat()
        }
        self.supabase.table('equipment_usage').insert(data).execute()

    def get_maintenance_schedule(self):
        equipment = self.supabase.table('equipment').select('*').execute().data or []
        schedule = []
        for eq in equipment:
            try:
                last = datetime.fromisoformat(eq.get('last_maintained'))
                next_maint = last + timedelta(days=eq.get('maintenance_interval_days', 30))
                if datetime.utcnow() >= next_maint:
                    schedule.append({
                        'equipment_id': eq.get('id'),
                        'name': eq.get('name'),
                        'overdue_days': (datetime.utcnow() - next_maint).days
                    })
            except Exception:
                continue
        return schedule
