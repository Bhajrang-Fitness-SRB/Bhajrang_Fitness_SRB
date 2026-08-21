import logging
from typing import Dict
from _02_AI_Master_Agents.ai_orchestrator import AIOrchestrator

logger = logging.getLogger(__name__)
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)

class AIBusinessMarketing:
    def __init__(self):
        self.ai = AIOrchestrator()

    def generate_promo_message(self, context: str = "summer discount") -> str:
        """
        Generates dynamic promotional messages using AI based on context.
        """
        prompt = f"""
        Write a short, punchy, high-energy SMS/WhatsApp promotional message for 'Bhajrang Fitness SRB'.
        The context of the promotion is: {context}
        Keep it under 160 characters. Include a call to action. No hashtags.
        """
        
        response = self.ai.generate_with_fallback(prompt)
        
        if isinstance(response, dict):
            # Fallback if AI is offline
            return "Special Offer! Get 20% off at Bhajrang Fitness. Limited time only! Visit the gym today."
            
        return response.strip().replace('"', '')
