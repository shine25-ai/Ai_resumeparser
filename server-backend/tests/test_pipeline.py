"""
Tests for Phase 7: Recruitment Pipeline (SRS 4.11, Screen 14).

Covers:
- Default workflow seeding and per-job override
- Allowed transitions enforcement
- Rejection and withdrawal reason requirements
- Full 5-step transition sequence (Applied -> Screening -> Shortlisted -> Interview -> Selected -> Hired)
- Immutable application history writing (who/when/reason)
- hired_at set once on first hire
- Safe stage deletion with active candidate reassignment
- Multi-tenant company isolation
- Kanban board KPIs, funnel analytics, and vacancy progress
- Permissions enforcement (pipeline:view vs pipeline:edit)
"""

import pytest
from typing import Any, cast
from app.core.tenant import ScopedDatabase, set_company, company_scope
from app.core.dependencies import can
from app.core.permissions import DEFAULT_ROLE_PERMISSIONS
from app.services.pipeline_service import PipelineService
from app.utils.constants import (
    JOB_APPLICATIONS_COLLECTION,
    RESUMES_COLLECTION,
    JOB_OPENINGS_COLLECTION,
    WORKFLOWS_COLLECTION,
    APPLICATION_HISTORY_COLLECTION,
    INTERVIEWS_COLLECTION,
)
from app.services.job_management import JobManagementService
from tests.fake_mongo import FakeDatabase

pytestmark = pytest.mark.asyncio


@pytest.fixture
def fake_db():
    return FakeDatabase()


@pytest.fixture
def company_db(fake_db):
    set_company("comp-alpha")
    return ScopedDatabase(cast(Any, fake_db))


@pytest.fixture
def recruiter_user():
    return {
        "id": "recruiter-1",
        "full_name": "Priya Ramanan",
        "email": "priya@shinelogics.com",
        "role": "recruiter",
        "company_id": "comp-alpha",
        "permissions": DEFAULT_ROLE_PERMISSIONS.get("recruiter", []),
    }


@pytest.fixture
def viewer_user():
    return {
        "id": "viewer-1",
        "full_name": "Viewer Bob",
        "email": "bob@shinelogics.com",
        "role": "viewer",
        "company_id": "comp-alpha",
        "permissions": DEFAULT_ROLE_PERMISSIONS.get("viewer", []),
    }


async def test_default_workflow_seeding(company_db):
    """Accessing workflow when none exists seeds standard 8 stages."""
    svc = PipelineService(company_db)
    wf = await svc.get_workflow()
    assert wf is not None
    assert wf["is_default"] is True
    stages = wf["stages"]
    assert len(stages) == 8
    stage_ids = [s["id"] for s in stages]
    assert stage_ids == [
        "applied",
        "screening",
        "shortlisted",
        "interview",
        "selected",
        "hired",
        "rejected",
        "withdrawn",
    ]


async def test_job_override_wins(company_db, recruiter_user):
    """A per-job workflow override takes precedence over company default."""
    svc = PipelineService(company_db)
    # Default workflow
    default_wf = await svc.get_workflow()
    assert default_wf["is_default"] is True

    # Custom 3-stage workflow for Fast Track Job
    custom_stages = [
        {"id": "applied", "name": "Applied", "colour": "#6366f1", "type": "active", "allowed_transitions": ["interview"]},
        {"id": "interview", "name": "Interviewing", "colour": "#0ea5e9", "type": "active", "allowed_transitions": ["hired"]},
        {"id": "hired", "name": "Hired", "colour": "#059669", "type": "hired", "allowed_transitions": []},
    ]
    await svc.save_workflow(recruiter_user, {
        "job_id": "job-fast-track",
        "name": "Fast Track Workflow",
        "stages": custom_stages,
    })

    # Retrieve for specific job
    resolved_job_wf = await svc.get_workflow(job_id="job-fast-track")
    assert len(resolved_job_wf["stages"]) == 3
    assert resolved_job_wf["name"] == "Fast Track Workflow"

    # Default job still retrieves 8 stages
    resolved_default_wf = await svc.get_workflow()
    assert len(resolved_default_wf["stages"]) == 8


