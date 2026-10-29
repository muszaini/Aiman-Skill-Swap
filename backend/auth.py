import hashlib
import hmac
import secrets
from typing import Optional

SALT = b"skillswap_atelier_salt_v1"


def hash_password(password: str) -> str:
    """Hashes a plaintext password using scrypt with a consistent application salt."""
    derived = hashlib.scrypt(
        password.encode("utf-8"),
        salt=SALT,
        n=16384,
        r=8,
        p=1,
        dklen=32,
    )
    return derived.hex()


def verify_password(password: str, stored_hash: Optional[str]) -> bool:
    if not stored_hash:
        return False
    computed = hash_password(password)
    return hmac.compare_digest(computed, stored_hash)


def generate_session_token() -> str:
    return secrets.token_hex(24)
