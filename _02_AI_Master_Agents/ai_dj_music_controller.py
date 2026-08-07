from datetime import datetime

def get_time_of_day():
    """
    Automatically detects if it is morning, afternoon, or evening based on the server clock.
    """
    hour = datetime.now().hour
    if 5 <= hour < 12:
        return "morning"
    elif 12 <= hour < 17:
        return "afternoon"
    else:
        return "evening"

def get_gym_vibe_bpm(active_members_count, time_of_day=None):
    """
    Dynamically adjusts the gym music BPM and genre based on crowd density and time.
    """
    # Auto-detect the time if the main engine doesn't provide it
    if not time_of_day:
        time_of_day = get_time_of_day()
        
    time_of_day = time_of_day.lower()

    # 1. Evening Peak (Heavy Lifters)
    if active_members_count > 20 and time_of_day == "evening":
        return {
            "bpm": 128, 
            "genre": "Hardstyle & Phonk", 
            "vibe": "High Energy Peak"
        }
        
    # 2. Morning Rush (Cardio & Active Lifters)
    elif active_members_count > 20 and time_of_day == "morning":
        return {
            "bpm": 120, 
            "genre": "Upbeat EDM & Tech House", 
            "vibe": "Morning Rush"
        }
        
    # 3. Standard Medium Crowd
    elif active_members_count > 10:
        return {
            "bpm": 110, 
            "genre": "Bass House & Trap", 
            "vibe": "Active Pumping"
        }
        
    # 4. Empty / Warmup / Closing Time
    else:
        return {
            "bpm": 90, 
            "genre": "Lo-Fi Hip Hop & Warmup", 
            "vibe": "Chill & Focused"
        }

# ==========================================
# TEST THE DJ BOT (Run this file directly to test)
# ==========================================
if __name__ == "__main__":
    print("🎧 BHAJRANG FITNESS DJ BOT BOOTING...\n")
    
    # Test 1: Evening with 25 people
    vibe1 = get_gym_vibe_bpm(active_members_count=25, time_of_day="evening")
    print(f"Scenario 1 (25 members, Evening): {vibe1['genre']} at {vibe1['bpm']} BPM")
    
    # Test 2: Auto-detecting current time with 5 people
    current_time = get_time_of_day()
    vibe2 = get_gym_vibe_bpm(active_members_count=5)
    print(f"Scenario 2 (5 members, Current Time [{current_time}]): {vibe2['genre']} at {vibe2['bpm']} BPM")