async def test_full_5_step_progression_history_and_hired_at(company_db, recruiter_user):
    """
    Acceptance Criteria:
    A candidate moved Applied -> Screening -> Shortlisted -> Interview -> Selected -> Hired
    shows 5 history entries with who/when; hired_at is set once and preserved.
    """
    svc = PipelineService(company_db)
    # Insert candidate application
    app_id = "app-cand-1"
    await company_db[JOB_APPLICATIONS_COLLECTION].insert_one({
        "id": app_id,
        "company_id": "comp-alpha",
        "job_id": "job-1001",
        "candidate_id": "cand-karthik",
        "candidate_name": "Karthik S",
        "stage_id": "applied",
        "stage_name": "Applied",
        "applied_at": "2026-11-20T10:00:00Z",
        "history": [],
    })

    # 1. Applied -> Screening
    step1 = await svc.move_candidate_stage(recruiter_user, app_id, "screening")
    assert step1["stage_id"] == "screening"
    assert step1.get("hired_at") is None

    # 2. Screening -> Shortlisted
    step2 = await svc.move_candidate_stage(recruiter_user, app_id, "shortlisted")
    assert step2["stage_id"] == "shortlisted"

    # 3. Shortlisted -> Interview
    step3 = await svc.move_candidate_stage(recruiter_user, app_id, "interview")
    assert step3["stage_id"] == "interview"

    # 4. Interview -> Selected
    step4 = await svc.move_candidate_stage(recruiter_user, app_id, "selected")
    assert step4["stage_id"] == "selected"
    assert step4.get("hired_at") is None

    # 5. Selected -> Hired
    step5 = await svc.move_candidate_stage(recruiter_user, app_id, "hired")
    assert step5["stage_id"] == "hired"
    first_hired_at = step5.get("hired_at")
    assert first_hired_at is not None

    # Check 5 history records in application_history collection
    history = await svc.get_application_history(app_id)
    assert len(history) == 5

    # Verify who and when on each step
    expected_transitions = [
        ("applied", "screening"),
        ("screening", "shortlisted"),
        ("shortlisted", "interview"),
        ("interview", "selected"),
        ("selected", "hired"),
    ]
    for idx, (expected_from, expected_to) in enumerate(expected_transitions):
        h = history[idx]
        assert h["from_stage"] == expected_from
        assert h["to_stage"] == expected_to
        assert h["by"] == "recruiter-1"
        assert h["by_name"] == "Priya Ramanan"
        assert h["at"] is not None

    # Verify hired_at is immutable (does not overwrite on further move)
    # Move Hired -> Withdrawn (allowed in default workflow)
    withdrawn = await svc.move_candidate_stage(recruiter_user, app_id, "withdrawn", reason="Candidate accepted competing offer")
    assert withdrawn["hired_at"] == first_hired_at


async def test_disallowed_transition_fails(company_db, recruiter_user):
    """Skipping stages not in allowed_transitions raises ValueError."""
    svc = PipelineService(company_db)
    app_id = "app-bad-move"
    await company_db[JOB_APPLICATIONS_COLLECTION].insert_one({
        "id": app_id,
        "company_id": "comp-alpha",
        "job_id": "job-1001",
        "stage_id": "applied",
        "candidate_name": "Ajay M",
    })

    # Direct jump from Applied -> Hired is not allowed
    with pytest.raises(ValueError) as exc:
        await svc.move_candidate_stage(recruiter_user, app_id, "hired")
    assert "not allowed" in str(exc.value)


