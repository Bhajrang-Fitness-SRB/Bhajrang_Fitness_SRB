import random
import re
from datetime import datetime

def generate_unique_id() -> str:
    """
    Generates a unique Warrior ID in format: RBF<YY><MM><XXXX>
    Example: RBF26081234
    """
    now = datetime.now()
    year_str = now.strftime("%y")
    month_str = now.strftime("%m")
    random_digits = f"{random.randint(1000, 9999)}"
    
    return f"RBF{year_str}{month_str}{random_digits}"

def validate_id_format(warrior_id: str) -> bool:
    """
    Validates if the provided ID matches RBF + 2-digit year + 2-digit month + 4 digits.
    """
    if not warrior_id or not isinstance(warrior_id, str):
        return False
    
    pattern = r"^RBF\d{2}(0[1-9]|1[0-2])\d{4}$"
    return bool(re.match(pattern, warrior_id.strip().upper()))
