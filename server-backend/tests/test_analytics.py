"""
Test Suite for Analytics & Reporting (SRS 4.1, 4.3, 4.18; Screens 1, 4, 20).
Covers Test Scenarios P10-01 through P10-06.
"""

from datetime import datetime, timezone, timedelta
from typing import Any, cast
import time
import pytest
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient

from app.core.database import db_manager
from app.core.exceptions import AuthorizationError
from app.core.tenant import set_company, ScopedDatabase, system_scope
from app.core import dependencies
from app.routes.analytics import router as analytics_router
from app.services.analytics_service import AnalyticsService
from app.models.job_opening import JobApplicationDocument
from app.utils.constants import (
    COMPANIES_COLLECTION,
    JOB_OPENINGS_COLLECTION,
    RESUMES_COLLECTION,
    JOB_APPLICATIONS_COLLECTION,
    INTERVIEWS_COLLECTION,
    AUDIT_LOGS_COLLECTION,
)
from tests.fake_mongo import FakeDatabase

pytestmark = pytest.mark.asyncio


@pytest.fixture
def fake_db(monkeypatch):
    fdb = FakeDatabase()
    monkeypatch.setattr(db_manager, "db", fdb)
    monkeypatch.setattr(db_manager, "get_raw_db", lambda: fdb)
    monkeypatch.setattr(db_manager, "get_db", lambda: ScopedDatabase(cast(Any, fdb)))
    AnalyticsService.invalidate_cache()
    return fdb


def _create_test_app(user: dict):
    test_app = FastAPI()
    test_app.include_router(analytics_router)
    test_app.dependency_overrides[dependencies.get_current_active_user] = lambda: user
    test_app.dependency_overrides[dependencies.get_current_user] = lambda: user

    @test_app.exception_handler(AuthorizationError)
    async def _forbidden(request, exc):
        return JSONResponse(status_code=403, content={"detail": str(exc), "message": str(exc)})

    return test_app