async def test_rejection_and_withdrawal_require_reason(company_db, recruiter_user):
    """Moving to Rejected or Withdrawn without a reason fails."""
    svc = PipelineService(company_db)
    app_id = "app-reject-test"
    await company_db[JOB_APPLICATIONS_COLLECTION].insert_one({
        "id": app_id,
        "company_id": "comp-alpha",
        "job_id": "job-1001",
        "stage_id": "screening",
        "candidate_name": "Meena K",
    })

    # Without reason -> fails
    with pytest.raises(ValueError) as exc:
        await svc.move_candidate_stage(recruiter_user, app_id, "rejected", reason="")
    assert "reason is required" in str(exc.value).lower()

    # With reason -> succeeds
    updated = await svc.move_candidate_stage(recruiter_user, app_id, "rejected", reason="Skill Mismatch", comment="Needs more AWS depth")
    assert updated["stage_id"] == "rejected"
    assert updated["rejection_reason"] == "Skill Mismatch"
    assert updated["rejection_comment"] == "Needs more AWS depth"


async def test_delete_stage_safely_reassigns_candidates(company_db, recruiter_user):
    """Stage in use cannot be deleted without reassigning candidates."""
    svc = PipelineService(company_db)
    wf = await svc.get_workflow()
    wf_id = wf["id"]

    # Place candidate in "screening" stage
    app_id = "app-stuck"
    await company_db[JOB_APPLICATIONS_COLLECTION].insert_one({
        "id": app_id,
        "company_id": "comp-alpha",
        "stage_id": "screening",
    })

    # Attempt delete without reassign_to -> fails
    with pytest.raises(ValueError) as exc:
        await svc.delete_stage(recruiter_user, wf_id, "screening")
    assert "currently in use" in str(exc.value)

    # Delete with reassign_to_stage_id="applied" -> succeeds
    res = await svc.delete_stage(recruiter_user, wf_id, "screening", reassign_to_stage_id="applied")
    assert res["success"] is True
    assert res["reassigned_count"] == 1

    # Candidate was moved
    app = await company_db[JOB_APPLICATIONS_COLLECTION].find_one({"id": app_id})
    assert app["stage_id"] == "applied"


async def test_multi_tenant_isolation(fake_db, recruiter_user):
    """Company A cannot view or manipulate Company B's pipeline records."""
    # Insert in Company B
    with company_scope("comp-beta"):
        db_b = ScopedDatabase(fake_db)
        await db_b[JOB_APPLICATIONS_COLLECTION].insert_one({
            "id": "app-beta-cand",
            "company_id": "comp-beta",
            "stage_id": "applied",
            "candidate_name": "Beta Candidate",
        })

    # Company A should not see it in kanban
    with company_scope("comp-alpha"):
        db_a = ScopedDatabase(fake_db)
        svcA = PipelineService(db_a)
        kanban_a = await svcA.get_kanban_board(recruiter_user)
        assert kanban_a["kpis"]["total_candidates"] == 0

        # Company A cannot move Company B's candidate
        with pytest.raises(ValueError):
            await svcA.move_candidate_stage(recruiter_user, "app-beta-cand", "screening")


async def test_kanban_kpis_and_vacancies_progress(company_db, recruiter_user):
    """Kanban board computes 8 KPIs and vacancies filled gauge."""
    svc = PipelineService(company_db)

    # Job opening with 15 target vacancies
    await company_db[JOB_OPENINGS_COLLECTION].insert_one({
        "id": "JOB-1001",
        "title": "Senior Java Developer",
        "vacancies": 15,
        "target_vacancies": 15,
    })

    # Seed applications in different stages
    apps = [
        {"id": f"app-{i}", "opening_id": "JOB-1001", "stage_id": "applied", "candidate_name": f"Cand {i}"}
        for i in range(10)
    ] + [
        {"id": f"app-s-{i}", "opening_id": "JOB-1001", "stage_id": "screening", "candidate_name": f"Screen {i}"}
        for i in range(5)
    ] + [
        {"id": f"app-h-{i}", "opening_id": "JOB-1001", "stage_id": "hired", "hired_at": "2026-11-21T00:00:00Z", "candidate_name": f"Hired {i}"}
        for i in range(3)
    ]
    for a in apps:
        await company_db[JOB_APPLICATIONS_COLLECTION].insert_one(a)

    board = await svc.get_kanban_board(recruiter_user, job_id="JOB-1001")
    kpis = board["kpis"]
    assert kpis["total_candidates"] == 18
    assert kpis["screening"] == 5
    assert board["columns"][0]["count"] == 10  # Applied
    assert board["columns"][1]["count"] == 5   # Screening
    assert board["columns"][5]["count"] == 3   # Hired

    # Vacancies
    hiring_progress = board["hiring_progress"]
    assert hiring_progress["target_vacancies"] == 15
    assert hiring_progress["hired"] == 3
    assert hiring_progress["pending"] == 12


