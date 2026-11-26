"""Tests verifying AnalyticsService.get_recruitment_reports returns only real, tenant-scoped DB metrics."""

from datetime import datetime, timedelta, timezone
from typing import Any, cast
import json
import pytest

from app.core.database import db_manager
from app.core.tenant import ScopedDatabase, company_scope
from app.services.analytics_service import AnalyticsService
from app.utils.constants import (
    INTERVIEWS_COLLECTION,
    JOB_APPLICATIONS_COLLECTION,
    JOB_OPENINGS_COLLECTION,
    RESUMES_COLLECTION,
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


async def test_recruitment_reports_uses_only_real_data_and_isolates_tenants(fake_db):
    now = datetime.now(timezone.utc)
    t_20d = (now - timedelta(days=20)).isoformat()
    t_10d = (now - timedelta(days=10)).isoformat()
    t_5d = (now - timedelta(days=5)).isoformat()
    t_2d = (now - timedelta(days=2)).isoformat()

    # Seed Company A with 2 jobs in 2 departments created by 2 different users
    fake_db[JOB_OPENINGS_COLLECTION].docs = [
        {
            "id": "job-1",
            "company_id": "comp-a",
            "title": "Backend Engineer",
            "department": "Platform",
            "open_positions": 2,
            "status": "OPEN",
            "created_at": t_20d,
            "created_by": {"id": "user-1", "name": "Alice M"},
            "hiring_manager": {"id": "hm-1", "name": "Bob H"},
        },
        {
            "id": "job-2",
            "company_id": "comp-a",
            "title": "Account Executive",
            "department": "Sales",
            "open_positions": 4,
            "status": "OPEN",
            "created_at": t_10d,
            "created_by": {"id": "user-2", "name": "Carlos R"},
            "hiring_manager": None,
        },
        # Company B job (must never appear in Company A)
        {
            "id": "job-b1",
            "company_id": "comp-b",
            "title": "Secret Role",
            "department": "Executive",
            "open_positions": 1,
            "status": "OPEN",
            "created_at": t_10d,
            "created_by": {"id": "user-b1", "name": "Mallory Z"},
        },
    ]

    # Seed 6 applications in Company A with varied heard_from and stages (one hired)
    fake_db[JOB_APPLICATIONS_COLLECTION].docs = [
        {
            "id": "app-1",
            "company_id": "comp-a",
            "opening_id": "job-1",
            "submitted_at": t_10d,
            "heard_from": "LinkedIn",
            "source": "Careers page",
            "stage_id": "hired",
            "hired_at": t_2d,
        },
        {
            "id": "app-2",
            "company_id": "comp-a",
            "opening_id": "job-1",
            "submitted_at": t_10d,
            "heard_from": "LinkedIn",
            "source": "Careers page",
            "stage_id": "interview",
            "hired_at": None,
        },
        {
            "id": "app-3",
            "company_id": "comp-a",
            "opening_id": "job-1",
            "submitted_at": t_5d,
            "heard_from": "Referral",
            "source": "Careers page",
            "stage_id": "shortlisted",
            "hired_at": None,
        },
        {
            "id": "app-4",
            "company_id": "comp-a",
            "opening_id": "job-1",
            "submitted_at": t_5d,
            "heard_from": "Naukri",
            "source": "Careers page",
            "stage_id": "screening",
            "hired_at": None,
        },
        {
            "id": "app-5",
            "company_id": "comp-a",
            "opening_id": "job-2",
            "submitted_at": t_5d,
            "heard_from": None,
            "source": "Careers page",
            "stage_id": "applied",
            "hired_at": None,
        },
        {
            "id": "app-6",
            "company_id": "comp-a",
            "opening_id": "job-2",
            "submitted_at": t_2d,
            "heard_from": "Company website",
            "source": "Careers page",
            "stage_id": "rejected",
            "hired_at": None,
        },
        # Company B application (must never appear in Company A)
        {
            "id": "app-b1",
            "company_id": "comp-b",
            "opening_id": "job-b1",
            "submitted_at": t_5d,
            "heard_from": "Glassdoor",
            "source": "Careers page",
            "stage_id": "hired",
            "hired_at": t_2d,
        },
    ]

    # Seed resumes with bogus source/counts to prove hiring_trend and sources do not fall back to resumes
    fake_db[RESUMES_COLLECTION].docs = [
        {"id": "res-x1", "company_id": "comp-a", "resume_source": "BogusResumeSource", "upload_date": (now - timedelta(days=95)).isoformat(), "redirect_id": None}
    ]

    # Seed 2 interviews in Company A (1 for job-1, 1 for job-2) and 1 in Company B
    fake_db[INTERVIEWS_COLLECTION].docs = [
        {
            "id": "int-1",
            "company_id": "comp-a",
            "job_id": "job-1",
            "interviewer_id": "int-u1",
            "status": "COMPLETED",
            "scheduled_date": t_5d[:10],
        },
        {
            "id": "int-2",
            "company_id": "comp-a",
            "job_id": "job-2",
            "interviewer_id": "int-u2",
            "status": "SCHEDULED",
            "scheduled_date": t_2d[:10],
        },
        {
            "id": "int-b1",
            "company_id": "comp-b",
            "job_id": "job-b1",
            "interviewer_id": "int-ub",
            "status": "COMPLETED",
            "scheduled_date": t_2d[:10],
        },
    ]

    svc = AnalyticsService()

    with company_scope("comp-a"):
        report = await svc.get_recruitment_reports(days=30)
        csv_out = await svc.export_reports_csv(days=30)

    serialized = json.dumps(report)

    # 1. No hardcoded values anywhere
    for forbidden in ("Jennifer", "Bharath", "Kirthika", "Data & Analytics", "BogusResumeSource", "Mallory", "Glassdoor", "Secret Role"):
        assert forbidden not in serialized
    assert report["kpis"]["applications"]["value"] == 6
    assert report["kpis"]["hired"]["value"] == 1
    assert report["kpis"]["jobs_opened"]["value"] == 2
    assert report["kpis"]["interviews"]["value"] == 2

    for point in report["hiring_trend"]:
        assert point["applications"] != 140
        assert point["hired"] != 10
    assert len(report["hiring_trend"]) == 6
    assert sum(p["applications"] for p in report["hiring_trend"]) == 6
    assert sum(p["hired"] for p in report["hiring_trend"]) == 1

    # 2. Source percentages add up to 100 (+/-0.5) and use heard_from (falling back to source)
    sources = {s["source"]: s for s in report["applications_by_source"]}
    assert set(sources.keys()) == {"LinkedIn", "Referral", "Naukri", "Careers page", "Company website"}
    assert sources["LinkedIn"]["count"] == 2
    assert sources["LinkedIn"]["color"] == "#0ea5e9"
    assert sources["Careers page"]["count"] == 1
    total_pct = sum(s["percentage"] for s in report["applications_by_source"])
    assert abs(total_pct - 100.0) <= 0.5
    assert all(s["percentage"] != 34.8 for s in report["applications_by_source"])

    # 3. Department rows match seeded data exactly
    assert report["hiring_by_department"] == [
        {"department": "Platform", "hired": 1, "openings": 2, "fill_rate": 50.0},
        {"department": "Sales", "hired": 0, "openings": 4, "fill_rate": 0.0},
    ]

    # 4. Recruiter rows match seeded data exactly (sorted by hired, then applications)
    assert report["recruiter_performance"] == [
        {
            "recruiter_id": "user-1",
            "recruiter_name": "Alice M",
            "applications": 4,
            "interviews": 1,
            "hired": 1,
            "hire_rate": 25.0,
        },
        {
            "recruiter_id": "user-2",
            "recruiter_name": "Carlos R",
            "applications": 2,
            "interviews": 1,
            "hired": 0,
            "hire_rate": 0.0,
        },
    ]

    # 5. CSV export matches computed values
    assert "Alice M" in csv_out
    assert "Platform" in csv_out
    assert "LinkedIn" in csv_out

    # 6. Filters (job_id, department, recruiter_id) apply to every section
    with company_scope("comp-a"):
        by_dept = await svc.get_recruitment_reports(days=30, department="Sales")
        assert by_dept["kpis"]["applications"]["value"] == 2
        assert by_dept["kpis"]["hired"]["value"] == 0
        assert [d["department"] for d in by_dept["hiring_by_department"]] == ["Sales"]
        assert [r["recruiter_name"] for r in by_dept["recruiter_performance"]] == ["Carlos R"]
        assert sum(p["applications"] for p in by_dept["hiring_trend"]) == 2
        assert sum(p["hired"] for p in by_dept["hiring_trend"]) == 0

        by_rec = await svc.get_recruitment_reports(days=30, recruiter_id="user-1")
        assert by_rec["kpis"]["applications"]["value"] == 4
        assert by_rec["kpis"]["hired"]["value"] == 1
        assert len(by_rec["recruiter_performance"]) == 1
        assert by_rec["recruiter_performance"][0]["recruiter_id"] == "user-1"

        by_job = await svc.get_recruitment_reports(days=30, job_id="job-2")
        assert by_job["kpis"]["applications"]["value"] == 2
        assert by_job["kpis"]["interviews"]["value"] == 1

    # 7. Empty company returns empty lists and zeros in trend
    with company_scope("comp-empty"):
        empty = await svc.get_recruitment_reports(days=30)
        assert empty["applications_by_source"] == []
        assert empty["hiring_by_department"] == []
        assert empty["recruiter_performance"] == []
        assert len(empty["hiring_trend"]) == 6
        assert all(m["applications"] == 0 and m["hired"] == 0 for m in empty["hiring_trend"])
        assert empty["kpis"]["applications"]["value"] == 0
        assert empty["kpis"]["hired"]["value"] == 0
        assert empty["kpis"]["time_to_hire"]["value_days"] == 0.0
