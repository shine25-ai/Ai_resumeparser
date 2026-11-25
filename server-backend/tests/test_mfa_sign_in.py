"""
MFA review fixes (PR #73):
- a super admin (or a company that requires MFA) with no authenticator yet can set it up during sign-in,
  using the 5-minute sign-in token, and is signed in when setup is confirmed
- the sign-in token works once; a newer sign-in replaces it
- 5 wrong codes pause MFA sign-in for 15 minutes; a TOTP code cannot be used twice
- turning MFA off needs a current code, and is refused while the company requires MFA
- the QR code is a real QR code
"""

import time

import pytest
import pytest_asyncio

from app.core.exceptions import AuthenticationError, BadRequestError, ForbiddenError
from app.repositories.user_repository import UserRepository
from app.services.auth_service import AuthService
from app.services.mfa_service import MfaService, generate_totp_code, render_svg_qr
from tests.fake_mongo import FakeDatabase


def _next_code(secret: str, ahead: int = 1) -> str:
    return generate_totp_code(secret, int(time.time() // 30) + ahead)


@pytest_asyncio.fixture
async def setup():
    db = FakeDatabase()
    await db["users"].insert_one({"id": "sa", "email": "root@platform.com", "role": "superadmin", "is_active": True})
    await db["users"].insert_one({"id": "u1", "email": "rec@a.com", "role": "recruiter", "company_id": "comp_a", "is_active": True})
    return db, AuthService(UserRepository(db))


@pytest.mark.asyncio
async def test_super_admin_sets_up_mfa_during_sign_in(setup):
    db, auth = setup
    sa = await db["users"].find_one({"id": "sa"})
    token = await auth._issue_mfa_token(sa)

    # Verifying before setup is refused with a clear message (no lockout of the account)
    with pytest.raises(AuthenticationError, match="Set up"):
        await auth.verify_mfa_login(token, "123456")

    started = await auth.start_mfa_setup(token)
    assert started["secret"] and len(started["backup_codes"]) == 8

    with pytest.raises(BadRequestError):
        await auth.confirm_mfa_setup(token, "000000")
    tokens = await auth.confirm_mfa_setup(token, generate_totp_code(started["secret"]))
    assert tokens.access_token and tokens.refresh_token

    sa = await db["users"].find_one({"id": "sa"})
    assert sa["mfa_enabled"] is True and sa["mfa_secret"] == started["secret"]
    # The token is used up
    with pytest.raises(AuthenticationError):
        await auth.start_mfa_setup(token)


@pytest.mark.asyncio
async def test_setup_is_refused_once_mfa_exists(setup):
    db, auth = setup
    mfa = MfaService(db)
    s = await mfa.start_enrolment("u1", "rec@a.com")
    await mfa.confirm_enrolment("u1", generate_totp_code(s["secret"]))
    token = await auth._issue_mfa_token(await db["users"].find_one({"id": "u1"}))
    with pytest.raises(AuthenticationError, match="already set up"):
        await auth.start_mfa_setup(token)


@pytest.mark.asyncio
async def test_sign_in_token_works_once_and_is_replaced(setup):
    db, auth = setup
    mfa = MfaService(db)
    s = await mfa.start_enrolment("u1", "rec@a.com")
    await mfa.confirm_enrolment("u1", generate_totp_code(s["secret"]))

    user = await db["users"].find_one({"id": "u1"})
    old = await auth._issue_mfa_token(user)
    new = await auth._issue_mfa_token(user)
    with pytest.raises(AuthenticationError, match="already been used or replaced"):
        await auth.verify_mfa_login(old, _next_code(s["secret"]))

    assert (await auth.verify_mfa_login(new, _next_code(s["secret"]))).access_token
    with pytest.raises(AuthenticationError, match="already been used or replaced"):
        await auth.verify_mfa_login(new, _next_code(s["secret"], 0))


@pytest.mark.asyncio
async def test_same_code_cannot_be_used_twice(setup):
    db, auth = setup
    mfa = MfaService(db)
    s = await mfa.start_enrolment("u1", "rec@a.com")
    await mfa.confirm_enrolment("u1", generate_totp_code(s["secret"]))
    user = await db["users"].find_one({"id": "u1"})
    code = _next_code(s["secret"])
    assert (await auth.verify_mfa_login(await auth._issue_mfa_token(user), code)).access_token
    with pytest.raises(AuthenticationError, match="already been used"):
        await auth.verify_mfa_login(await auth._issue_mfa_token(user), code)


@pytest.mark.asyncio
async def test_five_wrong_codes_pause_mfa(setup):
    db, auth = setup
    mfa = MfaService(db)
    s = await mfa.start_enrolment("u1", "rec@a.com")
    await mfa.confirm_enrolment("u1", generate_totp_code(s["secret"]))
    token = await auth._issue_mfa_token(await db["users"].find_one({"id": "u1"}))
    for _ in range(5):
        with pytest.raises(AuthenticationError, match="Invalid"):
            await auth.verify_mfa_login(token, "000000")
    # Even the right code is refused while paused
    with pytest.raises(AuthenticationError, match="Too many"):
        await auth.verify_mfa_login(token, _next_code(s["secret"]))
    assert (await db["users"].find_one({"id": "u1"}))["mfa_locked_until"]


@pytest.mark.asyncio
async def test_turning_mfa_off_needs_a_code_and_respects_company_policy(setup):
    db, _ = setup
    mfa = MfaService(db)
    s = await mfa.start_enrolment("u1", "rec@a.com")
    await mfa.confirm_enrolment("u1", generate_totp_code(s["secret"]))

    with pytest.raises(ForbiddenError, match="required for your company"):
        await mfa.disable_mfa("u1", {}, _next_code(s["secret"]), company={"tenant_settings": {"require_mfa": True}})
    with pytest.raises(BadRequestError):
        await mfa.disable_mfa("u1", {}, "")
    await mfa.disable_mfa("u1", {}, _next_code(s["secret"]))
    user = await db["users"].find_one({"id": "u1"})
    assert user["mfa_enabled"] is False and not user.get("mfa_secret")


def test_qr_code_is_a_real_qr_code():
    import segno

    url = "otpauth://totp/HireLogics:a%40b.com?secret=JBSWY3DPEHPK3PXP&issuer=HireLogics"
    svg = render_svg_qr(url)
    assert svg.startswith("<svg") and "path" in svg
    # The same content encodes to the same matrix segno produces (i.e. it is a standard QR code)
    assert svg == segno.make(url, error="m").svg_inline(scale=5, border=2, dark="#0f172a", light="#ffffff")
