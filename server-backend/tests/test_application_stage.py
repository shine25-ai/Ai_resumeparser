"""
The Applications screen shows each application's pipeline stage (Phase 7) and can filter by it.
Applications sent before the pipeline have no stage_id: they count as "Applied".
"""

import pytest

from app.services.application_service import ApplicationService, stage_of
from app.services.pipeline_service import PipelineService
from tests.fake_mongo import FakeDatabase

USER = {"id": "u1", "full_name": "Recruiter", "email": "r@a.com", "role": "admin"}


def _app(aid, **extra):
    return {
        "id": aid, "opening_id": "job1", "opening_title": "Engineer", "applicant_email": f"{aid}@mail.com",
        "submitted_at": f"2026-11-2{aid[-1]}T10:00:00+00:00", "resume_id": f"r-{aid}", **extra,
    }


def test_stage_of_older_and_moved_applications():
    assert stage_of({"stage": "APPLIED"}) == {"stage_id": "applied", "stage_name": "Applied"}
    assert stage_of({}) == {"stage_id": "applied", "stage_name": "Applied"}
    assert stage_of({"stage": "Screening", "stage_id": "screening", "stage_name": "Screening"}) == {
        "stage_id": "screening", "stage_name": "Screening"}


@pytest.mark.asyncio
async def test_list_shows_and_filters_by_stage():
    db = FakeDatabase()
    await db["job_applications"].insert_one(_app("a1", stage="APPLIED"))                 # sent before Phase 7
    await db["job_applications"].insert_one(_app("a2", stage="APPLIED", stage_id="applied"))
    await db["job_applications"].insert_one(_app("a3", stage="APPLIED", stage_id="applied"))
    svc = ApplicationService(db, resume_service=object())

    # A pipeline move shows on the Applications list
    await PipelineService(db).move_candidate_stage(USER, "a3", "screening")
    rows = {r["id"]: r for r in (await svc.list())["items"]}
    assert rows["a1"]["stage_id"] == "applied" and rows["a1"]["stage_name"] == "Applied"
    assert rows["a3"]["stage_id"] == "screening" and rows["a3"]["stage_name"] == "Screening"

    applied = await svc.list(stage="applied")
    assert {r["id"] for r in applied["items"]} == {"a1", "a2"} and applied["total"] == 2
    screening = await svc.list(stage="screening", q="a3@")
    assert [r["id"] for r in screening["items"]] == ["a3"]
    assert (await svc.list(stage="hired"))["total"] == 0

    # The move is in the application's history for the detail panel
    detail = await svc.get("a3")
    moved = [h for h in detail["history"] if h.get("action") == "stage_moved"]
    assert moved and moved[-1]["to_stage_name"] == "Screening" and moved[-1]["by_name"] == "Recruiter"
