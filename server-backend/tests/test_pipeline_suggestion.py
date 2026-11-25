"""
Pipeline stage suggestion (Phase 8 step 4): the rules, and a check that nothing is ever written.
"""

import pytest

from app.services.evaluation_service import stage_suggestion
from app.utils.pipeline_suggestion import suggest_next_stage


def _round(number, verdict, status="COMPLETED", when="2026-11-01", cancelled=False):
    return {
        "round_number": number,
        "status": "CANCELLED" if cancelled else status,
        "recommendation": verdict,
        "scheduled_date": when,
        "scheduled_time": "10:00",
    }


def test_all_rounds_passed_suggests_offer():
    interviews = [_round(1, "Selected"), _round(2, "Selected")]
    result = suggest_next_stage(2, interviews, current_stage="Interviewing")
    assert result == {"stage": "Offer", "reason": "All 2 round(s) passed"}


def test_any_rejected_round_suggests_closed():
    interviews = [_round(1, "Selected"), _round(2, "Rejected")]
    assert suggest_next_stage(2, interviews, "Interviewing")["stage"] == "Closed"


def test_a_round_still_missing_gives_no_suggestion():
    interviews = [_round(1, "Selected")]
    assert suggest_next_stage(2, interviews, "Interviewing") is None


def test_on_hold_or_pending_needs_a_person_so_no_suggestion():
    assert suggest_next_stage(2, [_round(1, "Selected"), _round(2, "On Hold")], "Interviewing") is None
    assert suggest_next_stage(1, [_round(1, "Pending")], "Interviewing") is None


def test_cancelled_or_scheduled_interviews_do_not_count():
    interviews = [_round(1, "Selected"), _round(2, "Selected", status="SCHEDULED")]
    assert suggest_next_stage(2, interviews, "Interviewing") is None
    interviews = [_round(1, "Selected"), _round(2, "Selected", cancelled=True)]
    assert suggest_next_stage(2, interviews, "Interviewing") is None


def test_latest_completed_interview_for_a_round_wins():
    interviews = [
        _round(1, "Rejected", when="2026-11-01"),
        _round(1, "Selected", when="2026-11-05"),  # re-interviewed and passed
    ]
    assert suggest_next_stage(1, interviews, "Interviewing")["stage"] == "Offer"


def test_no_suggestion_when_already_at_or_past_the_stage():
    interviews = [_round(1, "Selected")]
    assert suggest_next_stage(1, interviews, "Offer") is None
    assert suggest_next_stage(1, interviews, "Hired") is None


def test_job_with_no_rounds_never_suggests():
    assert suggest_next_stage(0, [_round(1, "Selected")], "Interviewing") is None


class _ReadOnlyRepo:
    """Only reads are allowed. Any write attempt raises, proving the suggestion never moves a candidate."""

    def __init__(self, docs=None):
        self.docs = docs or []

    async def get_by_id(self, _id):
        return self.docs[0] if self.docs else None

    async def find_many(self, query=None, limit=100, **_):
        return [d for d in self.docs if d.get("candidate_id") == (query or {}).get("candidate_id", d.get("candidate_id"))]

    def __getattr__(self, name):
        if name in {"create", "update", "delete", "update_one", "insert_one"}:
            raise AssertionError(f"stage suggestion must not write ({name})")
        raise AttributeError(name)


@pytest.mark.asyncio
async def test_service_suggests_offer_from_job_rounds_and_writes_nothing():
    job = {"id": "job-1", "rounds": [{"order": 1}, {"order": 2}]}
    interviews = [
        {**_round(1, "Selected"), "candidate_id": "c-1", "job_id": "job-1"},
        {**_round(2, "Selected"), "candidate_id": "c-1", "job_id": "job-1"},
    ]
    jobs = _ReadOnlyRepo([job])
    interview_repo = _ReadOnlyRepo(interviews)
    result = await stage_suggestion(interview_repo, jobs, "c-1", "job-1")
    assert result["stage"] == "Offer"


@pytest.mark.asyncio
async def test_service_reports_missing_job():
    from app.core.exceptions import NotFoundError

    with pytest.raises(NotFoundError):
        await stage_suggestion(_ReadOnlyRepo([]), _ReadOnlyRepo([]), "c-1", "nope")
