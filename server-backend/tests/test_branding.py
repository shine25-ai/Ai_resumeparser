"""
White-label branding: validation, the three layers (built-in, platform, company), contrast warnings,
public branding and branding images.
"""

import pytest

from app.core.exceptions import BadRequestError, NotFoundError
from app.models.branding import (
    PLATFORM_DEFAULT_BRANDING,
    clean_branding,
    contrast_ratio,
    contrast_warnings,
    effective_branding,
)
from app.services.branding_service import BrandingService
from tests.fake_mongo import FakeDatabase

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100


def test_contrast_ratio_matches_wcag():
    assert contrast_ratio("#ffffff", "#000000") == 21.0
    assert contrast_ratio("#ffffff", "#ffffff") == 1.0


def test_clean_branding_validates_and_normalises():
    out = clean_branding({
        "colors": {"primary": "#ABCDEF", "nonsense": "#000000"},
        "dark_mode": "system",
        "email": {"reply_to": "HR@Acme.com", "footer_text": "  Acme Pvt Ltd  "},
        "logo_url": "/api/v1/public/branding/assets/abc.png",
    })
    assert out["colors"] == {"primary": "#abcdef"}
    assert out["email"] == {"reply_to": "hr@acme.com", "footer_text": "Acme Pvt Ltd"}
    assert out["dark_mode"] == "system"


@pytest.mark.parametrize("bad", [
    {"colors": {"primary": "teal"}},
    {"dark_mode": "sometimes"},
    {"font_family": "Comic Sans"},
    {"email": {"reply_to": "not-an-email"}},
    {"logo_url": "javascript:alert(1)"},
    {"logo_url": "http://insecure.example.com/logo.png"},
])
def test_clean_branding_rejects_bad_values(bad):
    with pytest.raises(BadRequestError):
        clean_branding(bad)


def test_layers_fill_what_the_layer_above_leaves_empty():
    merged = effective_branding({"colors": {"primary": "#111111"}}, {"colors": {"accent": "#222222", "primary": ""}})
    assert merged["colors"]["primary"] == "#111111"   # company left it empty: the platform's
    assert merged["colors"]["accent"] == "#222222"    # company's own
    assert merged["colors"]["sidebar_bg"] == PLATFORM_DEFAULT_BRANDING["colors"]["sidebar_bg"]  # built-in


def test_default_branding_is_readable():
    assert contrast_warnings(effective_branding(None, None)) == []


def test_low_contrast_primary_is_warned_not_blocked():
    warnings = contrast_warnings(effective_branding(None, {"colors": {"primary": "#ffff99"}}))
    assert any("White text" in w["check"] for w in warnings)


@pytest.fixture
def svc():
    db = FakeDatabase()
    db["companies"].docs.append({"id": "default", "name": "Shinelogics", "slug": "shinelogics"})
    db["companies"].docs.append({"id": "acme", "name": "Acme", "slug": "acme", "logo_url": "https://acme.com/l.png"})
    db["companies"].docs.append({"id": "gone", "name": "Gone", "slug": "gone", "archived_at": "2026-01-01"})
    return BrandingService(db)


@pytest.mark.asyncio
async def test_company_branding_saves_partially_and_resets(svc):
    data = await svc.for_company("acme")
    assert data["effective"]["app_name"] == "Acme"             # its own name, not the platform's
    assert data["effective"]["logo_url"] == "https://acme.com/l.png"
    assert data["effective"]["email"]["from_name"] == "Acme"

    await svc.save_company("acme", {"colors": {"primary": "#123456"}})
    data = await svc.save_company("acme", {"colors": {"accent": "#654321"}})
    assert data["company"]["colors"] == {"primary": "#123456", "accent": "#654321"}
    assert data["effective"]["colors"]["primary"] == "#123456"

    data = await svc.reset_company("acme")
    assert data["company"] == {}
    assert data["effective"]["colors"]["primary"] == PLATFORM_DEFAULT_BRANDING["colors"]["primary"]


@pytest.mark.asyncio
async def test_platform_branding_is_every_companys_default(svc):
    await svc.save_platform_settings({"platform_name": "TalentHub", "branding": {"colors": {"primary": "#7c3aed"}}})
    assert (await svc.for_company("acme"))["effective"]["colors"]["primary"] == "#7c3aed"
    with pytest.raises(BadRequestError):
        await svc.save_platform_settings({"platform_name": "  "})