async def test_permissions_viewer_read_only(viewer_user, recruiter_user):
    """A Viewer role has pipeline:view but NOT pipeline:edit."""
    # Recruiter has both
    assert can(recruiter_user, "pipeline:view") is True
    assert can(recruiter_user, "pipeline:edit") is True

    # Viewer has view only
    assert can(viewer_user, "pipeline:view") is True
    assert can(viewer_user, "pipeline:edit") is False


async def test_kanban_unifies_resumes_without_applications(company_db, recruiter_user):
    """
    Candidates stored in resumes without job_applications records are seamlessly
    represented on the Kanban board with stages derived from interviews or manual_stage.
    """
    svc = PipelineService(company_db)

    # 1 resume with manual_stage "Selected"
    await company_db[RESUMES_COLLECTION].insert_one({
        "id": "res-1",
        "company_id": "comp-alpha",
        "candidate_id": "CND0101",
        "candidate_name": "Divya R",
        "manual_stage": "Selected",
        "redirect_id": None,
        "parsed_data": {"name": "Divya R", "email": "divya@example.com", "primary_skills": ["Java", "Spring Boot"]},
        "ai_evaluation": {"ai_technical_score": 84.0},
    })

    # 1 resume with interview verdict "Interviewing"
    await company_db[RESUMES_COLLECTION].insert_one({
        "id": "res-2",
        "company_id": "comp-alpha",
        "candidate_id": "CND0102",
        "candidate_name": "Aravind K",
        "redirect_id": None,
        "parsed_data": {"name": "Aravind K", "email": "aravind@example.com", "primary_skills": ["Python", "FastAPI"]},
    })
    await company_db[INTERVIEWS_COLLECTION].insert_one({
        "id": "inv-1",
        "company_id": "comp-alpha",
        "candidate_id": "res-2",
        "recommendation": "Need Further Evaluation",
        "status": "COMPLETED",
        "scheduled_date": "2026-11-20",
    })

    # 1 resume in Applied (no interviews, no manual_stage)
    await company_db[RESUMES_COLLECTION].insert_one({
        "id": "res-3",
        "company_id": "comp-alpha",
        "candidate_id": "CND0103",
        "candidate_name": "Karthik S",
        "redirect_id": None,
        "parsed_data": {"name": "Karthik S", "email": "karthik@example.com"},
    })

    board = await svc.get_kanban_board(recruiter_user)
    assert board["kpis"]["total_candidates"] == 3
    assert board["kpis"]["selected"] == 1
    assert board["kpis"]["interviewing"] == 1

    col_map = {col["id"]: col for col in board["columns"]}
    assert len(col_map["selected"]["cards"]) == 1
    assert col_map["selected"]["cards"][0]["candidate_name"] == "Divya R"
    assert col_map["selected"]["cards"][0]["rating"] == 4.2  # 84.0 / 20

    assert len(col_map["interview"]["cards"]) == 1
    assert col_map["interview"]["cards"][0]["candidate_name"] == "Aravind K"

    assert len(col_map["applied"]["cards"]) == 1
    assert col_map["applied"]["cards"][0]["candidate_name"] == "Karthik S"


