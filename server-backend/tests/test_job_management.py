"""
Jobs (SRS 4.4): job codes, the job form, the status workflow with optional approval, history, duplicate,
templates and what the careers page shows.
"""

import pytest

from app.core.exceptions import AuthorizationError, BadRequestError, ConflictError
from app.core.permissions import DEFAULT_ROLE_PERMISSIONS, expand_permissions
from app.core.tenant import ScopedDatabase, company_scope
from app.services.job_management import JobManagementService, clean_job, experience_text, is_accepting
from tests.fake_mongo import FakeDatabase

ADMIN = {"id": "a1", "full_name": "Asha", "role": "admin"}


def _user(role: str) -> dict:
    return {"id": role, "full_name": role.title(), "role": role, "permissions": expand_permissions(DEFAULT_ROLE_PERMISSIONS[role])}


RECRUITER = _user("recruiter")
MANAGER = _user("hiring_manager")
VIEWER = _user("viewer")

FULL_JOB = {
    "title": "Senior Java Developer",
    "department": "Engineering",
    "work_mode": "Hybrid",
    "experience_min": 5, "experience_max": 8,
    "salary_min": 1800000, "salary_max": 2600000, "show_salary": True,
    "description": "Build payment services.",
    "primary_skills": ["Java", "Spring Boot", "java"],
    "secondary_skills": ["Docker"],
    "rounds": [{"name": "HR Screening", "duration_minutes": 30}, {"name": "Technical 1", "duration_minutes": 60}],
    "open_positions": 2,
}


@pytest.fixture
def jobs():
    raw = FakeDatabase()
    raw["companies"].docs.append({"id": "acme", "name": "Acme", "slug": "acme"})
    return JobManagementService(ScopedDatabase(raw))


def test_clean_job_normalises_and_validates():
    out = clean_job(FULL_JOB)
    assert out["primary_skills"] == ["Java", "Spring Boot"]          # repeats dropped
    assert out["required_skills"] == out["primary_skills"]           # careers page fields follow
    assert out["preferred_skills"] == ["Docker"]
    assert out["experience"] == "5-8 years"
    assert [r["order"] for r in out["rounds"]] == [1, 2]
    for bad in (
        {"title": ""},
        {"title": "x", "work_mode": "Moon"},
        {"title": "x", "salary_min": 10, "salary_max": 5},
        {"title": "x", "experience_min": 9, "experience_max": 2},
        {"title": "x", "closing_date": "31/12/2026"},
        {"title": "x", "notify_emails": ["nope"]},
        {"title": "x", "rounds": [{"name": "", "duration_minutes": 30}]},
        {"title": "x", "rounds": [{"name": "Long", "duration_minutes": 900}]},
    ):
        with pytest.raises(BadRequestError):
            clean_job(bad)


def test_experience_text():
    assert experience_text(None, None) == ""
    assert experience_text(3, None) == "3+ years"
    assert experience_text(0, 2) == "0-2 years"
    assert experience_text(2.5, 4) == "2.5-4 years"


@pytest.mark.asyncio
async def test_new_jobs_are_drafts_with_their_own_codes(jobs):
    with company_scope("acme"):
        a = await jobs.create(FULL_JOB, RECRUITER)
        b = await jobs.create({"title": "QA"}, RECRUITER)
    assert a["status"] == "DRAFT" and a["status_label"] == "Draft"
    assert (a["code"], b["code"]) == ("JOB-0001", "JOB-0002")
    assert a["status_history"][0]["note"] == "Created"


@pytest.mark.asyncio
async def test_publish_close_reopen_archive_restore(jobs):
    with company_scope("acme"):
        job = await jobs.create(FULL_JOB, RECRUITER)
        job = await jobs.act(job["id"], "publish", RECRUITER)
        assert job["status"] == "OPEN" and job["published_at"] and job["accepting"]
        job = await jobs.act(job["id"], "close", RECRUITER)
        assert job["status"] == "CLOSED" and job["closed_at"]
        job = await jobs.act(job["id"], "reopen", RECRUITER)
        assert job["status"] == "OPEN"
        with pytest.raises(ConflictError):
            await jobs.act(job["id"], "archive", ADMIN)  # a published job is closed first
        await jobs.act(job["id"], "close", ADMIN)
        job = await jobs.act(job["id"], "archive", ADMIN)
        assert job["status"] == "ARCHIVED"
        assert all(j["id"] != job["id"] for j in await jobs.list())          # hidden by default
        assert any(j["id"] == job["id"] for j in await jobs.list(include_archived=True))
        job = await jobs.act(job["id"], "restore", ADMIN)
        assert job["status"] == "DRAFT"
    assert [h["to"] for h in job["status_history"]] == ["DRAFT", "OPEN", "CLOSED", "OPEN", "CLOSED", "ARCHIVED", "DRAFT"]


