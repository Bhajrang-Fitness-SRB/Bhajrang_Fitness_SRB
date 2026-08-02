import os
from dotenv import load_dotenv
import random

load_dotenv('master_vault.env')

def generate_promo_message():
    """
    Generates promotional messages using AI
    """
    # Sample promo messages for demo
    promo_messages = [
        " Special Offer! Get 20% off on annual membership. Limited time only!",
        " Transform your body this summer! Join Bhajrang Fitness and get a free diet plan!",
        " New Year, New You! Start your fitness journey with us today!",
        " Achieve your fitness goals with our expert trainers. Sign up now!",
        " Limited slots available! Join our premium package and get personal training sessions!"
    ]
    
    return random.choice(promo_messages)

def generate_workout_plan(member_profile):
    """
    Generates personalized workout plan
    """
    # For demo, return sample plan
    return {
        "monday": "Chest & Triceps",
        "tuesday": "Back & Biceps",
        "wednesday": "Legs",
        "thursday": "Shoulders",
        "friday": "Full Body",
        "saturday": "Cardio",
        "sunday": "Rest"
    }