# ──────────────────────────────────────────────────────────────────────────────
# P10-01: Seed 2 companies with known counts.
# Super Admin totals = sum of both; each company sees only its own.
# ──────────────────────────────────────────────────────────────────────────────
async def test_p10_01_seed_two_companies_isolation_and_sum(fake_db):
    now = datetime.now(timezone.utc)
    t_10d_ago = (now - timedelta(days=10)).isoformat()
    t_40d_ago = (now - timedelta(days=40)).isoformat()

    fake_db[COMPANIES_COLLECTION].docs = [
        {"id": "comp-alpha", "name": "Alpha Corp", "is_active": True, "created_at": t_40d_ago},
        {"id": "comp-beta", "name": "Beta LLC", "is_active": True, "created_at": t_10d_ago},
    ]

    fake_db[JOB_OPENINGS_COLLECTION].docs = [
        {"id": "job-a1", "company_id": "comp-alpha", "title": "Java Dev", "status": "OPEN", "accept_applications": True, "created_at": t_10d_ago},
        {"id": "job-a2", "company_id": "comp-alpha", "title": "DevOps", "status": "OPEN", "accept_applications": True, "created_at": t_10d_ago},
        {"id": "job-a3", "company_id": "comp-alpha", "title": "QA", "status": "CLOSED", "accept_applications": False, "created_at": t_40d_ago},
        {"id": "job-b1", "company_id": "comp-beta", "title": "Frontend", "status": "OPEN", "accept_applications": True, "created_at": t_10d_ago},
        {"id": "job-b2", "company_id": "comp-beta", "title": "PM", "status": "OPEN", "accept_applications": True, "created_at": t_10d_ago},
    ]

    fake_db[RESUMES_COLLECTION].docs = [
        {"id": f"res-a{i}", "company_id": "comp-alpha", "candidate_name": f"Cand A{i}", "upload_date": t_10d_ago, "redirect_id": None}
        for i in range(1, 6)
    ] + [
        {"id": f"res-b{i}", "company_id": "comp-beta", "candidate_name": f"Cand B{i}", "upload_date": t_10d_ago, "redirect_id": None}
        for i in range(1, 5)
    ]

    fake_db[INTERVIEWS_COLLECTION].docs = [
        {"id": f"inv-a{i}", "company_id": "comp-alpha", "status": "COMPLETED", "scheduled_date": t_10d_ago[:10], "created_at": t_10d_ago}
        for i in range(1, 4)
    ] + [
        {"id": "inv-b1", "company_id": "comp-beta", "status": "COMPLETED", "scheduled_date": t_10d_ago[:10], "created_at": t_10d_ago}
    ]

    fake_db[JOB_APPLICATIONS_COLLECTION].docs = [
        {"id": "app-a1", "company_id": "comp-alpha", "stage_id": "hired", "hired_at": t_10d_ago},
        {"id": "app-a2", "company_id": "comp-alpha", "stage_id": "hired", "hired_at": t_10d_ago},
        {"id": "app-b1", "company_id": "comp-beta", "stage_id": "hired", "hired_at": t_10d_ago},
    ]

    svc = AnalyticsService()

    # 1. Company Alpha sees only Alpha's counts
    set_company("comp-alpha")
    alpha_dash = await svc.get_company_dashboard(days=30)
    assert alpha_dash["kpis"]["active_jobs"]["value"] == 2
    assert alpha_dash["kpis"]["total_candidates"]["value"] == 5
    assert alpha_dash["kpis"]["interviews"]["value"] == 3
    assert alpha_dash["kpis"]["hires"]["value"] == 2

    # 2. Company Beta sees only Beta's counts
    set_company("comp-beta")
    beta_dash = await svc.get_company_dashboard(days=30)
    assert beta_dash["kpis"]["active_jobs"]["value"] == 2
    assert beta_dash["kpis"]["total_candidates"]["value"] == 4
    assert beta_dash["kpis"]["interviews"]["value"] == 1
    assert beta_dash["kpis"]["hires"]["value"] == 1

    # 3. Super Admin totals = sum of both
    with system_scope():
        platform_dash = await svc.get_super_admin_dashboard(days=30)
        assert platform_dash["kpis"]["total_companies"]["value"] == 2
        assert platform_dash["kpis"]["active_jobs"]["value"] == 2 + 2  # 4
        assert platform_dash["kpis"]["total_candidates"]["value"] == 5 + 4  # 9
        assert platform_dash["kpis"]["interviews"]["value"] == 3 + 1  # 4
        assert platform_dash["kpis"]["hires"]["value"] == 2 + 1  # 3


# ──────────────────────────────────────────────────────────────────────────────
# P10-02: 3 hires with known dates.
# Average and median time-to-hire match a hand calculation.
# ──────────────────────────────────────────────────────────────────────────────
async def test_p10_02_three_hires_known_dates_average_and_median(fake_db):
    set_company("comp-dwell")
    now = datetime.now(timezone.utc)
    t_hired = (now - timedelta(days=10)).isoformat()
    t_hire_1 = (now - timedelta(days=40)).isoformat()  # 30 days dwell
    t_hire_2 = (now - timedelta(days=25)).isoformat()  # 15 days dwell
    t_hire_3 = (now - timedelta(days=16)).isoformat()  # 6 days dwell

    # Hand Calculation:
    # Dwells: [30.0, 15.0, 6.0]
    # Mean = (30 + 15 + 6) / 3 = 51 / 3 = 17.0 days
    # Median of sorted [6.0, 15.0, 30.0] = 15.0 days

    fake_db[JOB_APPLICATIONS_COLLECTION].docs = [
        {"id": "app-1", "company_id": "comp-dwell", "stage_id": "hired", "applied_at": t_hire_1, "hired_at": t_hired},
        {"id": "app-2", "company_id": "comp-dwell", "stage_id": "hired", "applied_at": t_hire_2, "hired_at": t_hired},
        {"id": "app-3", "company_id": "comp-dwell", "stage_id": "hired", "applied_at": t_hire_3, "hired_at": t_hired},
    ]

    svc = AnalyticsService()
    comp_dash = await svc.get_company_dashboard(days=30)
    avg_tth = comp_dash["kpis"]["avg_time_to_hire"]["value_days"]
    med_tth = comp_dash["kpis"]["avg_time_to_hire"]["median_days"]

    assert avg_tth == 17.0
    assert med_tth == 15.0

    # Also check recruitment reports
    reports = await svc.get_recruitment_reports(days=30)
    assert reports["kpis"]["time_to_hire"]["value_days"] == 17.0
    assert reports["kpis"]["time_to_hire"]["median_days"] == 15.0


