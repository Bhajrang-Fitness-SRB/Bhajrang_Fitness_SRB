from _02_AI_Master_Agents.ai_orchestrator import AIOrchestrator
import json
import logging

logger = logging.getLogger(__name__)
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)


class AIWorkoutGenerator:
    def __init__(self):
        self.ai = AIOrchestrator()

    def generate_workout_plan(self, member_profile: dict):
        """Generate a 7-day workout plan using the orchestrator.

        member_profile should contain experience_level, goal, days_available, injuries, preferred_time.
        """
        prompt = f"""
        Create a detailed 7-day workout plan for a gym member:
        Experience: {member_profile.get('experience_level')}
        Goal: {member_profile.get('goal')}
        Available days: {member_profile.get('days_available')}
        Injuries: {member_profile.get('injuries', 'None')}
        Time preference: {member_profile.get('preferred_time')}

        Format as JSON with day, focus, exercises (sets x reps), duration, intensity.
        """

        response = self.ai.generate_with_fallback(prompt)
        # If the orchestrator returned a dict (cache), surface it
        if isinstance(response, dict):
            return response

        # otherwise try to parse JSON
        try:
            return json.loads(response)
        except Exception:
            logger.exception("Failed to parse AI response; returning fallback plan")
            return self._get_fallback_plan(member_profile)

    def _get_fallback_plan(self, profile: dict):
        # Minimal fallback plans
        return {
            "monday": {"focus": "Chest", "exercises": ["Bench Press 3x10"], "duration": 45},
            "tuesday": {"focus": "Back", "exercises": ["Pullups 3x8"], "duration": 45},
            "wednesday": {"focus": "Legs", "exercises": ["Squat 3x8"], "duration": 50},
            "thursday": {"focus": "Shoulders", "exercises": ["Overhead Press 3x10"], "duration": 40},
            "friday": {"focus": "Full Body", "exercises": ["Circuit 30min"], "duration": 30},
            "saturday": {"focus": "Cardio", "exercises": ["Run 30min"], "duration": 30},
            "sunday": {"focus": "Rest", "exercises": [], "duration": 0},
        }
