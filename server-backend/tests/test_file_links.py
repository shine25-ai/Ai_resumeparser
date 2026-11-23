"""
Signed, expiring file links: bucket URLs never leave the API, and signed links sent back are stored as bucket URLs.
"""

import json

import pytest
from fastapi import FastAPI, Request
from httpx import ASGITransport, AsyncClient

from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.core.file_access import key_of, raw_url, read_token, sign_bucket_urls, sign_key, unsign_links
from app.middleware.file_links import FileLinkMiddleware
from app.routes.files import router as files_router

BUCKET = settings.S3_UR.rstrip("/") + "/"
RESUME = BUCKET + "resumes/abc_cv.pdf"


def test_key_of_and_raw_url_round_trip():
    assert key_of(RESUME) == "resumes/abc_cv.pdf"
    assert raw_url("resumes/abc_cv.pdf") == RESUME
    assert key_of("https://example.com/x.pdf") is None


def test_sign_and_unsign_in_json_text():
    text = json.dumps({"s3_url": RESUME, "files": [RESUME], "other": "https://example.com/a.pdf"})
    signed = sign_bucket_urls(text, "http://api.test")
    assert BUCKET not in signed and "http://api.test/api/v1/files/" in signed
    assert "https://example.com/a.pdf" in signed
    assert json.loads(unsign_links(signed)) == json.loads(text)


def test_tokens_expire_and_cannot_be_forged_or_climb_out():
    assert read_token(sign_key("resumes/a.pdf")) == "resumes/a.pdf"
    expired = sign_key("resumes/a.pdf", ttl_minutes=-1)
    assert read_token(expired) is None
    assert read_token(expired, verify_exp=False) == "resumes/a.pdf"  # still turned back into the stored URL
    assert read_token("not.a.token") is None
    assert read_token(sign_key("../etc/passwd")) is None


RECEIVED = {}


def _app():
    app = FastAPI()

    @app.get("/api/v1/resumes/r1")
    async def get_resume():
        return {"data": {"s3_url": RESUME, "profile_picture_url": BUCKET + "profile-pictures/p.png"}}

    @app.put("/api/v1/interviews/i1")
    async def save(request: Request):
        RECEIVED["body"] = await request.json()
        return {"ok": True}

    app.include_router(files_router)
    app.add_middleware(FileLinkMiddleware)
    register_exception_handlers(app)
    return app


@pytest.mark.asyncio
async def test_api_hands_out_signed_links_and_stores_bucket_urls(monkeypatch):
    monkeypatch.setattr(settings, "AWS_ACCESS_KEY_ID", "")
    async with AsyncClient(transport=ASGITransport(app=_app()), base_url="http://api.test") as c:
        body = (await c.get("/api/v1/resumes/r1")).json()["data"]
        assert body["s3_url"].startswith("http://api.test/api/v1/files/")
        assert BUCKET not in json.dumps(body)

        await c.put("/api/v1/interviews/i1", json={"files": [body["s3_url"]]})
        assert RECEIVED["body"] == {"files": [RESUME]}  # the stored form, not the expiring link

        opened = await c.get(body["s3_url"].replace("http://api.test", ""), follow_redirects=False)
        assert opened.status_code == 302 and opened.headers["location"] == RESUME

        bad = await c.get("/api/v1/files/forged.token.value", follow_redirects=False)
        assert bad.status_code == 404 and "location" not in bad.headers


@pytest.mark.asyncio
async def test_non_api_and_non_json_pass_through():
    app = FastAPI()

    @app.get("/static/x")
    async def x():
        return {"u": RESUME}

    app.add_middleware(FileLinkMiddleware)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://api.test") as c:
        assert (await c.get("/static/x")).json() == {"u": RESUME}
