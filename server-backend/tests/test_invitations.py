"""
User invitations: invite, accept once, expiry, cancel, company email domains and the plan's user limit.
"""

import pytest

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.core.tenant import ScopedDatabase, company_scope, system_scope
from app.services.invitation_service import InvitationService
from tests.fake_mongo import FakeDatabase

ADMIN = {"id": "a1", "full_name": "Asha", "email": "asha@acme.com", "role": "admin"}
APP = "https://portal.example.com"


@pytest.fixture
def env():
    raw = FakeDatabase()
    raw["companies"].docs.append({"id": "acme", "name": "Acme", "slug": "acme", "email_domains": ["acme.com"],
                                  "limits": {"users": 3}, "is_active": True})
    raw["users"].docs.append({"id": "a1", "email": "asha@acme.com", "company_id": "acme", "role": "admin"})
    return raw, InvitationService(ScopedDatabase(raw))


def _token(link: str) -> str:
    return link.split("token=")[1]


@pytest.mark.asyncio
async def test_invite_without_email_settings_returns_the_link(env):
    raw, svc = env
    with company_scope("acme"):
        inv = await svc.create(ADMIN, "Ravi@Acme.com", "Ravi", "recruiter", "Engineering", APP)
    assert inv["email"] == "ravi@acme.com" and inv["status"] == "pending"
    assert inv["email_sent"] is False and inv["invite_link"].startswith(f"{APP}/accept-invite?token=")
    stored = raw["user_invitations"].docs[0]
    assert "token_hash" in stored and _token(inv["invite_link"]) not in str(stored)  # only the hash is kept
    assert stored["company_id"] == "acme"


@pytest.mark.asyncio
async def test_accept_creates_the_user_in_the_company_once(env):
    raw, svc = env
    with company_scope("acme"):
        inv = await svc.create(ADMIN, "ravi@acme.com", "Ravi", "recruiter", "Engineering", APP)
    token = _token(inv["invite_link"])

    info = await svc.lookup(token)
    assert info["company_name"] == "Acme" and info["role"] == "recruiter"

    done = await svc.accept(token, "Ravi Kumar", "StrongPass1")
    assert done["company_name"] == "Acme"
    user = next(u for u in raw["users"].docs if u["email"] == "ravi@acme.com")
    assert user["company_id"] == "acme" and user["role"] == "recruiter" and user["department"] == "Engineering"
    assert user["password"] != "StrongPass1"

    with pytest.raises(NotFoundError):
        await svc.accept(token, "Ravi", "StrongPass1")  # single use


@pytest.mark.asyncio
async def test_expired_and_cancelled_invitations_do_not_work(env):
    raw, svc = env
    with company_scope("acme"):
        inv = await svc.create(ADMIN, "old@acme.com", "", "viewer", "", APP)
        other = await svc.create(ADMIN, "gone@acme.com", "", "viewer", "", APP)
        await svc.revoke(other["id"])
    raw["user_invitations"].docs[0]["expires_at"] = "2000-01-01T00:00:00"
    with pytest.raises(BadRequestError):
        await svc.lookup(_token(inv["invite_link"]))
    with pytest.raises(NotFoundError):
        await svc.lookup(_token(other["invite_link"]))


@pytest.mark.asyncio
async def test_resend_replaces_the_link(env):
    _, svc = env
    with company_scope("acme"):
        inv = await svc.create(ADMIN, "ravi@acme.com", "", "viewer", "", APP)
        again = await svc.resend(inv["id"], APP)
    with pytest.raises(NotFoundError):
        await svc.lookup(_token(inv["invite_link"]))
    assert (await svc.lookup(_token(again["invite_link"])))["email"] == "ravi@acme.com"


@pytest.mark.asyncio
async def test_domain_duplicates_and_user_limit(env):
    _, svc = env
    with company_scope("acme"):
        with pytest.raises(BadRequestError):
            await svc.create(ADMIN, "someone@gmail.com", "", "viewer", "", APP)
        with pytest.raises(ConflictError):
            await svc.create(ADMIN, "asha@acme.com", "", "viewer", "", APP)  # already a user
        await svc.create(ADMIN, "b@acme.com", "", "viewer", "", APP)
        with pytest.raises(ConflictError):
            await svc.create(ADMIN, "b@acme.com", "", "viewer", "", APP)  # already invited
        await svc.create(ADMIN, "c@acme.com", "", "viewer", "", APP)
        # 1 user + 2 pending = the plan's 3 users
        with pytest.raises(BadRequestError):
            await svc.create(ADMIN, "d@acme.com", "", "viewer", "", APP)


@pytest.mark.asyncio
async def test_invitations_are_per_company(env):
    raw, svc = env
    raw["companies"].docs.append({"id": "globex", "name": "Globex", "slug": "globex", "email_domains": [], "limits": {}})
    with company_scope("acme"):
        await svc.create(ADMIN, "ravi@acme.com", "", "viewer", "", APP)
    with company_scope("globex"):
        assert await svc.list() == []
    with system_scope():
        assert len(await svc.col.find({}).to_list(length=10)) == 1


@pytest.mark.asyncio
async def test_only_super_admin_can_invite_a_super_admin(env):
    from app.core.exceptions import AuthorizationError

    _, svc = env
    with company_scope("acme"):
        with pytest.raises(AuthorizationError):
            await svc.create(ADMIN, "x@acme.com", "", "superadmin", "", APP)
