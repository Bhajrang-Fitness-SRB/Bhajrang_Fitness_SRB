import json
import logging
from _02_AI_Master_Agents.ai_orchestrator import AIOrchestrator

logger = logging.getLogger(__name__)
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)

class AIDietGenerator:
    def __init__(self):
        self.ai = AIOrchestrator()

    def _sanitize_json(self, text: str) -> str:
        text = text.strip()
        if text.startswith("```json"):
            text = text[7:]
        elif text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        return text.strip()

    def generate_diet_plan(self, member_profile: dict):
        prompt = f"""
        Create a detailed 7-day diet plan for a gym member:
        Goal: {member_profile.get('goal', 'Maintenance')}
        Diet preference: {member_profile.get('diet_preference', 'vegetarian')}
        Weight: {member_profile.get('weight', 70)} kg
        Height: {member_profile.get('height', 170)} cm
        Age: {member_profile.get('age', 25)}
        Activity level: {member_profile.get('activity_level', 'moderate')}

        Format strictly as valid JSON with keys: monday, tuesday, wednesday, thursday, friday, saturday, sunday.
        Each day must have: "breakfast", "lunch", "dinner", "snacks", "calories" (int), "protein_grams" (int).
        """

        response = self.ai.generate_with_fallback(prompt)
        
        if isinstance(response, dict):
            return self._get_fallback_plan(member_profile)

        try:
            clean_json = self._sanitize_json(response)
            return json.loads(clean_json)
        except Exception as e:
            logger.exception(f"Failed to parse AI diet response: {e}")
            return self._get_fallback_plan(member_profile)

    def _get_fallback_plan(self, profile: dict):
        return {
            "monday": {"breakfast": "Oats + fruits", "lunch": "Dal, rice, salad", "snacks": "Nuts", "dinner": "Grilled paneer + veggies", "calories": 1800, "protein_grams": 60},
            "tuesday": {"breakfast": "Poha + sprouts", "lunch": "Roti, sabzi, curd", "snacks": "Fruit", "dinner": "Soup + salad", "calories": 1800, "protein_grams": 55},
            "wednesday": {"breakfast": "Smoothie + nuts", "lunch": "Rice, rajma, salad", "snacks": "Roasted chana", "dinner": "Grilled tofu + veggies", "calories": 1800, "protein_grams": 65},
            "thursday": {"breakfast": "Paneer bhurji + toast", "lunch": "Khichdi + curd", "snacks": "Protein shake", "dinner": "Stir-fry veggies", "calories": 1800, "protein_grams": 70},
            "friday": {"breakfast": "Oats + peanut butter", "lunch": "Roti, chana, salad", "snacks": "Yogurt", "dinner": "Light soup + salad", "calories": 1800, "protein_grams": 55},
            "saturday": {"breakfast": "Idli + sambhar", "lunch": "Rice, dal, sabzi", "snacks": "Fruit", "dinner": "Grilled protein + veggies", "calories": 1800, "protein_grams": 60},
            "sunday": {"breakfast": "Paratha + curd", "lunch": "Cheat meal", "snacks": "Green tea", "dinner": "Light khichdi", "calories": 1900, "protein_grams": 50},
        }
