"""
Job match % on lists (Phase 9) and the in-app notifications from the plan (Phase 11):
new application, job approval needed, interview scheduled / changed / cancelled, evaluation due.
"""

from datetime import datetime, timezone

import pytest

from app.core.permissions import DEFAULT_ROLE_PERMISSIONS
from app.core.tenant import ScopedDatabase, company_scope
from app.services.application_service import ApplicationService
from app.services.interview_reminders import run_evaluation_due_pass
from app.services.interview_service import InterviewService
from app.services.job_management import JobManagementService
from app.services.notification_service import NotificationService
from app.services.skill_intelligence_service import job_matches, score_job_match
from tests.fake_mongo import FakeDatabase

CO = "acme"


def _staff(raw):
    """Admin, a hiring manager (can approve jobs, edit candidates), a recruiter and a viewer, with built-in roles."""
    for slug in ("hiring_manager", "recruiter", "viewer"):
        raw["roles"].docs.append({"id": f"role-{slug}", "slug": slug, "name": slug, "permissions": DEFAULT_ROLE_PERMISSIONS[slug]})
    for uid, role in (("u-admin", "admin"), ("u-mgr", "hiring_manager"), ("u-rec", "recruiter"), ("u-view", "viewer")):
        raw["users"].docs.append({"id": uid, "email": f"{uid}@acme.com", "full_name": uid, "role": role, "company_id": CO, "is_active": True})
    raw["users"].docs.append({"id": "u-other", "email": "o@globex.com", "role": "admin", "company_id": "globex", "is_active": True})


def _inbox(raw, title):
    return sorted(n["user_id"] for n in raw["notifications"].docs if n["title"] == title)


# ── Job match ───────────────────────────────────────────────────────────────


def test_score_weights_primary_70_and_secondary_30():
    job = {"primary_skills": ["Java", "Spring Boot"], "secondary_skills": ["Docker", "Kafka"]}
    m = score_job_match(job, [{"skill_name": "Java"}, {"skill_name": "Docker"}])
    assert m["primary_match_pct"] == 50.0 and m["secondary_match_pct"] == 50.0
    assert m["overall_match_pct"] == 50.0
    assert m["gaps"] == ["Spring Boot", "Apache Kafka"]              # primary gaps first, names from the skill master
    full = score_job_match(job, [{"skill_name": s} for s in ("Java", "Spring Boot")])
    assert full["overall_match_pct"] == 70.0                         # all primary, no secondary
    only_primary = score_job_match({"primary_skills": ["Java"]}, [{"skill_name": "Java"}])
    assert only_primary["overall_match_pct"] == 100.0


def test_a_job_without_skills_has_no_score():
    m = score_job_match({"primary_skills": [], "secondary_skills": []}, [{"skill_name": "Java"}])
    assert m["overall_match_pct"] is None and m["summary_label"] == "No skills listed on the job"


@pytest.mark.asyncio
async def test_batch_matches_and_applications_list():
    raw = FakeDatabase()
    db = ScopedDatabase(raw)
    with company_scope(CO):
        await db["job_openings"].insert_one({"id": "j1", "title": "Java Dev", "primary_skills": ["Java", "SQL"], "secondary_skills": ["AWS"]})
        await db["job_openings"].insert_one({"id": "j2", "title": "Empty", "primary_skills": []})
        await db["candidate_skills"].insert_one({"id": "s1", "candidate_id": "c1", "skill_name": "Java"})
        await db["candidate_skills"].insert_one({"id": "s2", "candidate_id": "c1", "skill_name": "AWS"})
        found = await job_matches(db, [("c1", "j1"), ("c1", "j2"), ("c2", "j1"), (None, "j1")])
        assert set(found) == {("c1", "j1")}                           # no skills / no job skills / no id: no score
        assert found[("c1", "j1")]["pct"] == 65.0 and found[("c1", "j1")]["gaps"] == ["SQL"]

        base = {"opening_title": "Java Dev", "applicant_email": "a@x.com", "submitted_at": "2026-11-25T10:00:00+00:00"}
        await db["job_applications"].insert_one({**base, "id": "a1", "opening_id": "j1", "resume_id": "r1", "candidate_id": "c1"})
        await db["job_applications"].insert_one({**base, "id": "a2", "opening_id": "j1", "resume_id": "r2", "candidate_id": "c2"})
        svc = ApplicationService(db, resume_service=object())
        rows = {r["id"]: r for r in (await svc.list())["items"]}
        assert rows["a1"]["match"]["pct"] == 65.0
        assert rows["a2"]["match"] is None
        assert (await svc.get("a1"))["match"]["gaps"] == ["SQL"]


