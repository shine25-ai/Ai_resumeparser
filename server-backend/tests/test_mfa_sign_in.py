"""
MFA sign-in and policy tests:
- MFA is off by default for everyone, including the super admin
- when `security.require_mfa_superadmin` (or `require_mfa_all_staff` or company `require_mfa`) is enabled,
  a user with no authenticator yet sets it up during sign-in using the 5-minute sign-in token
- a user (including super admin) with `mfa_enabled: true` is asked for a code even when platform policies are off
- the sign-in token works once; a newer sign-in replaces it
- 5 wrong codes pause MFA sign-in for 15 minutes; a TOTP code cannot be used twice
- turning MFA off needs a current code, and is refused while MFA is required by platform or company policy
- the QR code is a real QR code
"""

import time

import pytest
import pytest_asyncio

from app.core.exceptions import AuthenticationError, BadRequestError, ForbiddenError
from app.core.security import hash_password
from app.repositories.user_repository import UserRepository
from app.schemas.auth import LoginRequest
from app.services.auth_service import AuthService
from app.services.branding_service import PLATFORM_DOC_ID, PLATFORM_SETTINGS_COLLECTION
from app.services.mfa_service import MfaService, generate_totp_code, render_svg_qr
from tests.fake_mongo import FakeDatabase


def _next_code(secret: str, ahead: int = 1) -> str:
    return generate_totp_code(secret, int(time.time() // 30) + ahead)


@pytest_asyncio.fixture
async def setup():
    db = FakeDatabase()
    pwd_hash = hash_password("Secret123!")
    await db["companies"].insert_one({"id": "comp_a", "name": "Company A", "is_active": True})
    await db["users"].insert_one({
        "id": "sa",
        "email": "root@platform.com",
        "role": "superadmin",
        "is_superadmin": True,
        "password": pwd_hash,
        "is_active": True,
    })
    await db["users"].insert_one({
        "id": "u1",
        "email": "rec@a.com",
        "role": "recruiter",
        "company_id": "comp_a",
        "password": pwd_hash,
        "is_active": True,
    })
    return db, AuthService(UserRepository(db))


@pytest.mark.asyncio
async def test_super_admin_signs_in_without_mfa_by_default(setup):
    db, auth = setup
    res = await auth.authenticate_user(LoginRequest(email="root@platform.com", password="Secret123!"))
    assert res.mfa_required is False
    assert res.mfa_token is None
    assert res.access_token and res.refresh_token


@pytest.mark.asyncio
async def test_super_admin_sets_up_mfa_during_sign_in(setup):
    db, auth = setup
    await db[PLATFORM_SETTINGS_COLLECTION].insert_one({
        "id": PLATFORM_DOC_ID,
        "security": {"require_mfa_superadmin": True},
    })
    login = await auth.authenticate_user(LoginRequest(email="root@platform.com", password="Secret123!"))
    assert login.mfa_required is True and login.mfa_enrolled is False and login.mfa_token
    token = login.mfa_token

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
async def test_super_admin_with_mfa_enabled_is_asked_for_code(setup):
    db, auth = setup
    mfa = MfaService(db)
    s = await mfa.start_enrolment("sa", "root@platform.com")
    await mfa.confirm_enrolment("sa", generate_totp_code(s["secret"]))

    login = await auth.authenticate_user(LoginRequest(email="root@platform.com", password="Secret123!"))
    assert login.mfa_required is True and login.mfa_enrolled is True and login.mfa_token

    tokens = await auth.verify_mfa_login(login.mfa_token, _next_code(s["secret"]))
    assert tokens.access_token and tokens.refresh_token


@pytest.mark.asyncio
async def test_super_admin_can_turn_mfa_off_unless_required(setup):
    db, _ = setup
    mfa = MfaService(db)
    s = await mfa.start_enrolment("sa", "root@platform.com")
    await mfa.confirm_enrolment("sa", generate_totp_code(s["secret"]))

    with pytest.raises(ForbiddenError, match="required"):
        await mfa.disable_mfa(
            "sa",
            {},
            _next_code(s["secret"]),
            platform_settings={"security": {"require_mfa_superadmin": True}},
        )

    await mfa.disable_mfa(
        "sa",
        {},
        _next_code(s["secret"]),
        platform_settings={"security": {"require_mfa_superadmin": False, "require_mfa_all_staff": False}},
    )
    sa = await db["users"].find_one({"id": "sa"})
    assert sa["mfa_enabled"] is False and not sa.get("mfa_secret")


@pytest.mark.asyncio
async def test_other_staff_mfa_policies_unchanged(setup):
    db, auth = setup

    # Default settings and require_mfa_superadmin=True do not force non-superadmin staff
    await db[PLATFORM_SETTINGS_COLLECTION].insert_one({
        "id": PLATFORM_DOC_ID,
        "security": {"require_mfa_superadmin": True, "require_mfa_all_staff": False},
    })
    res = await auth.authenticate_user(LoginRequest(email="rec@a.com", password="Secret123!"))
    assert res.mfa_required is False and res.access_token

    # Company require_mfa forces MFA for company staff
    await db["companies"].update_one({"id": "comp_a"}, {"$set": {"tenant_settings": {"require_mfa": True}}})
    res_comp = await auth.authenticate_user(LoginRequest(email="rec@a.com", password="Secret123!"))
    assert res_comp.mfa_required is True and res_comp.mfa_enrolled is False

    # Platform require_mfa_all_staff forces MFA even when company require_mfa is off
    await db["companies"].update_one({"id": "comp_a"}, {"$set": {"tenant_settings": {"require_mfa": False}}})
    await db[PLATFORM_SETTINGS_COLLECTION].update_one(
        {"id": PLATFORM_DOC_ID},
        {"$set": {"security": {"require_mfa_superadmin": False, "require_mfa_all_staff": True}}},
    )
    res_staff = await auth.authenticate_user(LoginRequest(email="rec@a.com", password="Secret123!"))
    assert res_staff.mfa_required is True and res_staff.mfa_enrolled is False


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