async def test_moving_synthesized_candidate_creates_application_and_history(company_db, recruiter_user):
    """
    Moving a candidate who only exists in resumes collection creates an official
    job_applications record, records immutable history, and updates manual_stage on the resume.
    """
    svc = PipelineService(company_db)

    cand_id = "res-synth-cand"
    await company_db[RESUMES_COLLECTION].insert_one({
        "id": cand_id,
        "company_id": "comp-alpha",
        "candidate_id": "CND0999",
        "candidate_name": "Suresh R",
        "manual_stage": "Applied",
        "redirect_id": None,
        "parsed_data": {"name": "Suresh R", "email": "suresh@example.com"},
    })

    # Initially not in job_applications
    pre_app = await company_db[JOB_APPLICATIONS_COLLECTION].find_one({"id": cand_id})
    assert pre_app is None

    # Move from applied to screening
    updated = await svc.move_candidate_stage(recruiter_user, cand_id, "screening")
    assert updated["stage_id"] == "screening"

    # Now officially in job_applications collection
    post_app = await company_db[JOB_APPLICATIONS_COLLECTION].find_one({"id": cand_id})
    assert post_app is not None
    assert post_app["stage_id"] == "screening"
    assert post_app["candidate_name"] == "Suresh R"

    # History entry recorded
    history = await svc.get_application_history(cand_id)
    assert len(history) == 1
    assert history[0]["from_stage"] == "applied"
    assert history[0]["to_stage"] == "screening"
    assert history[0]["by"] == "recruiter-1"

    # Resume's manual_stage updated
    resume = await company_db[RESUMES_COLLECTION].find_one({"id": cand_id})
    assert resume["manual_stage"] == "Screening"


# ══════════════════════════════════════════════════════════════════════════════
# Explicit P7-01 to P7-10 Test Case Scenarios (Phase 7 Brief)
# ══════════════════════════════════════════════════════════════════════════════

async def test_p7_01_drag_applied_to_hired_directly_refused(company_db, recruiter_user):
    """P7-01: Drag a card Applied -> Hired directly. Refused if workflow doesn't allow it, with clear message."""
    svc = PipelineService(company_db)
    app_id = "app-p7-01"
    await company_db[JOB_APPLICATIONS_COLLECTION].insert_one({
        "id": app_id,
        "company_id": "comp-alpha",
        "candidate_id": "cand-p7-01",
        "candidate_name": "Direct Mover",
        "stage_id": "applied",
        "applied_at": "2026-11-20T10:00:00Z",
    })

    with pytest.raises(ValueError) as exc:
        await svc.move_candidate_stage(recruiter_user, app_id, "hired")
    assert "Transition from 'Applied' to 'Hired' is not allowed in this workflow." in str(exc.value)


async def test_p7_02_reject_without_reason_refused(company_db, recruiter_user):
    """P7-02: Reject without a reason. Asked for a reason; not moved until given."""
    svc = PipelineService(company_db)
    app_id = "app-p7-02"
    await company_db[JOB_APPLICATIONS_COLLECTION].insert_one({
        "id": app_id,
        "company_id": "comp-alpha",
        "candidate_id": "cand-p7-02",
        "candidate_name": "Candidate P702",
        "stage_id": "screening",
        "applied_at": "2026-11-20T10:00:00Z",
    })

    # Empty reason refused
    with pytest.raises(ValueError) as exc:
        await svc.move_candidate_stage(recruiter_user, app_id, "rejected", reason="")
    assert "reason is required" in str(exc.value).lower()

    # Whitespace reason refused
    with pytest.raises(ValueError) as exc:
        await svc.move_candidate_stage(recruiter_user, app_id, "rejected", reason="   ")
    assert "reason is required" in str(exc.value).lower()

    # Card remains unmoved in screening
    app_check = await company_db[JOB_APPLICATIONS_COLLECTION].find_one({"id": app_id})
    assert app_check["stage_id"] == "screening"

    # Moved only when reason is provided
    moved = await svc.move_candidate_stage(recruiter_user, app_id, "rejected", reason="Experience Gap", comment="Needs 3+ yrs React")
    assert moved["stage_id"] == "rejected"
    assert moved["rejection_reason"] == "Experience Gap"
    assert moved["rejection_comment"] == "Needs 3+ yrs React"


