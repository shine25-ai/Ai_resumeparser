"""
Phase 12 security review fixes: rate limits, upload content checks, no internal details in 500 responses,
security headers, no credentialed CORS, settings permissions, and the default SECRET_KEY guard.
"""

import io
import zipfile

import pytest
from fastapi import UploadFile
from starlette.datastructures import Headers

from app.core import bootstrap
from app.core.exceptions import FileUploadError
from app.core.rate_limit import RULES, TooManyRequestsError, hit
from app.utils.validators import content_matches_extension, validate_uploaded_file
from tests.fake_mongo import FakeDatabase
from tests.phase12_harness import Workspace


# ── Rate limits ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_a_rule_allows_its_limit_then_answers_429_until_the_window_ends():
    db = FakeDatabase()
    limit, window = RULES["login:email"]
    now = 1_000_000 * window          # the start of a window
    for _ in range(limit):
        await hit(db, "login:email", "Asha@Example.com", now=now)
    with pytest.raises(TooManyRequestsError) as err:
        await hit(db, "login:email", "asha@example.com", now=now + 1)   # same account, any case
    assert 0 < err.value.retry_after <= window
    await hit(db, "login:email", "someone.else@example.com", now=now + 1)   # other accounts are not affected
    await hit(db, "login:email", "asha@example.com", now=now + window)      # next window starts fresh


@pytest.mark.asyncio
async def test_counters_never_store_the_email():
    db = FakeDatabase()
    await hit(db, "login:email", "asha@example.com", now=0)
    assert "asha" not in str(db["rate_limits"].docs)


@pytest.mark.asyncio
async def test_sign_in_is_limited_per_account():
    async with Workspace() as ws:
        limit, _ = RULES["login:email"]
        codes = []
        for _ in range(limit + 1):
            r = await ws.client.post("/api/v1/auth/login", json={"email": "admin@co-a.example.com", "password": "wrong-password"})
            codes.append(r.status_code)
        assert 429 not in codes[:limit]
        assert codes[-1] == 429
        assert r.headers.get("retry-after")


# ── Uploads ─────────────────────────────────────────────────────────────────


def _docx() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("[Content_Types].xml", "<Types/>")
        z.writestr("word/document.xml", "<w:document/>")
    return buf.getvalue()


def test_file_content_must_match_its_extension():
    assert content_matches_extension(b"%PDF-1.7\n...", "pdf")
    assert content_matches_extension(b"\n\n%PDF-1.4", "pdf")
    assert content_matches_extension(_docx(), "docx")
    assert content_matches_extension(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\0" * 100, "doc")
    assert not content_matches_extension(b"MZ\x90\x00 executable", "pdf")
    assert not content_matches_extension(b"<script>alert(1)</script>", "pdf")
    zip_without_word = io.BytesIO()
    with zipfile.ZipFile(zip_without_word, "w") as z:
        z.writestr("payload.exe", "x")
    assert not content_matches_extension(zip_without_word.getvalue(), "docx")
    assert not content_matches_extension(_docx(), "doc")


@pytest.mark.asyncio
async def test_a_renamed_file_is_refused_on_upload():
    upload = UploadFile(io.BytesIO(b"MZ\x90\x00 not a pdf"), filename="resume.pdf", headers=Headers({"content-type": "application/pdf"}))
    with pytest.raises(FileUploadError):
        await validate_uploaded_file(upload)
    good = UploadFile(io.BytesIO(b"%PDF-1.4 resume"), filename="resume.pdf", headers=Headers({"content-type": "application/pdf"}))
    assert await validate_uploaded_file(good) == b"%PDF-1.4 resume"


# ── Responses ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_server_errors_hide_internal_details(monkeypatch):
    from app.controllers.user_controller import UserController

    async def boom(*a, **k):
        raise RuntimeError("SELECT secret_column FROM internal_table")

    monkeypatch.setattr(UserController, "list_users", boom)
    async with Workspace() as ws:
        r = await ws.client.get("/api/v1/users", headers=ws.token("co-a-admin"))
    assert r.status_code == 500
    assert "secret_column" not in r.text and "RuntimeError" not in r.text
    assert "Reference:" in r.json()["message"]


@pytest.mark.asyncio
async def test_api_responses_carry_security_headers_and_no_credentialed_cors():
    async with Workspace() as ws:
        r = await ws.client.get("/api/v1/users/me", headers={**ws.token("co-a-admin"), "Origin": "https://evil.example"})
        assert r.headers["x-content-type-options"] == "nosniff"
        assert r.headers["x-frame-options"] == "DENY"
        assert r.headers["cache-control"] == "no-store"
        assert r.headers.get("access-control-allow-credentials") != "true"
        assert "strict-transport-security" not in r.headers          # plain HTTP
        r = await ws.client.get("/api/v1/users/me", headers={**ws.token("co-a-admin"), "X-Forwarded-Proto": "https"})
        assert r.headers["strict-transport-security"].startswith("max-age=")


# ── Settings ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_only_company_admins_send_test_emails(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "PERMISSIONS_MODE", "enforce")
    async with Workspace() as ws:
        ws.add_user("rec-1", "recruiter")
        ws.add_user("view-1", "viewer")
        r = await ws.client.post("/api/v1/settings/email/test", json={"email": "x@example.com"}, headers=ws.token("rec-1"))
        assert r.status_code == 403
        r = await ws.client.get("/api/v1/settings/email", headers=ws.token("view-1"))
        assert r.status_code == 403                                   # viewers have no settings:view


# ── SECRET_KEY ──────────────────────────────────────────────────────────────


def test_the_default_secret_key_is_refused_on_a_shared_database(monkeypatch):
    monkeypatch.setattr(bootstrap.settings, "SECRET_KEY", bootstrap.BUILT_IN_SECRET_KEY)
    monkeypatch.setattr(bootstrap.settings, "DATABASE_URL", "mongodb+srv://cluster0.example.mongodb.net/db")
    with pytest.raises(RuntimeError):
        bootstrap.check_secret_key()
    monkeypatch.setattr(bootstrap.settings, "DATABASE_URL", "mongodb://localhost:27017")
    bootstrap.check_secret_key()                                      # local development keeps working
    monkeypatch.setattr(bootstrap.settings, "DATABASE_URL", "mongodb+srv://cluster0.example.mongodb.net/db")
    monkeypatch.setattr(bootstrap.settings, "SECRET_KEY", "a-long-random-key-from-the-server-env")
    bootstrap.check_secret_key()


# ── Indexes ─────────────────────────────────────────────────────────────────


def test_company_indexes_lead_with_company_id():
    """Every compound index on a company collection starts with company_id (queries are always scoped by it)."""
    from app.core.indexes import INDEXES
    from app.core.tenant import TENANT_COLLECTIONS

    wrong = [(coll, keys) for coll, keys, _ in INDEXES
             if coll in TENANT_COLLECTIONS and len(keys) > 1 and keys[0][0] != "company_id"
             and coll != "interviews" and coll != "notifications"]   # read across companies by date / per user
    assert wrong == []


@pytest.mark.asyncio
async def test_ensure_indexes_creates_each_index_once():
    from app.core.indexes import INDEXES, ensure_indexes

    made = []

    class Coll:
        def __init__(self, name):
            self.name = name

        async def create_index(self, keys, **options):
            made.append((self.name, tuple(keys), tuple(sorted(options.items()))))

    class Db:
        def __getitem__(self, name):
            return Coll(name)

    assert await ensure_indexes(Db()) == len(INDEXES)
    assert len(set(made)) == len(made)
