"""Password-encrypted, locally stored time capsules."""

import base64
import json
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import RLock
from typing import Any, Literal
from uuid import uuid4

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from pydantic import BaseModel, Field


TREEHOLE_DIR = Path(__file__).resolve().parents[1] / "data" / "treehole"
ITERATIONS = 600_000
MAX_FAILURES = 5
LOCKOUT_MINUTES = 15
CLOCK_ROLLBACK_TOLERANCE = timedelta(minutes=5)
_SECURITY_LOCK = RLock()


class ClockRollbackError(RuntimeError):
    pass


class UnlockRateLimitError(RuntimeError):
    def __init__(self, retry_at: str):
        self.retry_at = retry_at
        super().__init__(retry_at)


class TreeholeWrite(BaseModel):
    content: str = Field(..., min_length=1, max_length=50_000)
    password: str = Field(..., min_length=6, max_length=256)
    unlock_date: datetime
    response_mode: Literal["comfort", "listen"] = "listen"
    cloud_consent: bool = False


class TreeholeUnlock(BaseModel):
    id: str = Field(..., pattern=r"^[a-f0-9]{32}$")
    password: str = Field(..., min_length=1, max_length=256)


def _encode(value: bytes) -> str:
    return base64.b64encode(value).decode("ascii")


def _decode(value: str) -> bytes:
    return base64.b64decode(value.encode("ascii"))


def _key(password: str, salt: bytes) -> bytes:
    return PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITERATIONS).derive(password.encode("utf-8"))


def _security_path() -> Path:
    return TREEHOLE_DIR / ".security.json"


def _read_security() -> dict[str, Any]:
    try:
        data = json.loads(_security_path().read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError, TypeError):
        return {}


def _write_security(data: dict[str, Any]) -> None:
    TREEHOLE_DIR.mkdir(parents=True, exist_ok=True)
    temporary = TREEHOLE_DIR / ".security.tmp"
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporary, _security_path())


def trusted_now() -> datetime:
    """Reject a material system-clock rollback and remember the latest observed UTC time."""
    with _SECURITY_LOCK:
        now = datetime.now(timezone.utc)
        state = _read_security()
        last_text = state.get("last_seen_at")
        if last_text:
            try:
                last_seen = datetime.fromisoformat(str(last_text).replace("Z", "+00:00"))
                if now + CLOCK_ROLLBACK_TOLERANCE < last_seen:
                    raise ClockRollbackError(str(last_text))
                if last_seen > now:
                    now = last_seen
            except ValueError:
                pass
        state["last_seen_at"] = now.isoformat().replace("+00:00", "Z")
        state.setdefault("attempts", {})
        _write_security(state)
        return now


def _assert_attempt_allowed(item_id: str, now: datetime) -> None:
    with _SECURITY_LOCK:
        attempt = (_read_security().get("attempts") or {}).get(item_id) or {}
        retry_text = attempt.get("locked_until")
        if retry_text:
            retry_at = datetime.fromisoformat(str(retry_text).replace("Z", "+00:00"))
            if now < retry_at:
                raise UnlockRateLimitError(str(retry_text))


def _record_attempt(item_id: str, succeeded: bool, now: datetime) -> None:
    with _SECURITY_LOCK:
        state = _read_security()
        attempts = state.setdefault("attempts", {})
        if succeeded:
            attempts.pop(item_id, None)
        else:
            previous = attempts.get(item_id) or {}
            failures = int(previous.get("failures") or 0) + 1
            attempt: dict[str, Any] = {"failures": failures, "last_failure_at": now.isoformat().replace("+00:00", "Z")}
            if failures >= MAX_FAILURES:
                attempt["locked_until"] = (now + timedelta(minutes=LOCKOUT_MINUTES)).isoformat().replace("+00:00", "Z")
                attempt["failures"] = 0
            attempts[item_id] = attempt
        state["last_seen_at"] = now.isoformat().replace("+00:00", "Z")
        _write_security(state)


def seal(payload: TreeholeWrite) -> dict[str, Any]:
    now = trusted_now()
    item_id = uuid4().hex
    salt, nonce = os.urandom(16), os.urandom(12)
    unlock = payload.unlock_date
    if unlock.tzinfo is None:
        unlock = unlock.replace(tzinfo=timezone.utc)
    unlock_iso = unlock.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    aad = f"{item_id}:{unlock_iso}".encode("utf-8")
    ciphertext = AESGCM(_key(payload.password, salt)).encrypt(nonce, payload.content.encode("utf-8"), aad)
    record = {
        "id": item_id,
        "created_at": now.isoformat().replace("+00:00", "Z"),
        "unlock_date": unlock_iso,
        "salt": _encode(salt),
        "nonce": _encode(nonce),
        "ciphertext": _encode(ciphertext),
        "kdf": {"name": "PBKDF2-SHA256", "iterations": ITERATIONS},
        "cipher": "AES-256-GCM",
    }
    TREEHOLE_DIR.mkdir(parents=True, exist_ok=True)
    temporary = TREEHOLE_DIR / f".{item_id}.tmp"
    temporary.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporary, TREEHOLE_DIR / f"{item_id}.json")
    return {"id": item_id, "created_at": record["created_at"], "unlock_date": unlock_iso}


def status() -> dict[str, Any]:
    records = []
    if TREEHOLE_DIR.exists():
        for path in TREEHOLE_DIR.glob("*.json"):
            try:
                item = json.loads(path.read_text(encoding="utf-8"))
                records.append({"id": item["id"], "created_at": item["created_at"], "unlock_date": item["unlock_date"]})
            except (OSError, json.JSONDecodeError, KeyError):
                continue
    records.sort(key=lambda item: item["unlock_date"])
    now = trusted_now()
    future = [item for item in records if datetime.fromisoformat(item["unlock_date"].replace("Z", "+00:00")) > now]
    return {"count": len(records), "next_unlock_date": future[0]["unlock_date"] if future else None, "items": records}


def delete_capsule(item_id: str) -> bool:
    if not re.fullmatch(r"[a-f0-9]{32}", item_id):
        return False
    path = TREEHOLE_DIR / f"{item_id}.json"
    if not path.exists():
        return False
    path.unlink()
    with _SECURITY_LOCK:
        state = _read_security()
        (state.get("attempts") or {}).pop(item_id, None)
        _write_security(state)
    return True


def unlock(payload: TreeholeUnlock) -> dict[str, Any]:
    path = TREEHOLE_DIR / f"{payload.id}.json"
    if not path.exists():
        raise KeyError("封存记录不存在")
    record = json.loads(path.read_text(encoding="utf-8"))
    now = trusted_now()
    unlock_at = datetime.fromisoformat(record["unlock_date"].replace("Z", "+00:00"))
    if now < unlock_at:
        raise PermissionError(record["unlock_date"])
    _assert_attempt_allowed(payload.id, now)
    aad = f"{record['id']}:{record['unlock_date']}".encode("utf-8")
    try:
        plaintext = AESGCM(_key(payload.password, _decode(record["salt"]))).decrypt(
            _decode(record["nonce"]), _decode(record["ciphertext"]), aad
        )
    except InvalidTag:
        _record_attempt(payload.id, False, now)
        raise
    _record_attempt(payload.id, True, now)
    return {"id": record["id"], "content": plaintext.decode("utf-8"), "unlock_date": record["unlock_date"], "resealed": True}
