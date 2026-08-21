from datetime import datetime

def get_time_of_day() -> str:
    """Detects morning, afternoon, or evening based on the server clock."""
    hour = datetime.now().hour
    if 5 <= hour < 12:
        return "morning"
    elif 12 <= hour < 17:
        return "afternoon"
    else:
        return "evening"

def get_gym_vibe_bpm(active_members_count: int, time_of_day: str = None) -> dict:
    """Dynamically adjusts gym music BPM and genre based on crowd density and time."""
    try:
        count = max(0, int(active_members_count or 0))
    except (ValueError, TypeError):
        count = 0

    if not time_of_day:
        time_of_day = get_time_of_day()
        
    time_of_day = str(time_of_day).lower().strip()

    if count > 20 and time_of_day == "evening":
        return {"bpm": 128, "genre": "Hardstyle & Phonk", "vibe": "High Energy Peak"}
    elif count > 20 and time_of_day == "morning":
        return {"bpm": 120, "genre": "Upbeat EDM & Tech House", "vibe": "Morning Rush"}
    elif count > 10:
        return {"bpm": 110, "genre": "Bass House & Trap", "vibe": "Active Pumping"}
    else:
        return {"bpm": 90, "genre": "Lo-Fi Hip Hop & Warmup", "vibe": "Chill & Focused"}
