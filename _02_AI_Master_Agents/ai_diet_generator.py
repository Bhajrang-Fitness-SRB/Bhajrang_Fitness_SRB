from _02_AI_Master_Agents.ai_orchestrator import AIOrchestrator
import json
import logging

logger = logging.getLogger(__name__)
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)


class AIDietGenerator:
    def __init__(self):
        self.ai = AIOrchestrator()

    def generate_diet_plan(self, member_profile: dict):
        """Generate a 7-day diet plan using the orchestrator.

        member_profile should contain goal, diet_preference, weight, height, age,
        activity_level (used the same way the TDEE calculator does on the frontend).
        """
        prompt = f"""
        Create a detailed 7-day diet plan for a gym member:
        Goal: {member_profile.get('goal')}
        Diet preference: {member_profile.get('diet_preference', 'vegetarian')}
        Weight: {member_profile.get('weight')} kg
        Height: {member_profile.get('height')} cm
        Age: {member_profile.get('age')}
        Activity level: {member_profile.get('activity_level', 'moderate')}

        Format as JSON with day, meals (breakfast, lunch, dinner, snacks), and
        approximate total calories and protein for that day.
        """

        response = self.ai.generate_with_fallback(prompt)
        if isinstance(response, dict):
            return response

        try:
            return json.loads(response)
        except Exception:
            logger.exception("Failed to parse AI diet response; returning fallback plan")
            return self._get_fallback_plan(member_profile)

    def _get_fallback_plan(self, profile: dict):
        return {
            "monday": {"breakfast": "Oats + fruits", "lunch": "Dal, rice, salad", "dinner": "Grilled paneer/chicken + veggies", "calories": 1800},
            "tuesday": {"breakfast": "Poha + sprouts", "lunch": "Roti, sabzi, curd", "dinner": "Soup + salad", "calories": 1800},
            "wednesday": {"breakfast": "Smoothie + nuts", "lunch": "Rice, rajma, salad", "dinner": "Grilled fish/tofu + veggies", "calories": 1800},
            "thursday": {"breakfast": "Eggs/paneer bhurji + toast", "lunch": "Khichdi + curd", "dinner": "Stir-fry veggies + protein", "calories": 1800},
            "friday": {"breakfast": "Oats + peanut butter", "lunch": "Roti, chana, salad", "dinner": "Light soup + salad", "calories": 1800},
            "saturday": {"breakfast": "Idli/dosa + sambhar", "lunch": "Rice, dal, sabzi", "dinner": "Grilled protein + veggies", "calories": 1800},
            "sunday": {"breakfast": "Paratha + curd", "lunch": "Cheat meal (in moderation)", "dinner": "Light khichdi", "calories": 1900},
        }