async def test_p7_03_move_through_all_stages_to_hired_history_and_vacancies(company_db, recruiter_user):
    """
    P7-03: Move through all stages to Hired.
    History has every step; job shows "1 of N filled"; time-to-hire appears on dashboards.
    """
    svc = PipelineService(company_db)

    job_id = "JOB-P7-03"
    await company_db[JOB_OPENINGS_COLLECTION].insert_one({
        "id": job_id,
        "title": "Lead Software Engineer",
        "vacancies": 3,
        "target_vacancies": 3,
        "open_positions": 3,
    })

    app_id = "app-p7-03"
    await company_db[JOB_APPLICATIONS_COLLECTION].insert_one({
        "id": app_id,
        "company_id": "comp-alpha",
        "job_id": job_id,
        "opening_id": job_id,
        "candidate_id": "cand-p7-03",
        "candidate_name": "Champion Candidate",
        "stage_id": "applied",
        "applied_at": "2026-11-15T09:00:00Z",
        "created_at": "2026-11-15T09:00:00Z",
    })

    # Step through all 5 progressive stages
    progression = ["screening", "shortlisted", "interview", "selected", "hired"]
    for next_stage in progression:
        await svc.move_candidate_stage(recruiter_user, app_id, next_stage)

    # 1. History has every step
    history = await svc.get_application_history(app_id)
    assert len(history) == 5
    for idx, (expected_from, expected_to) in enumerate([
        ("applied", "screening"),
        ("screening", "shortlisted"),
        ("shortlisted", "interview"),
        ("interview", "selected"),
        ("selected", "hired"),
    ]):
        assert history[idx]["from_stage"] == expected_from
        assert history[idx]["to_stage"] == expected_to
        assert history[idx]["by"] == "recruiter-1"
        assert history[idx]["at"] is not None

    # 2. Job shows "1 of N filled" (1 hired, 2 pending of 3 target vacancies)
    board = await svc.get_kanban_board(recruiter_user, job_id=job_id)
    hp = board["hiring_progress"]
    assert hp["target_vacancies"] == 3
    assert hp["hired"] == 1
    assert hp["pending"] == 2  # 1 of 3 filled

    # 3. Time-to-hire appears on dashboard stats
    job_svc = JobManagementService(company_db)
    stats = await job_svc.stats()
    assert stats["avg_days_to_hire"] is not None
    assert stats["avg_days_to_hire"] >= 0.0


async def test_p7_04_rename_screening_to_phone_screen_in_settings(company_db, recruiter_user):
    """
    P7-04: Rename 'Screening' to 'Phone screen' in settings.
    Board, filters and history labels update; existing cards stay in that column.
    """
    svc = PipelineService(company_db)

    # Candidate in screening
    app_id = "app-p7-04"
    await company_db[JOB_APPLICATIONS_COLLECTION].insert_one({
        "id": app_id,
        "company_id": "comp-alpha",
        "candidate_id": "cand-p7-04",
        "candidate_name": "Sita Ram",
        "stage_id": "screening",
        "applied_at": "2026-11-22T08:00:00Z",
    })

    # Get active workflow and rename screening
    wf = await svc.get_workflow()
    updated_stages = []
    for s in wf["stages"]:
        if s["id"] == "screening":
            updated_stages.append({**s, "name": "Phone screen"})
        else:
            updated_stages.append(s)

    await svc.save_workflow(recruiter_user, {
        "id": wf["id"],
        "name": wf["name"],
        "stages": updated_stages,
    })

    # Fetch Kanban board
    board = await svc.get_kanban_board(recruiter_user)
    screening_col = next(c for c in board["columns"] if c["id"] == "screening")
    assert screening_col["name"] == "Phone screen"
    assert screening_col["count"] == 1
    assert len(screening_col["cards"]) == 1

    # Existing card stays in that column and reflects the updated stage_name
    card = screening_col["cards"][0]
    assert card["id"] == app_id
    assert card["stage_id"] == "screening"
    assert card["stage_name"] == "Phone screen"


