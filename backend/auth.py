import base64
import binascii
import hashlib
import hmac
import json
import os
import secrets
import threading
import time
from collections import defaultdict, deque

from fastapi import Request


AUTH_USERNAME = os.getenv("FIREFLY_AUTH_USERNAME", "firefly").strip() or "firefly"
AUTH_PASSWORD_HASH = os.getenv("FIREFLY_AUTH_PASSWORD_HASH", "").strip()
AUTH_SESSION_SECRET = os.getenv("FIREFLY_AUTH_SESSION_SECRET", "").strip()
AUTH_COOKIE_NAME = "firefly_session"
AUTH_SESSION_SECONDS = int(os.getenv("FIREFLY_AUTH_SESSION_SECONDS", str(30 * 24 * 60 * 60)))

_attempts: dict[str, deque[float]] = defaultdict(deque)
_attempt_lock = threading.Lock()


def auth_enabled() -> bool:
    return bool(AUTH_PASSWORD_HASH and AUTH_SESSION_SECRET)


def hash_password(password: str, *, salt: bytes | None = None, iterations: int = 310_000) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${digest.hex()}"


def verify_password(password: str) -> bool:
    try:
        algorithm, iterations_text, salt_hex, expected_hex = AUTH_PASSWORD_HASH.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        actual = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations_text)
        )
        return hmac.compare_digest(actual.hex(), expected_hex)
    except (TypeError, ValueError):
        return False


def login_allowed(client_key: str) -> bool:
    now = time.time()
    cutoff = now - 15 * 60
    with _attempt_lock:
        attempts = _attempts[client_key]
        while attempts and attempts[0] < cutoff:
            attempts.popleft()
        return len(attempts) < 10


def record_failed_login(client_key: str) -> None:
    with _attempt_lock:
        _attempts[client_key].append(time.time())


def clear_failed_logins(client_key: str) -> None:
    with _attempt_lock:
        _attempts.pop(client_key, None)


def create_session(username: str) -> str:
    payload = {"sub": username, "exp": int(time.time()) + AUTH_SESSION_SECONDS, "nonce": secrets.token_hex(8)}
    encoded = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    ).rstrip(b"=")
    signature = hmac.new(AUTH_SESSION_SECRET.encode("utf-8"), encoded, hashlib.sha256).digest()
    return f"{encoded.decode()}.{base64.urlsafe_b64encode(signature).rstrip(b'=').decode()}"


def valid_session(token: str | None) -> bool:
    if not token or "." not in token or not auth_enabled():
        return False
    encoded_text, signature_text = token.split(".", 1)
    try:
        encoded = encoded_text.encode("ascii")
        signature = base64.urlsafe_b64decode(signature_text + "=" * (-len(signature_text) % 4))
        expected = hmac.new(AUTH_SESSION_SECRET.encode("utf-8"), encoded, hashlib.sha256).digest()
        if not hmac.compare_digest(signature, expected):
            return False
        payload = json.loads(base64.urlsafe_b64decode(encoded_text + "=" * (-len(encoded_text) % 4)))
        return payload.get("sub") == AUTH_USERNAME and int(payload.get("exp", 0)) > int(time.time())
    except (ValueError, TypeError, json.JSONDecodeError, UnicodeDecodeError, binascii.Error):
        return False


def request_is_authenticated(request: Request) -> bool:
    return not auth_enabled() or valid_session(request.cookies.get(AUTH_COOKIE_NAME))
