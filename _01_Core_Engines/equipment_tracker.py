import os
import logging
from datetime import datetime, timedelta
from supabase import create_client

logger = logging.getLogger("equipment_tracker")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)

class EquipmentTracker:
    def __init__(self, supabase_client=None):
        if supabase_client:
            self.supabase = supabase_client
        else:
            url = os.getenv('SUPABASE_URL')
            key = os.getenv('SUPABASE_KEY')
            if not url or not key:
                logger.error("Supabase credentials missing for EquipmentTracker.")
                self.supabase = None
            else:
                self.supabase = create_client(url, key)

    def log_equipment_usage(self, equipment_id: str, member_id: str) -> bool:
        if not self.supabase:
            logger.error("Database client uninitialized.")
            return False
        try:
            data = {
                "equipment_id": equipment_id,
                "member_id": member_id,
                "start_time": datetime.utcnow().isoformat()
            }
            self.supabase.table('equipment_usage').insert(data).execute()
            logger.info(f"Logged equipment usage: Equipment {equipment_id} by Member {member_id}")
            return True
        except Exception as e:
            logger.exception(f"Failed to log equipment usage for {equipment_id}: {e}")
            return False

    def get_maintenance_schedule(self) -> list:
        if not self.supabase:
            logger.error("Database client uninitialized.")
            return []
            
        try:
            equipment = self.supabase.table('equipment').select('*').execute().data or []
        except Exception as e:
            logger.exception(f"Failed to fetch equipment list: {e}")
            return []

        schedule = []
        now = datetime.utcnow()

        for eq in equipment:
            last_maint_raw = eq.get('last_maintained')
            if not last_maint_raw:
                continue

            try:
                # Handle ISO strings with Z or offsets
                clean_date = last_maint_raw.replace('Z', '+00:00')
                last = datetime.fromisoformat(clean_date)
                if last.tzinfo:
                    last = last.replace(tzinfo=None)

                interval_days = int(eq.get('maintenance_interval_days', 30))
                next_maint = last + timedelta(days=interval_days)

                if now >= next_maint:
                    overdue = (now - next_maint).days
                    schedule.append({
                        'equipment_id': eq.get('id'),
                        'name': eq.get('name', 'Unknown Equipment'),
                        'overdue_days': overdue,
                        'next_maintenance_due': next_maint.strftime("%Y-%m-%d")
                    })
            except Exception as parse_err:
                logger.warning(f"Skipping equipment {eq.get('id')} due to invalid date format: {parse_err}")
                continue

        return schedule
