"""
Multi-Factor Authentication (MFA / TOTP) Service (Phase 11 - SRS 4.20).

Implements RFC 6238 TOTP (Time-based One-Time Password) in pure Python.
Provides:
1. Secret generation (Base32)
2. OTPAuth URI generation (compatible with Google Authenticator, Authy, 1Password)
3. Pure SVG QR Code renderer (zero external dependencies)
4. Verification with window drift (±30s)
5. 8 single-use recovery backup codes
6. Enforcement checks (platform and company policies)
7. Brute-force protection: 5 wrong codes pause MFA for 15 minutes; a TOTP code works once
"""

import base64
import hashlib
import hmac
import secrets
import struct
import time
from datetime import timedelta
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote

from app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError
from app.core.tenant import system_scope
from app.utils.constants import USERS_COLLECTION
from app.utils.helpers import utc_now


def generate_totp_secret() -> str:
    """Generate a 160-bit (20 bytes) Base32 secret string (32 characters)."""
    raw_bytes = secrets.token_bytes(20)
    return base64.b32encode(raw_bytes).decode("utf-8").replace("=", "")


def generate_totp_code(secret_b32: str, intervals_no: Optional[int] = None) -> str:
    """Compute 6-digit TOTP code for a given 30-second interval (RFC 6238)."""
    if intervals_no is None:
        intervals_no = int(time.time() // 30)

    # Pad Base32 string to multiple of 8 if needed
    padding = (8 - len(secret_b32) % 8) % 8
    key = base64.b32decode(secret_b32 + "=" * padding, casefold=True)
    msg = struct.pack(">Q", intervals_no)
    digest = hmac.new(key, msg, hashlib.sha1).digest()
    offset = digest[19] & 0x0F
    truncated_hash = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    code = truncated_hash % 1_000_000
    return str(code).zfill(6)


def totp_step(secret_b32: str, code: str, window: int = 1) -> Optional[int]:
    """The 30-second step a TOTP code belongs to (within ±1 step), or None when it is wrong."""
    if not code:
        return None
    clean = str(code).strip()
    if len(clean) != 6 or not clean.isdigit():
        return None

    current_interval = int(time.time() // 30)
    for step in range(-window, window + 1):
        if generate_totp_code(secret_b32, current_interval + step) == clean:
            return current_interval + step
    return None


def verify_totp_code(secret_b32: str, code: str, window: int = 1) -> bool:
    """Verify TOTP code within a drift window of ±1 step (±30 seconds)."""
    return totp_step(secret_b32, code, window) is not None


def generate_backup_codes(count: int = 8) -> List[str]:
    """Generate readable 8-character backup recovery codes e.g. 'a8f1-c4d2'."""
    codes = []
    for _ in range(count):
        token = secrets.token_hex(4)
        codes.append(f"{token[:4]}-{token[4:]}")
    return codes


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.strip().lower().encode("utf-8")).hexdigest()


def render_svg_qr(content: str) -> str:
    """A real, scannable QR code (segno) as inline SVG, for authenticator apps."""
    import segno

    return segno.make(content, error="m").svg_inline(scale=5, border=2, dark="#0f172a", light="#ffffff")


MAX_FAILED_ATTEMPTS = 5     # wrong codes in a row before MFA sign-in is paused
LOCK_MINUTES = 15


class MfaService:
    def __init__(self, db: Any):
        self.db = db

    def is_mfa_required(
        self,
        user: Dict[str, Any],
        company: Optional[Dict[str, Any]] = None,
        platform_settings: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """
        Check if MFA is mandatory for this user:
        1. Platform Super Admin: `security.require_mfa_superadmin`, `security.require_mfa_all_staff`, or `user.mfa_enabled`
        2. Platform policy: `security.require_mfa_all_staff`
        3. Company policy: `tenant_settings.require_mfa`
        4. User voluntary enrolment: `user.mfa_enabled`
        """
        security = (platform_settings or {}).get("security") or {}
        if user.get("is_superadmin") or user.get("role") == "superadmin":
            return bool(
                security.get("require_mfa_superadmin")
                or security.get("require_mfa_all_staff")
                or user.get("mfa_enabled")
            )

        if security.get("require_mfa_all_staff"):
            return True

        if company and (company.get("tenant_settings") or {}).get("require_mfa"):
            return True

        return bool(user.get("mfa_enabled"))

    async def start_enrolment(self, user_id: str, email: str, app_name: str = "HireLogics") -> Dict[str, Any]:
        """Begin MFA setup: generates Base32 secret, OTPAuth URL, backup codes and SVG QR code."""
        with system_scope():
            user = await self.db[USERS_COLLECTION].find_one({"id": user_id})
        if not user:
            raise NotFoundError("User not found.")

        secret = generate_totp_secret()
        backup_codes = generate_backup_codes(8)
        hashed_backups = [_hash_code(code) for code in backup_codes]

        safe_email = quote(email)
        safe_issuer = quote(app_name)
        otpauth_url = f"otpauth://totp/{safe_issuer}:{safe_email}?secret={secret}&issuer={safe_issuer}&algorithm=SHA1&digits=6&period=30"
        qr_svg = render_svg_qr(otpauth_url)

        # Store pending enrolment state on user
        pending_doc = {
            "secret": secret,
            "backup_codes": hashed_backups,
            "started_at": utc_now().isoformat(),
        }
        with system_scope():
            await self.db[USERS_COLLECTION].update_one(
                {"id": user_id},
                {"$set": {"mfa_enrolment_pending": pending_doc}},
            )

        return {
            "secret": secret,
            "otpauth_url": otpauth_url,
            "backup_codes": backup_codes,
            "qr_svg": qr_svg,
        }

    async def confirm_enrolment(self, user_id: str, code: str) -> Dict[str, Any]:
        """Confirm MFA enrolment by verifying the first 6-digit TOTP code."""
        with system_scope():
            user = await self.db[USERS_COLLECTION].find_one({"id": user_id})
        if not user:
            raise NotFoundError("User not found.")

        pending = user.get("mfa_enrolment_pending")
        if not pending or not pending.get("secret"):
            raise BadRequestError("No pending MFA enrolment found. Please initiate setup again.")

        if self.locked_until(user):
            raise ForbiddenError("Too many wrong codes. Try again later.")
        secret = pending["secret"]
        step = totp_step(secret, code)
        await self.record_attempt(user, step is not None)
        if step is None:
            raise BadRequestError("Invalid verification code. Please check your authenticator app and try again.")

        now = utc_now().isoformat()
        with system_scope():
            await self.db[USERS_COLLECTION].update_one(
                {"id": user_id},
                {
                    "$set": {
                        "mfa_enabled": True,
                        "mfa_secret": secret,
                        "mfa_backup_codes": pending.get("backup_codes", []),
                        "mfa_enrolled_at": now,
                        "mfa_last_totp_step": step,
                    },
                    "$unset": {"mfa_enrolment_pending": ""},
                },
            )

        return {
            "success": True,
            "message": "MFA has been successfully enrolled and enabled on your account.",
            "mfa_enrolled_at": now,
        }

    @staticmethod
    def locked_until(user: Dict[str, Any]) -> Optional[str]:
        """When MFA sign-in is paused after too many wrong codes, the time it opens again; otherwise None."""
        until = user.get("mfa_locked_until")
        return until if until and until > utc_now().isoformat() else None

    async def record_attempt(self, user: Dict[str, Any], ok: bool) -> None:
        """Count wrong codes; the 5th in a row pauses MFA for 15 minutes. A right code clears the count."""
        if ok:
            update: Dict[str, Any] = {"$unset": {"mfa_failed_attempts": "", "mfa_locked_until": ""}}
        else:
            failed = int(user.get("mfa_failed_attempts") or 0) + 1
            fields: Dict[str, Any] = {"mfa_failed_attempts": failed}
            if failed >= MAX_FAILED_ATTEMPTS:
                fields = {"mfa_failed_attempts": 0,
                          "mfa_locked_until": (utc_now() + timedelta(minutes=LOCK_MINUTES)).isoformat()}
            update = {"$set": fields}
        with system_scope():
            await self.db[USERS_COLLECTION].update_one({"id": user["id"]}, update)

    async def verify_user_code(self, user: Dict[str, Any], code: str) -> Tuple[bool, str]:
        """
        Verify code during sign-in.
        Accepts:
        - 6-digit TOTP code (each code works once)
        - Or 8-character recovery backup code (e.g. 'a8f1-c4d2'), single use
        Returns (is_valid, method_used).
        """
        clean = str(code or "").strip()
        secret = user.get("mfa_secret")
        if not secret:
            return False, "no_secret"

        # 1. Try TOTP (a code already used cannot be used again)
        if len(clean) == 6 and clean.isdigit():
            step = totp_step(secret, clean)
            if step is not None:
                if step <= int(user.get("mfa_last_totp_step") or -1):
                    return False, "reused"
                with system_scope():
                    await self.db[USERS_COLLECTION].update_one({"id": user["id"]}, {"$set": {"mfa_last_totp_step": step}})
                return True, "totp"

        # 2. Try Backup code
        hashed = _hash_code(clean)
        backup_codes = user.get("mfa_backup_codes") or []
        if hashed in backup_codes:
            # Consume single-use backup code
            remaining = [c for c in backup_codes if c != hashed]
            with system_scope():
                await self.db[USERS_COLLECTION].update_one(
                    {"id": user["id"]},
                    {"$set": {"mfa_backup_codes": remaining}},
                )
            return True, "backup_code"

        return False, "invalid"

    async def disable_mfa(self, user_id: str, actor: Dict[str, Any], code: str = "",
                          company: Optional[Dict[str, Any]] = None,
                          platform_settings: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Turn MFA off. Needs a current code, and is refused while MFA is required for this account."""
        with system_scope():
            user = await self.db[USERS_COLLECTION].find_one({"id": user_id})
        if not user:
            raise NotFoundError("User not found.")

        if self.is_mfa_required({**user, "mfa_enabled": False}, company, platform_settings):
            security = (platform_settings or {}).get("security") or {}
            is_super = bool(user.get("is_superadmin") or user.get("role") == "superadmin")
            if security.get("require_mfa_all_staff") or (is_super and security.get("require_mfa_superadmin")):
                raise ForbiddenError("Two-factor sign-in is required by platform policy, so it can't be turned off.")
            raise ForbiddenError("Two-factor sign-in is required for your company, so it can't be turned off.")
        if self.locked_until(user):
            raise ForbiddenError("Too many wrong codes. Try again later.")
        ok, _ = await self.verify_user_code(user, code)
        await self.record_attempt(user, ok)
        if not ok:
            raise BadRequestError("Enter a current code from your authenticator app (or a backup code) to turn this off.")

        with system_scope():
            await self.db[USERS_COLLECTION].update_one(
                {"id": user_id},
                {
                    "$set": {"mfa_enabled": False},
                    "$unset": {"mfa_secret": "", "mfa_backup_codes": "", "mfa_enrolled_at": "", "mfa_last_totp_step": ""},
                },
            )

        return {"success": True, "message": "MFA disabled."}

