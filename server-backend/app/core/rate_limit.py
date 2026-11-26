"""
Rate limits for sign-in and the public (no sign-in) endpoints (Phase 12 security review).

Counters live in MongoDB (`rate_limits`, a platform collection with a TTL index on `expires_at`), so a limit
holds across workers and restarts. Fixed windows: one counter per (rule, subject, window). Subjects are the
caller's IP (from uvicorn, which only trusts X-Forwarded-For from a local proxy) or an email address.

Limits are set high enough that a real person never meets them; they stop password guessing, mass code
requests and upload floods. RATE_LIMITS_ENABLED=false turns them off (tests that need many sign-ins).
"""

import hashlib
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple

from fastapi import Request

from app.core.config import settings
from app.core.exceptions import AppException

RATE_LIMITS_COLLECTION = "rate_limits"

# rule: (requests allowed, window in seconds)
RULES: Dict[str, Tuple[int, int]] = {
    "login:email": (10, 15 * 60),         # wrong passwords for one account
    "login:ip": (50, 15 * 60),            # one address trying many accounts
    "register:ip": (10, 60 * 60),
    "applicant_code:ip": (20, 60 * 60),   # verification emails from one address
    "applicant_confirm:ip": (60, 60 * 60),
    "applicant_upload:ip": (30, 60 * 60),
    "applicant_submit:ip": (30, 60 * 60),
    "invitation_accept:ip": (20, 60 * 60),
}


class TooManyRequestsError(AppException):
    def __init__(self, retry_after: int):
        minutes = max(1, round(retry_after / 60))
        super().__init__(
            message=f"Too many attempts. Please wait about {minutes} minute{'s' if minutes != 1 else ''} and try again.",
            status_code=429,
        )
        self.retry_after = retry_after


def client_ip(request: Optional[Request]) -> str:
    return (request.client.host if request is not None and request.client else "") or "unknown"


def _subject(value: str) -> str:
    """Emails are stored hashed: the counter must not become a list of who tried to sign in."""
    return hashlib.sha256(value.strip().lower().encode()).hexdigest()[:32]


async def hit(db: Any, rule: str, value: str, now: Optional[float] = None) -> None:
    """Count one request for `rule` and `value`; raise 429 once the window's limit is passed."""
    if not getattr(settings, "RATE_LIMITS_ENABLED", True) or not value:
        return
    limit, window = RULES[rule]
    now = now if now is not None else time.time()
    start = int(now // window) * window
    key = f"{rule}:{_subject(value)}:{start}"
    expires = datetime.fromtimestamp(start + window, tz=timezone.utc) + timedelta(minutes=5)
    col = db[RATE_LIMITS_COLLECTION]
    await col.update_one(
        {"id": key},
        {"$inc": {"count": 1}, "$setOnInsert": {"id": key, "rule": rule, "expires_at": expires}},
        upsert=True,
    )
    doc = await col.find_one({"id": key})
    if doc and doc.get("count", 0) > limit:
        raise TooManyRequestsError(retry_after=int(start + window - now) + 1)


async def hit_ip(db: Any, rule: str, request: Optional[Request]) -> None:
    await hit(db, rule, client_ip(request))