# ──────────────────────────────────────────────────────────────────────────────
# P10-03: Switch range 30 -> 7 days.
# Every widget updates; change % compares against the previous 7 days.
# ──────────────────────────────────────────────────────────────────────────────
async def test_p10_03_switch_range_30_to_7_days(fake_db):
    set_company("comp-range")
    now = datetime.now(timezone.utc)
    t_3d = (now - timedelta(days=3)).isoformat()  # in 7d window
    t_5d = (now - timedelta(days=5)).isoformat()  # in 7d window
    t_10d = (now - timedelta(days=10)).isoformat() # in previous 7d window (days 8-14)
    t_25d = (now - timedelta(days=25)).isoformat() # in 30d window, but outside 14d

    fake_db[RESUMES_COLLECTION].docs = [
        {"id": "r1", "company_id": "comp-range", "upload_date": t_3d, "redirect_id": None},
        {"id": "r2", "company_id": "comp-range", "upload_date": t_5d, "redirect_id": None},
        {"id": "r3", "company_id": "comp-range", "upload_date": t_10d, "redirect_id": None},
        {"id": "r4", "company_id": "comp-range", "upload_date": t_25d, "redirect_id": None},
    ]
    fake_db[JOB_APPLICATIONS_COLLECTION].docs = [
        {"id": "a1", "company_id": "comp-range", "applied_at": t_3d},
        {"id": "a2", "company_id": "comp-range", "applied_at": t_5d},
        {"id": "a3", "company_id": "comp-range", "applied_at": t_10d},
        {"id": "a4", "company_id": "comp-range", "applied_at": t_25d},
    ]

    svc = AnalyticsService()

    # 1. Load with 30 days
    dash_30d = await svc.get_company_dashboard(days=30)
    assert dash_30d["range_days"] == 30
    assert dash_30d["kpis"]["new_applications"]["value"] == 4

    # 2. Switch range to 7 days
    dash_7d = await svc.get_company_dashboard(days=7)
    assert dash_7d["range_days"] == 7
    # Current 7d has 2 applications (t_3d, t_5d)
    assert dash_7d["kpis"]["new_applications"]["value"] == 2
    # Previous 7d has 1 application (t_10d)
    # Change % = ((2 - 1) / 1) * 100 = +100.0%
    assert dash_7d["kpis"]["new_applications"]["change_pct"] == 100.0


# ──────────────────────────────────────────────────────────────────────────────
# P10-04: Export each report.
# CSV totals equal the screen.
# ──────────────────────────────────────────────────────────────────────────────
async def test_p10_04_export_each_report_csv_totals_equal_screen(fake_db):
    set_company("comp-export")
    now = datetime.now(timezone.utc)
    t_20d = (now - timedelta(days=20)).isoformat()
    t_10d = (now - timedelta(days=10)).isoformat()

    fake_db[JOB_OPENINGS_COLLECTION].docs = [
        {"id": "j1", "company_id": "comp-export", "title": "Architect", "status": "OPEN", "created_at": t_20d}
    ]
    fake_db[JOB_APPLICATIONS_COLLECTION].docs = [
        {"id": "a1", "company_id": "comp-export", "stage_id": "hired", "applied_at": t_20d, "hired_at": t_10d}
    ]
    fake_db[RESUMES_COLLECTION].docs = [
        {"id": "r1", "company_id": "comp-export", "upload_date": t_20d, "redirect_id": None}
    ]

    svc = AnalyticsService()
    reports = await svc.get_recruitment_reports(days=90)
    csv_text = await svc.export_reports_csv(days=90)

    # Check screen numbers are verbatim in the CSV
    assert "RECRUITMENT REPORTS & ANALYTICS" in csv_text
    assert f"Period: {reports['start_date']} to {reports['end_date']}" in csv_text
    assert str(reports["kpis"]["jobs_opened"]["value"]) in csv_text
    assert str(reports["kpis"]["applications"]["value"]) in csv_text
    assert str(reports["kpis"]["hired"]["value"]) in csv_text
    assert str(reports["kpis"]["time_to_hire"]["value_days"]) in csv_text
    assert str(reports["kpis"]["time_to_hire"]["median_days"]) in csv_text


