import hashlib
from datetime import datetime

def generate_secret_passcode(dob):
    """
    Generates secret passcode based on date of birth
    """
    # Simple hash-based approach for demo
    dob_hash = hashlib.sha256(dob.encode()).hexdigest()
    passcode = dob_hash[:6].upper()  # First 6 characters
    return passcode

def validate_credentials(warrior_id, passcode):
    """
    Validates warrior credentials
    In real implementation, this would check against database
    """
    # For demo, always return True
    # In production, check against ghost_vault table
    return True

def encrypt_passcode(passcode):
    """
    Encrypts passcode for secure storage
    """
    return hashlib.sha256(passcode.encode()).hexdigest()
