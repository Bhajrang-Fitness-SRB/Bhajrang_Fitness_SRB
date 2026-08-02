import random
from datetime import datetime

def generate_unique_id():
    """
    Generates unique Warrior ID in format: RBF2605XXXX
    Where XXXX is a random 4-digit number
    """
    year = datetime.now().strftime("%y")  # Last 2 digits of year
    month = datetime.now().strftime("%m")  # Month as number
    random_digits = str(random.randint(1000, 9999))  # 4 random digits
    
    warrior_id = f"RBF{year}{month}{random_digits}"
    return warrior_id

def validate_id_format(warrior_id):
    """
    Validates if the ID follows the correct format
    """
    if not warrior_id.startswith("RBF"):
        return False
    if len(warrior_id) != 12:  # RBF + 2 year + 2 month + 4 digits
        return False
    return True
