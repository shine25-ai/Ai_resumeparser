"""CORS on the public careers endpoints: any origin, including a page opened from a file ("null")."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

from app.middleware.public_cors import PublicCorsMiddleware


def _client() -> TestClient:
    app = FastAPI()
    # Same main CORS setup as app.main, then the public layer outermost.
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"https?://.*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(PublicCorsMiddleware)

    @app.get("/api/v1/public/jobs")
    def jobs():
        return {"ok": True}

    @app.get("/api/v1/resumes")
    def resumes():
        return {"ok": True}

    return TestClient(app)


def test_page_opened_from_file_can_read_public_jobs():
    r = _client().get("/api/v1/public/jobs", headers={"Origin": "null"})
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == "*"
    assert "access-control-allow-credentials" not in r.headers


def test_website_origin_gets_star_without_credentials_on_public_jobs():
    r = _client().get("/api/v1/public/jobs", headers={"Origin": "https://example.com"})
    assert r.headers["access-control-allow-origin"] == "*"
    assert "access-control-allow-credentials" not in r.headers


def test_preflight_for_apply_allows_the_applicant_token_header():
    r = _client().options(
        "/api/v1/public/jobs",
        headers={
            "Origin": "null",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "x-applicant-token",
        },
    )
    assert r.status_code == 204
    assert r.headers["access-control-allow-origin"] == "*"
    assert "POST" in r.headers["access-control-allow-methods"]
    assert r.headers["access-control-allow-headers"] == "x-applicant-token"


def test_login_endpoints_keep_the_main_rules():
    client = _client()
    assert "access-control-allow-origin" not in client.get("/api/v1/resumes", headers={"Origin": "null"}).headers
    r = client.get("/api/v1/resumes", headers={"Origin": "https://example.com"})
    assert r.headers["access-control-allow-origin"] == "https://example.com"
