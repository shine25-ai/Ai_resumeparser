"""
Fields and endpoints the requirement mockups need (Screens 1-22 for Phases 1-4): subscription plans,
company tenant settings, platform settings, brand colours, job page fields, job import/export/stats and the
extra career page content (highlights strip, icons, About stats, header and second hero button).
"""

import pytest

from app.core.exceptions import BadRequestError, ConflictError
from app.core.tenant import ScopedDatabase, company_scope
from app.models.branding import clean_branding, contrast_warnings, effective_branding
from app.services.branding_service import BrandingService
from app.services.career_page_service import clean_content, default_content, new_section, with_content_defaults
from app.services.job_management import CSV_COLUMNS, JobManagementService, clean_job
from app.services.job_opening_service import JobOpeningService
from app.services.plan_service import PlanService
from tests.fake_mongo import FakeDatabase

ADMIN = {"id": "a1", "full_name": "Asha", "role": "admin"}


# ── Plans ────────────────────────────────────────────────────────────────────

@pytest.fixture
def plans():
    db = FakeDatabase()
    db["companies"].docs.append({"id": "acme", "name": "Acme", "slug": "acme", "plan": "growth", "archived_at": None})
    return PlanService(db)


@pytest.mark.asyncio
async def test_plans_catalogue(plans):
    growth = await plans.create({"name": "Growth", "monthly_price": 7999, "features": ["Up to 25 jobs", "AI + Reports", "AI + Reports"],
                                 "limits": {"users": 25, "active_jobs": 25}})
    assert growth["code"] == "growth" and growth["features"] == ["Up to 25 jobs", "AI + Reports"]
    custom = await plans.create({"name": "Enterprise", "monthly_price": ""})
    assert custom["monthly_price"] is None                       # "Custom"
    with pytest.raises(ConflictError):
        await plans.create({"name": "Growth"})
    with pytest.raises(BadRequestError):
        await plans.create({"name": "Bad", "monthly_price": -1})
    listed = {p["code"]: p for p in await plans.list()}
    assert listed["growth"]["companies_count"] == 1 and listed["enterprise"]["companies_count"] == 0
    assert (await plans.limits_for("growth"))["active_jobs"] == 25
    with pytest.raises(BadRequestError):
        await plans.update(growth["id"], {"code": "other"})
    updated = await plans.update(growth["id"], {"monthly_price": 8999, "is_active": False})
    assert updated["monthly_price"] == 8999 and updated["is_active"] is False
    with pytest.raises(ConflictError):
        await plans.delete(growth["id"])                         # a company is on it
    await plans.delete(custom["id"])
    assert [p["code"] for p in await plans.list()] == ["growth"]


# ── Company profile and tenant settings ─────────────────────────────────────

def test_company_tenant_settings_and_plan_dates():
    out = JobOpeningService._clean_profile({
        "short_name": " ShineLogics ", "company_type": "Private Limited",
        "tenant_settings": {"resume_parsing": False, "data_retention_months": 12},
    })
    assert out["short_name"] == "ShineLogics" and out["company_type"] == "Private Limited"
    assert out["tenant_settings"]["resume_parsing"] is False
    assert out["tenant_settings"]["duplicate_check"] is True     # the rest keep their defaults
    assert out["tenant_settings"]["data_retention_months"] == 12
    with pytest.raises(BadRequestError):
        JobOpeningService._clean_profile({"tenant_settings": {"data_retention_months": 7}})
    assert JobOpeningService._clean_plan({"plan_valid_until": "2026-03-30"})["plan_valid_until"] == "2026-03-30"
    assert JobOpeningService._clean_plan({"plan_valid_until": ""})["plan_valid_until"] is None
    with pytest.raises(BadRequestError):
        JobOpeningService._clean_plan({"plan_valid_until": "30/03/2026"})


# ── Platform settings and brand colours ─────────────────────────────────────

@pytest.mark.asyncio
async def test_platform_settings_defaults_and_resume_types():
    svc = BrandingService(FakeDatabase())
    data = await svc.platform_settings()
    assert data["default_timezone"] == "Asia/Kolkata" and data["default_language"] == "en"
    assert data["allowed_resume_types"] == ["pdf", "doc", "docx"]
    data = await svc.save_platform_settings({"allowed_resume_types": [".PDF", "docx", "pdf"], "default_language": "ta"})
    assert data["allowed_resume_types"] == ["pdf", "docx"] and data["default_language"] == "ta"
    for bad in ([], ["exe"]):
        with pytest.raises(BadRequestError):
            await svc.save_platform_settings({"allowed_resume_types": bad})


def test_secondary_and_text_colours():
    out = clean_branding({"colors": {"secondary": "#2563EB", "text": "#111827"}})
    assert out["colors"] == {"secondary": "#2563eb", "text": "#111827"}
    merged = effective_branding(None, {"colors": {"text": "#cccccc"}})
    assert any(w["check"].startswith("Text colour") for w in contrast_warnings(merged))