# ──────────────────────────────────────────────────────────────────────────────
# P10-05: Brand-new company with no data.
# Friendly empty states, no errors or NaN.
# ──────────────────────────────────────────────────────────────────────────────
async def test_p10_05_brand_new_company_empty_state_no_nan(fake_db):
    set_company("comp-brand-new")
    svc = AnalyticsService()

    comp_dash = await svc.get_company_dashboard(days=30)
    assert comp_dash["kpis"]["active_jobs"]["value"] == 0
    assert comp_dash["kpis"]["total_candidates"]["value"] == 0
    assert comp_dash["kpis"]["new_applications"]["value"] == 0
    assert comp_dash["kpis"]["interviews"]["value"] == 0
    assert comp_dash["kpis"]["hires"]["value"] == 0
    assert comp_dash["kpis"]["avg_time_to_hire"]["value_days"] == 0.0
    assert comp_dash["kpis"]["avg_time_to_hire"]["median_days"] == 0.0
    assert comp_dash["funnel"][0]["count"] == 0
    assert comp_dash["funnel"][0]["percentage"] == 0.0
    assert comp_dash["recent_jobs"] == []
    assert comp_dash["upcoming_interviews"] == []
    assert comp_dash["recent_candidates"] == []

    reports = await svc.get_recruitment_reports(days=90)
    assert reports["kpis"]["jobs_opened"]["value"] == 0
    assert reports["kpis"]["applications"]["value"] == 0
    assert reports["kpis"]["hired"]["value"] == 0
    assert reports["kpis"]["time_to_hire"]["value_days"] == 0.0
    assert reports["kpis"]["time_to_hire"]["median_days"] == 0.0
    assert reports["funnel"][0]["count"] == 0
    assert reports["applications_by_source"] == []
    assert reports["hiring_by_department"] == []
    assert reports["recruiter_performance"] == []
    assert reports["key_insights"][0]["category"] == "empty"

    # CSV export with 0 data must succeed without errors
    csv_text = await svc.export_reports_csv(days=90)
    assert "RECRUITMENT REPORTS & ANALYTICS" in csv_text


# ──────────────────────────────────────────────────────────────────────────────
# P10-06: Dashboard load with 10,000 applications (seeded).
# Under 2 seconds locally; cached second load faster.
# ──────────────────────────────────────────────────────────────────────────────
async def test_p10_06_dashboard_load_10k_applications_and_caching(fake_db):
    set_company("comp-10k")
    now = datetime.now(timezone.utc)
    t_iso = now.isoformat()

    # Seed 10,000 applications
    fake_db[JOB_APPLICATIONS_COLLECTION].docs = [
        {"id": f"app-{i}", "company_id": "comp-10k", "applied_at": t_iso, "stage_id": "applied"}
        for i in range(10000)
    ]
    fake_db[RESUMES_COLLECTION].docs = [
        {"id": f"res-{i}", "company_id": "comp-10k", "upload_date": t_iso, "redirect_id": None}
        for i in range(100)
    ]

    svc = AnalyticsService()
    AnalyticsService.invalidate_cache("comp-10k")

    # 1. First run: uncached load
    start_time = time.perf_counter()
    dash1 = await svc.get_company_dashboard(days=30)
    uncached_duration = time.perf_counter() - start_time

    assert uncached_duration < 2.0  # Must be under 2 seconds locally
    assert dash1["kpis"]["new_applications"]["value"] == 10000

    # 2. Second run: cached load
    start_cached = time.perf_counter()
    dash2 = await svc.get_company_dashboard(days=30)
    cached_duration = time.perf_counter() - start_cached

    assert dash2["kpis"]["new_applications"]["value"] == 10000
    assert cached_duration < uncached_duration  # Cached load is faster


