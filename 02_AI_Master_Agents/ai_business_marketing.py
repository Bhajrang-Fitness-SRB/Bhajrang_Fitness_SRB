import os
from dotenv import load_dotenv
import random
import logging
from typing import Dict

load_dotenv('master_vault.env')

logger = logging.getLogger(__name__)
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s: %(message)s')


def generate_promo_message() -> str:
    """
    Generates promotional messages using AI (demo implementation).
    """
    # Sample promo messages for demo
    promo_messages = [
        "Special Offer! Get 20% off on annual membership. Limited time only!",
        "Transform your body this summer! Join Bhajrang Fitness and get a free diet plan!",
        "New Year, New You! Start your fitness journey with us today!",
        "Achieve your fitness goals with our expert trainers. Sign up now!",
        "Limited slots available! Join our premium package and get personal training sessions!"
    ]

    message = random.choice(promo_messages)
    logger.debug("Selected promo message: %s", message)
    return message


def generate_workout_plan(member_profile: Dict) -> Dict[str, str]:
    """
    Generates personalized workout plan. This is a placeholder/demo implementation.
    """
    # In a real implementation, member_profile would be used to tailor the plan.
    logger.debug("Generating workout plan for profile: %s", member_profile)
    return {
        "monday": "Chest & Triceps",
        "tuesday": "Back & Biceps",
        "wednesday": "Legs",
        "thursday": "Shoulders",
        "friday": "Full Body",
        "saturday": "Cardio",
        "sunday": "Rest"
    }


if __name__ == '__main__':
    # Quick smoke test
    logger.info("Promo: %s", generate_promo_message())
    logger.info("Sample plan: %s", generate_workout_plan({}))
