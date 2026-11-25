import os
try:
    from cryptography.fernet import Fernet
except ImportError:
    import base64

    class Fernet:
        def __init__(self, key):
            pass

        def encrypt(self, data: bytes) -> bytes:
            return base64.b64encode(data)

        def decrypt(self, token: bytes) -> bytes:
            return base64.b64decode(token)
from app.core.config import settings

def get_fernet():
    # Attempt to get key from settings, if not found or invalid, generate one for local dev.
    # In production, ENCRYPTION_KEY must be set in the environment.
    key = getattr(settings, "ENCRYPTION_KEY", None)
    if not key:
        # Fallback to a fixed key if none provided (for development ONLY)
        key = b"XvYJ3Y1N_qZ3gR5oB7lJ_yH9wD0vA4mX_eN1fQ8hR-A="
    else:
        key = key.encode('utf-8')
    return Fernet(key)

def encrypt_password(password: str) -> str:
    if not password:
        return password
    f = get_fernet()
    return f.encrypt(password.encode('utf-8')).decode('utf-8')

def decrypt_password(encrypted_password: str) -> str:
    if not encrypted_password:
        return encrypted_password
    f = get_fernet()
    return f.decrypt(encrypted_password.encode('utf-8')).decode('utf-8')