@pytest.mark.asyncio
async def test_public_branding_hides_email_settings_and_unknown_companies(svc):
    await svc.save_company("acme", {"email": {"reply_to": "hr@acme.com"}, "colors": {"primary": "#123456"}})
    acme = await svc.public_for_slug("acme")
    assert "email" not in acme["branding"] and acme["company_name"] == "Acme"
    assert acme["branding"]["colors"]["primary"] == "#123456"

    for slug in (None, "nobody", "gone"):
        other = await svc.public_for_slug(slug)
        assert other["company_name"] is None and other["branding"]["app_name"] == "HireLogics"


@pytest.mark.asyncio
async def test_branding_images_are_checked(svc):
    asset = await svc.save_asset("acme", "logo", "image/png", PNG)
    assert asset["url"].startswith("/api/v1/public/branding/assets/") and asset["url"].endswith(".png")
    assert (await svc.get_asset(asset["id"]))["data"] == PNG

    with pytest.raises(BadRequestError):
        await svc.save_asset("acme", "logo", "image/svg+xml", b"<svg onload='alert(1)'/>")  # not an allowed image
    with pytest.raises(BadRequestError):
        await svc.save_asset("acme", "favicon", "image/png", PNG + b"\x00" * 200_000)    # too large
    with pytest.raises(BadRequestError):
        await svc.save_asset("acme", "wallpaper", "image/png", PNG)
    with pytest.raises(NotFoundError):
        await svc.get_asset("missing.png")


# ── Branded email ─────────────────────────────────────────────────────────────

from email.message import EmailMessage  # noqa: E402

from app.core.tenant import ScopedDatabase, company_scope  # noqa: E402
from app.services.mailer import address, branded_html, brandify, email_context, request_base_url  # noqa: E402


class _Smtp:
    sender_name = "Platform Mailer"
    sender_email = "noreply@platform.example"


@pytest.mark.asyncio
async def test_email_context_uses_company_branding(svc):
    await svc.save_company("acme", {
        "colors": {"primary": "#6d28d9"},
        "logo_url": "/api/v1/public/branding/assets/abc.png",
        "email": {"from_name": "Acme Careers", "reply_to": "hr@acme.com", "footer_text": "Acme Pvt Ltd, Chennai"},
    })
    token = request_base_url.set("https://api.example.com")
    try:
        ctx = await email_context(svc.db, "acme")
    finally:
        request_base_url.reset(token)
    assert ctx["primary"] == "#6d28d9" and ctx["from_name"] == "Acme Careers"
    assert ctx["logo_url"] == "https://api.example.com/api/v1/public/branding/assets/abc.png"

    msg = EmailMessage()
    msg["From"] = "old <old@x.com>"
    address(msg, _Smtp(), ctx)
    assert msg["From"] == "Acme Careers <noreply@platform.example>" and msg["Reply-To"] == "hr@acme.com"

    html = branded_html(ctx, "<p>Hi</p>", {"label": "Accept", "url": "https://portal/x?token=1"})
    assert "#6d28d9" in html and "Acme Pvt Ltd, Chennai" in html and "api.example.com" in html


@pytest.mark.asyncio
async def test_email_context_never_fails():
    class Broken:
        def __getitem__(self, name):
            raise RuntimeError("db down")

    ctx = await email_context(Broken(), "acme")
    assert ctx["app_name"] == "HireLogics"


def test_brandify_recolours_the_old_layout():
    old = ('<body><!-- Header Banner --><tr><td style="background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%);">'
           '<h1>Hi</h1></td></tr><p>Automated Interview System • AI Recruiter</p></body>')
    ctx = {"primary": "#6d28d9", "accent": "#0ea5e9", "app_name": "Acme Tech",
           "logo_url": "https://api.example.com/logo.png", "footer_text": "Acme Pvt Ltd"}
    out = brandify(old, ctx)
    assert "#4f46e5" not in out and "#6d28d9" in out and "#0ea5e9" in out
    assert "AI Recruiter" not in out and "Acme Tech" in out
    assert 'src="https://api.example.com/logo.png"' in out and "Acme Pvt Ltd" in out