@pytest.mark.asyncio
async def test_publishing_needs_a_description_and_skills(jobs):
    with company_scope("acme"):
        job = await jobs.create({"title": "Empty"}, RECRUITER)
        with pytest.raises(BadRequestError):
            await jobs.act(job["id"], "publish", RECRUITER)


@pytest.mark.asyncio
async def test_approval_flow(jobs):
    with company_scope("acme"):
        await jobs.save_settings(True)
        job = await jobs.create(FULL_JOB, RECRUITER)
        job = await jobs.act(job["id"], "publish", RECRUITER)        # becomes a request for approval
        assert job["status"] == "PENDING_APPROVAL"
        with pytest.raises(AuthorizationError):
            await jobs.act(job["id"], "approve", RECRUITER)            # recruiters can't approve
        with pytest.raises(BadRequestError):
            await jobs.act(job["id"], "reject", MANAGER)               # a reason is required
        job = await jobs.act(job["id"], "reject", MANAGER, "Add the salary band")
        assert job["status"] == "DRAFT" and job["status_history"][-1]["note"] == "Add the salary band"
        await jobs.act(job["id"], "publish", RECRUITER)
        job = await jobs.act(job["id"], "approve", MANAGER)
        assert job["status"] == "OPEN"
        # Someone who may approve publishes directly.
        other = await jobs.create(FULL_JOB, MANAGER)
        with pytest.raises(AuthorizationError):
            await jobs.act(other["id"], "publish", MANAGER)            # hiring managers can't publish


@pytest.mark.asyncio
async def test_viewers_cannot_change_jobs(jobs):
    with company_scope("acme"):
        job = await jobs.create(FULL_JOB, RECRUITER)
        with pytest.raises(AuthorizationError):
            await jobs.act(job["id"], "publish", VIEWER)


@pytest.mark.asyncio
async def test_edit_routes_old_status_changes_through_the_workflow(jobs):
    with company_scope("acme"):
        job = await jobs.create(FULL_JOB, RECRUITER)
        job = await jobs.update(job["id"], {"status": "OPEN", "open_positions": 3}, RECRUITER)
        assert job["status"] == "OPEN" and job["open_positions"] == 3
        job = await jobs.update(job["id"], {"status": "CLOSED"}, RECRUITER)
        assert job["status"] == "CLOSED"


@pytest.mark.asyncio
async def test_duplicate_and_templates(jobs):
    with company_scope("acme"):
        job = await jobs.act((await jobs.create(FULL_JOB, RECRUITER))["id"], "publish", RECRUITER)
        copy = await jobs.duplicate(job["id"], RECRUITER)
        assert copy["title"] == "Copy of Senior Java Developer" and copy["status"] == "DRAFT"
        assert copy["code"] != job["code"] and copy["primary_skills"] == job["primary_skills"]

        tpl = await jobs.save_template("Java role", {}, RECRUITER, from_job=job["id"])
        assert tpl["job"]["rounds"] == job["rounds"]
        with pytest.raises(ConflictError):
            await jobs.save_template("Java role", {"title": "x"}, RECRUITER)
        assert [t["name"] for t in await jobs.list_templates()] == ["Java role"]
        await jobs.delete_template(tpl["id"])
        assert await jobs.list_templates() == []


def test_is_accepting():
    base = {"status": "OPEN", "open_positions": 1, "accept_applications": True}
    assert is_accepting(base)
    assert not is_accepting({**base, "status": "DRAFT"})
    assert not is_accepting({**base, "open_positions": 0})
    assert not is_accepting({**base, "accept_applications": False})
    assert not is_accepting({**base, "closing_date": "2026-01-01"}, today="2026-11-23")
    assert is_accepting({**base, "closing_date": "2026-11-23"}, today="2026-11-23")