# ──────────────────────────────────────────────────────────────────────────────
# Permissions & Authorization Check
# ──────────────────────────────────────────────────────────────────────────────
async def test_permissions_and_export_forbidden(fake_db):
    recruiter_user = {"id": "rec-1", "role": "recruiter", "company_id": "comp-alpha", "permissions": ["reports:view"]}
    app1 = _create_test_app(recruiter_user)
    async with AsyncClient(transport=ASGITransport(app=app1), base_url="http://testserver") as client:
        res = await client.get("/api/v1/analytics/platform-dashboard")
        assert res.status_code == 403

        res_export_forbidden = await client.get("/api/v1/analytics/reports/export")
        assert res_export_forbidden.status_code == 403
        assert "reports:export" in res_export_forbidden.text

    exporter_user = {"id": "rec-2", "role": "recruiter", "company_id": "comp-alpha", "permissions": ["reports:view", "reports:export"]}
    app2 = _create_test_app(exporter_user)
    async with AsyncClient(transport=ASGITransport(app=app2), base_url="http://testserver") as client:
        set_company("comp-alpha")
        res_export_ok = await client.get("/api/v1/analytics/reports/export")
        assert res_export_ok.status_code == 200
        assert res_export_ok.headers["content-type"].startswith("text/csv")


async def test_real_job_application_document_metrics_and_dwell_time(fake_db):
    """
    Real Phase 5 applications store submitted_at instead of applied_at.
    Verifies that dashboard counts, report counts, and time-to-hire dwell times
    read submitted_at properly when JobApplicationDocument instances are present.
    """
    set_company("comp-real-apps")
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    sub_1 = (now - timedelta(days=20)).isoformat()
    sub_2 = (now - timedelta(days=10)).isoformat()
    hired_2 = (now - timedelta(days=2)).isoformat()  # 8 days dwell

    app1 = JobApplicationDocument(
        id="app-real-doc-1",
        company_id="comp-real-apps",
        opening_id="job-opening-1",
        opening_title="Staff Engineer",
        applicant_email="staff@example.com",
        resume_id="res-real-1",
        candidate_id="cand-rec-1",
        form={"personal": {"full_name": "Staff Candidate"}},
        submitted_at=sub_1,
        stage="APPLIED",
        stage_id="applied",
    ).to_dict()

    app2 = JobApplicationDocument(
        id="app-real-doc-2",
        company_id="comp-real-apps",
        opening_id="job-opening-1",
        opening_title="Staff Engineer",
        applicant_email="hired@example.com",
        resume_id="res-real-2",
        candidate_id="cand-rec-2",
        form={"personal": {"full_name": "Hired Candidate"}},
        submitted_at=sub_2,
        stage="Hired",
        stage_id="hired",
        hired_at=hired_2,
    ).to_dict()

    fake_db[JOB_APPLICATIONS_COLLECTION].docs = [app1, app2]
    fake_db[JOB_OPENINGS_COLLECTION].docs = [{
        "id": "job-opening-1",
        "company_id": "comp-real-apps",
        "title": "Staff Engineer",
        "status": "OPEN",
        "accept_applications": True,
        "created_at": sub_1,
    }]

    svc = AnalyticsService()
    dash = await svc.get_company_dashboard(days=30)
    assert dash["kpis"]["new_applications"]["value"] == 2
    assert dash["kpis"]["hires"]["value"] == 1
    # Dwell time: 8 days (sub_2 to hired_2)
    assert dash["kpis"]["avg_time_to_hire"]["value_days"] == 8.0

    reports = await svc.get_recruitment_reports(days=30)
    assert reports["kpis"]["applications"]["value"] == 2
    assert reports["kpis"]["hired"]["value"] == 1
    assert reports["kpis"]["time_to_hire"]["value_days"] == 8.0