async def test_p7_05_delete_stage_with_cards_blocked_unless_reassigned(company_db, recruiter_user):
    """
    P7-05: Delete a stage that has cards.
    Blocked, with 'move all to…' offered.
    """
    svc = PipelineService(company_db)
    wf = await svc.get_workflow()
    wf_id = wf["id"]

    # Candidate currently in shortlisted
    app_id = "app-p7-05"
    await company_db[JOB_APPLICATIONS_COLLECTION].insert_one({
        "id": app_id,
        "company_id": "comp-alpha",
        "candidate_id": "cand-p7-05",
        "candidate_name": "Active Shortlist",
        "stage_id": "shortlisted",
    })

    # Delete without reassigning is blocked
    with pytest.raises(ValueError) as exc:
        await svc.delete_stage(recruiter_user, wf_id, "shortlisted")
    assert "currently in use by 1 application(s)" in str(exc.value)
    assert "specify a target stage to reassign candidates to" in str(exc.value)

    # Delete with reassign_to_stage_id="screening" succeeds
    res = await svc.delete_stage(recruiter_user, wf_id, "shortlisted", reassign_to_stage_id="screening")
    assert res["success"] is True
    assert res["reassigned_count"] == 1

    # Candidate moved safely to screening
    app_check = await company_db[JOB_APPLICATIONS_COLLECTION].find_one({"id": app_id})
    assert app_check["stage_id"] == "screening"

    # Stage removed from workflow
    wf_after = await svc.get_workflow()
    stage_ids_after = [s["id"] for s in wf_after["stages"]]
    assert "shortlisted" not in stage_ids_after


async def test_p7_06_per_job_workflow_extra_stage_shown_only_for_that_job(company_db, recruiter_user):
    """
    P7-06: Per-job workflow with an extra 'Assignment' stage.
    Only that job's board shows it.
    """
    svc = PipelineService(company_db)

    custom_job_id = "JOB-CUSTOM-ASSIGNMENT"
    custom_stages = [
        {"id": "applied", "name": "Applied", "colour": "#6366f1", "type": "active", "allowed_transitions": ["assignment"]},
        {"id": "assignment", "name": "Assignment", "colour": "#f59e0b", "type": "active", "allowed_transitions": ["interview"]},
        {"id": "interview", "name": "Interviewing", "colour": "#0ea5e9", "type": "active", "allowed_transitions": ["hired"]},
        {"id": "hired", "name": "Hired", "colour": "#059669", "type": "hired", "allowed_transitions": []},
    ]

    await svc.save_workflow(recruiter_user, {
        "job_id": custom_job_id,
        "name": "Engineering Workflow with Assignment",
        "stages": custom_stages,
    })

    # Board for custom job contains "Assignment"
    job_board = await svc.get_kanban_board(recruiter_user, job_id=custom_job_id)
    job_stage_ids = [c["id"] for c in job_board["columns"]]
    assert "assignment" in job_stage_ids
    assert len(job_stage_ids) == 4

    # Board for standard company workflow does NOT contain "Assignment"
    default_board = await svc.get_kanban_board(recruiter_user)
    default_stage_ids = [c["id"] for c in default_board["columns"]]
    assert "assignment" not in default_stage_ids
    assert len(default_stage_ids) == 8


async def test_p7_07_bulk_move_5_cards_to_shortlisted(company_db, recruiter_user):
    """
    P7-07: Bulk move 5 cards to Shortlisted.
    All 5 moved with 5 history entries.
    """
    svc = PipelineService(company_db)

    # Insert 5 applications in screening
    card_ids = [f"app-bulk-{i}" for i in range(1, 6)]
    for cid in card_ids:
        await company_db[JOB_APPLICATIONS_COLLECTION].insert_one({
            "id": cid,
            "company_id": "comp-alpha",
            "candidate_id": f"cand-{cid}",
            "candidate_name": f"Bulk Cand {cid}",
            "stage_id": "screening",
            "stage_name": "Screening",
            "applied_at": "2026-11-20T10:00:00Z",
        })

    # Bulk move all 5 to shortlisted
    res = await svc.bulk_move_stage(recruiter_user, card_ids, "shortlisted")
    assert res["success"] is True
    assert res["moved_count"] == 5
    assert res["failed_count"] == 0

    # Verify all 5 are in shortlisted
    for cid in card_ids:
        app = await company_db[JOB_APPLICATIONS_COLLECTION].find_one({"id": cid})
        assert app["stage_id"] == "shortlisted"

        # Verify history entry written
        history = await svc.get_application_history(cid)
        assert len(history) == 1
        assert history[0]["from_stage"] == "screening"
        assert history[0]["to_stage"] == "shortlisted"
        assert history[0]["by"] == "recruiter-1"