# ── Jobs ─────────────────────────────────────────────────────────────────────

def test_job_page_fields():
    out = clean_job({"title": "Java Dev", "tagline": "Build things.", "salary_period": "month",
                     "requirements": ["5+ years Java", "5+ years Java"], "nice_to_have": ["Kafka"]})
    assert out["tagline"] == "Build things." and out["salary_period"] == "month"
    assert out["requirements"] == ["5+ years Java"] and out["nice_to_have"] == ["Kafka"]
    with pytest.raises(BadRequestError):
        clean_job({"title": "x", "salary_period": "week"})


@pytest.fixture
def jobs():
    raw = FakeDatabase()
    raw["companies"].docs.append({"id": "acme", "name": "Acme", "slug": "acme"})
    return JobManagementService(ScopedDatabase(raw))


@pytest.mark.asyncio
async def test_job_import_export_and_stats(jobs):
    header = ",".join(CSV_COLUMNS)
    csv_text = "\n".join([
        header,
        "Java Developer,Engineering,,Chennai,Full time,Hybrid,5,8,2,Java; Spring Boot,Docker,,,INR,,Build services",
        ",Engineering,,,,,,,,,,,,,,",                           # no title
        "QA Engineer,Quality,,Pune,,Moon,,,,,,,,,,",             # bad work mode
    ])
    with company_scope("acme"):
        result = await jobs.import_csv(csv_text, ADMIN)
        assert [c["title"] for c in result["created"]] == ["Java Developer"]
        assert [e["row"] for e in result["errors"]] == [3, 4]
        job = await jobs.get(result["created"][0]["id"])
        assert job["status"] == "DRAFT" and job["primary_skills"] == ["Java", "Spring Boot"] and job["open_positions"] == 2
        stats = await jobs.stats()
        assert stats["total"] == 1 and stats["draft"] == 1 and stats["active"] == 0 and stats["avg_days_to_hire"] is None
        exported = await jobs.export_csv()
        assert exported.splitlines()[0].startswith("Title,Department") and "Java Developer" in exported
        with pytest.raises(BadRequestError):
            await jobs.import_csv(header, ADMIN)                 # no rows


# ── Career page ──────────────────────────────────────────────────────────────

def test_career_page_mockup_content():
    content = default_content("Acme")
    content["header"]["cta"] = {"label": "Join Our Team", "target": "#Open_Positions"}
    content["hero"].update({"secondary_cta_label": "Know our culture", "secondary_cta_target": "https://acme.com/culture",
                            "badge_text": "People · Products · Impact", "layout": "split"})
    about = content["sections"][0]
    about.update({"stats": [{"value": "10+", "label": "Years"}, {"value": "", "label": "dropped"}],
                  "video_url": "https://www.youtube.com/watch?v=x"})
    strip = new_section("highlights")
    strip["items"] = [{"title": "Product first", "icon": "rocket"}, {"title": "Bad icon", "icon": "<svg>"}]
    content["sections"].append(strip)
    out = clean_content(content)
    assert out["header"]["cta"] == {"label": "Join Our Team", "target": "#open_positions"}
    assert out["hero"]["layout"] == "split" and out["hero"]["secondary_cta_target"] == "https://acme.com/culture"
    assert out["sections"][0]["stats"] == [{"value": "10+", "label": "Years"}]
    assert [i["icon"] for i in out["sections"][-1]["items"]] == ["rocket", ""]
    assert out["texts"]["job_cta_title"] == "Be part of our journey"
    with pytest.raises(BadRequestError):
        clean_content({**content, "sections": [{**about, "video_url": "https://evil.example/v"}, *content["sections"][1:]]})


def test_older_pages_get_the_new_fields():
    old = default_content("Acme")
    del old["header"]["cta"], old["hero"]["layout"], old["texts"]["job_cta_title"], old["sections"][0]["stats"]
    filled = with_content_defaults(old)
    assert filled["header"]["cta"] == {"label": "", "target": ""}
    assert filled["hero"]["layout"] == "background" and filled["sections"][0]["stats"] == []
    assert "cta" not in old["header"]                            # the stored copy is left alone


@pytest.mark.asyncio
async def test_create_company_sets_the_careers_headline():
    from app.services.career_page_service import CareerPageService

    db = FakeDatabase()
    db["companies"].docs.append({"id": "globex", "name": "Globex", "slug": "globex"})
    svc = CareerPageService(db)
    await svc.set_headline("globex", "  Move India's freight  ")
    page = await svc.get("globex")
    assert page["draft"]["hero"]["title"] == "Move India's freight"
    assert page["published"]["hero"]["title"] == "Move India's freight"
    await svc.set_headline("globex", "")          # nothing given: the default stays
    assert (await svc.get("globex"))["draft"]["hero"]["title"] == "Move India's freight"