# ── Notifications ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_notify_permission_reaches_only_staff_who_may_do_it():
    raw = FakeDatabase()
    _staff(raw)
    db = ScopedDatabase(raw)
    with company_scope(CO):
        await NotificationService(db).notify_permission("jobs:approve", "Check", "msg", exclude_user_ids=["u-mgr"])
        await NotificationService(db).notify_permission("candidates:edit", "Apps", "msg")
    assert _inbox(raw, "Check") == ["u-admin"]                       # manager excluded, recruiter/viewer can't approve
    assert _inbox(raw, "Apps") == ["u-admin", "u-rec"]               # hiring managers and viewers can't edit candidates; never another company
    assert all(n["company_id"] == CO for n in raw["notifications"].docs)


@pytest.mark.asyncio
async def test_job_sent_for_approval_notifies_approvers():
    raw = FakeDatabase()
    _staff(raw)
    raw["companies"].docs.append({"id": CO, "name": "Acme", "slug": "acme"})
    jobs = JobManagementService(ScopedDatabase(raw))
    recruiter = {"id": "u-rec", "full_name": "Ravi", "role": "recruiter",
                 "permissions": ["jobs:create", "jobs:edit", "jobs:publish", "jobs:view"]}
    with company_scope(CO):
        await jobs.save_settings(True)
        job = await jobs.create({"title": "Java Dev", "description": "Build things.", "primary_skills": ["Java"]}, recruiter)
        job = await jobs.act(job["id"], "publish", recruiter)
    assert job["status"] == "PENDING_APPROVAL"
    assert _inbox(raw, "Job approval needed") == ["u-admin", "u-mgr"]
    note = next(n for n in raw["notifications"].docs if n["title"] == "Job approval needed")
    assert "Ravi sent" in note["message"] and note["link"] == f"/job-openings?jobId={job['id']}"


class _Repo:
    """Just enough of the interview repository for the notification helper."""

    def __init__(self, db):
        self.db = db


@pytest.mark.asyncio
async def test_interview_changes_notify_the_interviewers_but_not_the_actor():
    raw = FakeDatabase()
    _staff(raw)
    service = InterviewService.__new__(InterviewService)
    service.interview_repo = _Repo(ScopedDatabase(raw))
    interview = {"id": "iv1", "company_id": CO, "candidate_name": "Priya", "job_title": "Java Dev",
                 "scheduled_date": "2026-12-01", "scheduled_time": "10:00",
                 "interviewer_id": "u-mgr", "interviewers": [{"interviewer_id": "u-rec"}]}
    with company_scope(CO):
        await service._notify_interviewers(interview, "scheduled", actor_id="u-admin")
        await service._notify_interviewers(interview, "cancelled", actor_id="u-mgr")
    assert _inbox(raw, "Interview scheduled") == ["u-mgr", "u-rec"]
    assert _inbox(raw, "Interview cancelled") == ["u-rec"]
    msg = next(n["message"] for n in raw["notifications"].docs if n["title"] == "Interview scheduled")
    assert msg == "Interview with Priya for Java Dev on 2026-12-01 10:00."


@pytest.mark.asyncio
async def test_evaluation_due_goes_once_to_interviewers_who_have_not_submitted():
    raw = FakeDatabase()
    _staff(raw)
    base = {"company_id": CO, "candidate_name": "Priya", "job_title": "Java Dev", "timezone": "Asia/Kolkata",
            "duration_minutes": 60, "status": "SCHEDULED", "interviewer_id": "u-mgr", "interviewers": [{"interviewer_id": "u-rec"}]}
    raw["interviews"].docs += [
        {**base, "id": "done", "scheduled_date": "2026-11-25", "scheduled_time": "10:00"},     # ended 05:30 UTC
        {**base, "id": "later", "scheduled_date": "2026-11-25", "scheduled_time": "18:00"},    # not over yet
        {**base, "id": "off", "scheduled_date": "2026-11-25", "scheduled_time": "09:00", "status": "CANCELLED"},
        {**base, "id": "old", "scheduled_date": "2026-11-01", "scheduled_time": "10:00"},      # before the window
    ]
    raw["interview_evaluations"].docs.append(
        {"id": "e1", "company_id": CO, "interview_id": "done", "interviewer_user_id": "u-mgr", "status": "SUBMITTED"})
    now = datetime(2026, 11, 25, 8, 0, tzinfo=timezone.utc)

    assert await run_evaluation_due_pass(raw, now) == 1
    assert _inbox(raw, "Evaluation due") == ["u-rec"]                # u-mgr already submitted
    assert await run_evaluation_due_pass(raw, now) == 0              # once only
    assert next(i for i in raw["interviews"].docs if i["id"] == "done")["evaluation_due_notified"] is True