async def test_p7_08_company_b_board_isolated_from_company_a(fake_db, recruiter_user):
    """
    P7-08: Company B's board.
    Shows none of company A's candidates or stages.
    """
    # Company A data
    with company_scope("comp-alpha"):
        db_a = ScopedDatabase(fake_db)
        await db_a[JOB_APPLICATIONS_COLLECTION].insert_one({
            "id": "app-alpha-secret",
            "company_id": "comp-alpha",
            "candidate_name": "Alpha Confidential Candidate",
            "stage_id": "selected",
        })

    # Company B access
    with company_scope("comp-beta"):
        db_b = ScopedDatabase(fake_db)
        svc_b = PipelineService(db_b)
        user_b = {**recruiter_user, "company_id": "comp-beta", "id": "recruiter-beta"}

        # Board shows 0 candidates
        board_b = await svc_b.get_kanban_board(user_b)
        assert board_b["kpis"]["total_candidates"] == 0
        for col in board_b["columns"]:
            assert col["count"] == 0

        # Company B cannot move Company A's candidate
        with pytest.raises(ValueError):
            await svc_b.move_candidate_stage(user_b, "app-alpha-secret", "hired")


async def test_p7_09_viewer_and_interviewer_roles_permissions(viewer_user, recruiter_user):
    """
    P7-09: Viewer and Interviewer roles.
    Can see the board (if allowed) but cannot move cards; API returns 403.
    """
    interviewer_user = {
        "id": "interviewer-1",
        "full_name": "Interviewer Dan",
        "role": "interviewer",
        "company_id": "comp-alpha",
        "permissions": DEFAULT_ROLE_PERMISSIONS.get("interviewer", []),
    }

    # Recruiter has pipeline:view and pipeline:edit
    assert can(recruiter_user, "pipeline:view") is True
    assert can(recruiter_user, "pipeline:edit") is True

    # Viewer has pipeline:view but NOT pipeline:edit
    assert can(viewer_user, "pipeline:view") is True
    assert can(viewer_user, "pipeline:edit") is False

    # Interviewer does NOT have pipeline:edit
    assert can(interviewer_user, "pipeline:edit") is False


async def test_p7_10_keyboard_move_menu_payload_compatibility(company_db, recruiter_user):
    """
    P7-10: Use the 'Move to' menu with keyboard only.
    Works identically to drag-and-drop via the API move endpoint.
    """
    svc = PipelineService(company_db)
    app_id = "app-keyboard-nav"
    await company_db[JOB_APPLICATIONS_COLLECTION].insert_one({
        "id": app_id,
        "company_id": "comp-alpha",
        "candidate_id": "cand-karthik-kb",
        "candidate_name": "Karthik Keyboard",
        "stage_id": "applied",
        "stage_name": "Applied",
        "applied_at": "2026-11-23T11:00:00Z",
    })

    # Simulate keyboard menu selection: Move to Screening
    moved_step1 = await svc.move_candidate_stage(recruiter_user, app_id, "screening")
    assert moved_step1["stage_id"] == "screening"

    # Simulate keyboard menu selection: Move to Shortlisted
    moved_step2 = await svc.move_candidate_stage(recruiter_user, app_id, "shortlisted")
    assert moved_step2["stage_id"] == "shortlisted"

    # Verify history recorded
    hist = await svc.get_application_history(app_id)
    assert len(hist) == 2
    assert hist[0]["to_stage"] == "screening"
    assert hist[1]["to_stage"] == "shortlisted"


