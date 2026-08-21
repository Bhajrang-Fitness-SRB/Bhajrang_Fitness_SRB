import json
import logging
from _02_AI_Master_Agents.ai_orchestrator import AIOrchestrator

logger = logging.getLogger(__name__)
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)

class AIWorkoutGenerator:
    def __init__(self):
        self.ai = AIOrchestrator()

    def _sanitize_json(self, text: str) -> str:
        """Strips markdown code blocks from LLM output so json.loads doesn't crash."""
        text = text.strip()
        if text.startswith("```json"):
            text = text[7:]
        elif text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        return text.strip()

    def generate_workout_plan(self, member_profile: dict):
        prompt = f"""
        Create a detailed 7-day workout plan for a gym member:
        Experience: {member_profile.get('experience_level', 'Beginner')}
        Goal: {member_profile.get('goal', 'General Fitness')}
        Available days: {member_profile.get('days_available', '3 days')}
        Injuries: {member_profile.get('injuries', 'None')}
        Time preference: {member_profile.get('preferred_time', 'Any')}

        Format strictly as valid JSON with keys for monday, tuesday, wednesday, thursday, friday, saturday, sunday.
        Each day must have: "focus", "exercises" (list of strings like "Squat 3x8"), "duration" (int), "intensity" (string).
        """

        response = self.ai.generate_with_fallback(prompt)
        
        if isinstance(response, dict):
            return self._get_fallback_plan(member_profile)

        try:
            clean_json = self._sanitize_json(response)
            return json.loads(clean_json)
        except Exception as e:
            logger.exception(f"Failed to parse AI workout response: {e}")
            return self._get_fallback_plan(member_profile)

    def _get_fallback_plan(self, profile: dict):
        return {
            "monday": {"focus": "Chest", "exercises": ["Bench Press 3x10"], "duration": 45, "intensity": "Medium"},
            "tuesday": {"focus": "Back", "exercises": ["Pullups 3x8"], "duration": 45, "intensity": "Medium"},
            "wednesday": {"focus": "Legs", "exercises": ["Squat 3x8"], "duration": 50, "intensity": "High"},
            "thursday": {"focus": "Shoulders", "exercises": ["Overhead Press 3x10"], "duration": 40, "intensity": "Medium"},
            "friday": {"focus": "Full Body", "exercises": ["Circuit 30min"], "duration": 30, "intensity": "High"},
            "saturday": {"focus": "Cardio", "exercises": ["Run 30min"], "duration": 30, "intensity": "Low"},
            "sunday": {"focus": "Rest", "exercises": [], "duration": 0, "intensity": "None"},
        }
