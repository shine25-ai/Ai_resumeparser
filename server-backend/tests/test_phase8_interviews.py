"""
Phase 8 tests: scheduling conflicts, timezone and DST handling, .ics content, score maths, and
evaluation permissions and locking. Pure logic plus in-memory repositories, so no MongoDB is needed.
"""

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from app.core.exceptions import AuthorizationError, BadRequestError, ConflictError
from app.services.evaluation_service import EvaluationService
from app.utils.evaluation_scoring import panel_summary, score_evaluation, validate_ratings
from app.utils.interview_scheduling import build_ics, find_conflicts, to_utc_range


# ── Fakes ──────────────────────────────────────────────────────────────────


def _matches(doc, query):
    for key, cond in (query or {}).items():
        value = doc.get(key)
        if isinstance(cond, dict) and "$in" in cond:
            if value not in cond["$in"]:
                return False
        elif value != cond:
            return False
    return True


class FakeRepo:
    def __init__(self, docs=None):
        self.docs = {d["id"]: dict(d) for d in (docs or [])}

    async def create(self, doc):
        self.docs[doc["id"]] = dict(doc)
        return dict(doc)

    async def get_by_id(self, id_val):
        doc = self.docs.get(id_val)
        return dict(doc) if doc else None

    async def find_one(self, query):
        for doc in self.docs.values():
            if _matches(doc, query):
                return dict(doc)
        return None

    async def find_many(self, query=None, limit=100, sort=None, **_):
        return [dict(d) for d in self.docs.values() if _matches(d, query)][:limit]

    async def update(self, id_val, data):
        self.docs[id_val].update(data)
        return dict(self.docs[id_val])

    async def delete(self, id_val):
        return self.docs.pop(id_val, None) is not None


ADMIN = {"id": "admin-1", "role": "admin", "full_name": "Asha Admin"}
ALICE = {"id": "u-alice", "role": "interviewer", "full_name": "Alice"}
BOB = {"id": "u-bob", "role": "interviewer", "full_name": "Bob"}
CAROL = {"id": "u-carol", "role": "interviewer", "full_name": "Carol"}

CRITERIA = [
    {"id": "tech", "label": "Technical", "weight": 50},
    {"id": "comm", "label": "Communication", "weight": 30},
    {"id": "culture", "label": "Culture", "weight": 20},
]


def _interview(interview_id="iv-1", **overrides):
    base = {
        "id": interview_id,
        "candidate_name": "Dev",
        "candidate_email": "dev@example.com",
        "job_id": "job-1",
        "job_title": "Backend Engineer",
        "round_number": 2,
        "scheduled_date": "2026-12-01",
        "scheduled_time": "10:00",
        "timezone": "Asia/Kolkata",
        "duration_minutes": 60,
        "status": "SCHEDULED",
        "interviewer_id": ALICE["id"],
        "interviewer_name": "Alice",
        "interviewer_email": "alice@example.com",
        "interviewers": [
            {"interviewer_id": BOB["id"], "interviewer_name": "Bob", "interviewer_email": "bob@example.com"},
            {"interviewer_id": CAROL["id"], "interviewer_name": "Carol", "interviewer_email": "carol@example.com"},
        ],
        "reschedule_history": [],
    }
    base.update(overrides)
    return base


def _form(form_id="form-default", job_id=None, round_number=None, criteria=None):
    return {
        "id": form_id,
        "name": "Default",
        "job_id": job_id,
        "round_number": round_number,
        "scale_max": 5,
        "criteria": criteria or CRITERIA,
        "created_at": "2026-01-01T00:00:00+00:00",
    }


def _service(interviews=None, forms=None, evaluations=None):
    return EvaluationService(
        panels=FakeRepo(),
        forms=FakeRepo(forms or [_form()]),
        evaluations=FakeRepo(evaluations or []),
        interviews=FakeRepo(interviews or [_interview()]),
    )


# ── Time ranges and DST ────────────────────────────────────────────────────


def test_ist_slot_converts_to_utc():
    start, end = to_utc_range("2026-12-01", "10:00", "Asia/Kolkata", 60)
    assert start == datetime(2026, 12, 1, 4, 30, tzinfo=timezone.utc)
    assert end == datetime(2026, 12, 1, 5, 30, tzinfo=timezone.utc)


def test_late_night_ist_slot_keeps_the_same_utc_day_and_time():
    # 23:30 IST is 18:00 UTC on the same date, so viewers in other zones see the right local time.
    start, _ = to_utc_range("2026-12-01", "23:30", "Asia/Kolkata", 60)
    assert start == datetime(2026, 12, 1, 18, 0, tzinfo=timezone.utc)


def test_us_eastern_dst_is_applied_by_date():
    # US clocks spring forward on 2026-03-08. 09:00 New York is UTC-4 after the change, UTC-5 before it.
    winter, _ = to_utc_range("2026-03-07", "09:00", "America/New_York", 30)
    summer, _ = to_utc_range("2026-03-09", "09:00", "America/New_York", 30)
    assert winter == datetime(2026, 3, 7, 14, 0, tzinfo=timezone.utc)
    assert summer == datetime(2026, 3, 9, 13, 0, tzinfo=timezone.utc)


def test_nonexistent_dst_gap_time_is_rejected():
    # 02:30 on 2026-03-08 does not exist in New York (clocks jump from 02:00 to 03:00).
    with pytest.raises(ValueError, match="DST gap"):
        to_utc_range("2026-03-08", "02:30", "America/New_York", 30)


def test_unknown_timezone_and_bad_input_are_rejected():
    with pytest.raises(ValueError, match="Unknown timezone"):
        to_utc_range("2026-12-01", "10:00", "Mars/Olympus", 60)
    with pytest.raises(ValueError):
        to_utc_range("01-12-2026", "10:00", "Asia/Kolkata", 60)
    with pytest.raises(ValueError):
        to_utc_range("2026-12-01", "10:00", "Asia/Kolkata", 0)


# ── Conflicts ──────────────────────────────────────────────────────────────


def _slot(name, start_h, end_h):
    return {
        "interview_id": name,
        "start": datetime(2026, 12, 1, start_h, tzinfo=timezone.utc),
        "end": datetime(2026, 12, 1, end_h, tzinfo=timezone.utc),
    }


def test_overlapping_interview_is_named_in_the_conflict():
    busy = [_slot("iv-busy", 10, 11)]
    clashes = find_conflicts(
        datetime(2026, 12, 1, 10, 30, tzinfo=timezone.utc),
        datetime(2026, 12, 1, 11, 30, tzinfo=timezone.utc),
        busy,
    )
    assert [c["interview_id"] for c in clashes] == ["iv-busy"]


def test_back_to_back_interviews_do_not_clash():
    busy = [_slot("iv-before", 9, 10)]
    clashes = find_conflicts(
        datetime(2026, 12, 1, 10, 0, tzinfo=timezone.utc),
        datetime(2026, 12, 1, 11, 0, tzinfo=timezone.utc),
        busy,
    )
    assert clashes == []


@pytest.mark.asyncio
async def test_conflict_check_finds_busy_interviewer_across_timezones():
    # Busy interview at 10:00 IST (04:30 UTC). Checking 10:30 IST for the same interviewer is a clash.
    busy = _interview("iv-busy", scheduled_time="10:00", candidate_name="Existing")
    service = _service(interviews=[busy])
    clashes = await service.check_conflicts(
        interviewer_ids=[ALICE["id"]],
        scheduled_date="2026-12-01",
        scheduled_time="10:30",
        timezone_name="Asia/Kolkata",
        duration_minutes=60,
    )
    assert [c["interview_id"] for c in clashes] == ["iv-busy"]


@pytest.mark.asyncio
async def test_conflict_check_ignores_cancelled_and_excluded_interviews():
    cancelled = _interview("iv-cancelled", status="CANCELLED")
    self_ = _interview("iv-self")
    service = _service(interviews=[cancelled, self_])
    clashes = await service.check_conflicts(
        interviewer_ids=[ALICE["id"]],
        scheduled_date="2026-12-01",
        scheduled_time="10:00",
        exclude_interview_id="iv-self",
    )
    assert clashes == []


# ── .ics invite ────────────────────────────────────────────────────────────


def test_ics_is_utc_and_names_every_attendee():
    start, end = to_utc_range("2026-12-01", "10:00", "Asia/Kolkata", 60)
    ics = build_ics(
        uid="iv-1@hirelogics",
        start_utc=start,
        end_utc=end,
        summary="Interview: Dev, Backend, comma; semicolon",
        attendee_emails=["dev@example.com", "alice@example.com"],
        dtstamp=datetime(2026, 11, 24, tzinfo=timezone.utc),
    )
    assert "BEGIN:VCALENDAR\r\n" in ics and ics.endswith("END:VCALENDAR\r\n")
    assert "DTSTART:20261201T043000Z" in ics
    assert "DTEND:20261201T053000Z" in ics
    assert "SUMMARY:Interview: Dev\\, Backend\\, comma\\; semicolon" in ics
    assert ics.count("ATTENDEE;") == 2
    assert "METHOD:REQUEST" in ics and "STATUS:CONFIRMED" in ics


def test_cancelled_ics_is_marked_cancelled_and_sequence_increments():
    start, end = to_utc_range("2026-12-01", "10:00", "Asia/Kolkata", 60)
    ics = build_ics(uid="x", start_utc=start, end_utc=end, summary="s", sequence=2, cancelled=True)
    assert "METHOD:CANCEL" in ics
    assert "STATUS:CANCELLED" in ics
    assert "SEQUENCE:2" in ics


def test_ics_rejects_naive_datetimes_and_empty_ranges():
    start, end = to_utc_range("2026-12-01", "10:00", "Asia/Kolkata", 60)
    with pytest.raises(ValueError):
        build_ics(uid="x", start_utc=start.replace(tzinfo=None), end_utc=end, summary="s")
    with pytest.raises(ValueError):
        build_ics(uid="x", start_utc=end, end_utc=start, summary="s")


def test_long_ics_lines_are_folded_at_75_octets():
    start, end = to_utc_range("2026-12-01", "10:00", "Asia/Kolkata", 60)
    ics = build_ics(uid="x", start_utc=start, end_utc=end, summary="A" * 200)
    for line in ics.split("\r\n"):
        assert len(line.encode("utf-8")) <= 75


# ── Score maths ────────────────────────────────────────────────────────────


def test_weighted_score_matches_hand_calculation():
    # Weights 50/30/20, ratings 4/3/5: 0.5*4 + 0.3*3 + 0.2*5 = 3.9
    score = score_evaluation({"tech": 4, "comm": 3, "culture": 5}, CRITERIA)
    assert score == 3.9


def test_unweighted_criteria_give_a_plain_average():
    criteria = [{"id": "a"}, {"id": "b"}]
    assert score_evaluation({"a": 4, "b": 5}, criteria) == 4.5


def test_missing_rating_or_zero_weights_are_refused():
    with pytest.raises(ValueError, match="Missing rating"):
        score_evaluation({"tech": 4}, CRITERIA)
    with pytest.raises(ValueError, match="more than zero"):
        score_evaluation({"a": 4}, [{"id": "a", "weight": 0}])


def test_ratings_outside_scale_or_for_unknown_criteria_are_refused():
    with pytest.raises(ValueError, match="between 1 and 5"):
        validate_ratings({"tech": 6}, CRITERIA, 5)
    with pytest.raises(ValueError, match="Unknown criteria"):
        validate_ratings({"nope": 3}, CRITERIA, 5)


def test_panel_summary_counts_only_submitted_and_reports_the_label():
    records = [
        {"status": "SUBMITTED", "score": 3.9},
        {"status": "SUBMITTED", "score": 4.5},
        {"status": "DRAFT", "score": None},
    ]
    summary = panel_summary(records, assigned_count=3)
    assert summary["label"] == "2 of 3 submitted"
    assert summary["score"] == 4.2
    assert summary["is_complete"] is False


def test_panel_summary_with_no_submissions_has_no_score():
    summary = panel_summary([], assigned_count=3)
    assert summary["score"] is None
    assert summary["label"] == "0 of 3 submitted"


# ── Evaluations: who may submit, locking and reopen ────────────────────────


GOOD_RATINGS = {"ratings": {"tech": 4, "comm": 3, "culture": 5}, "recommendation": "SELECT", "submit": True}


@pytest.mark.asyncio
async def test_only_an_assigned_interviewer_can_submit_their_evaluation():
    service = _service()
    outsider = {"id": "u-outsider", "role": "interviewer", "full_name": "Outsider"}
    with pytest.raises(AuthorizationError):
        await service.save_evaluation("iv-1", outsider, GOOD_RATINGS)


@pytest.mark.asyncio
async def test_draft_is_editable_and_submitted_evaluation_is_locked_until_reopened():
    service = _service()
    draft = await service.save_evaluation("iv-1", ALICE, {"ratings": {"tech": 4}})
    assert draft["status"] == "DRAFT" and draft["score"] is None

    submitted = await service.save_evaluation("iv-1", ALICE, GOOD_RATINGS)
    assert submitted["status"] == "SUBMITTED"
    assert submitted["score"] == 3.9

    with pytest.raises(ConflictError):
        await service.save_evaluation("iv-1", ALICE, {"ratings": {"tech": 1}, "submit": False})

    reopened = await service.reopen_evaluation("iv-1", ALICE["id"], ADMIN, "Typo in comment")
    assert reopened["status"] == "DRAFT"
    assert reopened["score"] is None
    assert reopened["audit"][-1]["action"] == "REOPENED"
    assert reopened["audit"][-1]["reason"] == "Typo in comment"


@pytest.mark.asyncio
async def test_only_admins_can_reopen():
    service = _service()
    await service.save_evaluation("iv-1", ALICE, GOOD_RATINGS)
    with pytest.raises(AuthorizationError):
        await service.reopen_evaluation("iv-1", ALICE["id"], BOB, "please")


@pytest.mark.asyncio
async def test_submit_needs_a_recommendation_and_every_rating():
    service = _service()
    with pytest.raises(BadRequestError, match="recommendation"):
        await service.save_evaluation("iv-1", ALICE, {"ratings": {"tech": 4, "comm": 3, "culture": 5}, "submit": True})
    with pytest.raises(BadRequestError, match="Missing rating"):
        await service.save_evaluation("iv-1", ALICE, {"ratings": {"tech": 4}, "recommendation": "SELECT", "submit": True})


@pytest.mark.asyncio
async def test_panel_view_shows_two_of_three_and_hides_other_drafts():
    service = _service()
    await service.save_evaluation("iv-1", ALICE, GOOD_RATINGS)
    await service.save_evaluation("iv-1", BOB, {"ratings": {"tech": 2}})  # Bob's draft
    await service.save_evaluation("iv-1", CAROL, {
        "ratings": {"tech": 5, "comm": 5, "culture": 5}, "recommendation": "NEXT_ROUND", "submit": True,
    })

    carol_view = await service.get_panel_view("iv-1", CAROL)
    # Carol is assigned, so she sees the panel, but not Bob's unsubmitted draft from Alice's point of view.
    assert carol_view["summary"]["label"] == "2 of 3 submitted"
    visible_owners = {e["interviewer_user_id"] for e in carol_view["evaluations"]}
    assert BOB["id"] not in visible_owners
    assert CAROL["id"] in visible_owners

    admin_view = await service.get_panel_view("iv-1", ADMIN)
    assert BOB["id"] in {e["interviewer_user_id"] for e in admin_view["evaluations"]}


@pytest.mark.asyncio
async def test_form_resolution_prefers_job_and_round_then_job_then_default():
    default = _form("default")
    job = _form("job", job_id="job-1")
    job_round = _form("job-round", job_id="job-1", round_number=2)
    service = _service(forms=[default, job, job_round])

    assert (await service.resolve_form(_interview()))["id"] == "job-round"
    assert (await service.resolve_form(_interview(round_number=3)))["id"] == "job"
    assert (await service.resolve_form(_interview(job_id="other")))["id"] == "default"


@pytest.mark.asyncio
async def test_criteria_are_frozen_on_first_save_so_later_form_edits_do_not_change_scores():
    service = _service()
    await service.save_evaluation("iv-1", ALICE, {"ratings": {"tech": 4}})
    # The form is edited afterwards; Alice's draft keeps the criteria it started with.
    service.forms.docs["form-default"]["criteria"] = [{"id": "tech", "label": "Tech", "weight": 1}]
    submitted = await service.save_evaluation("iv-1", ALICE, GOOD_RATINGS)
    assert {c["id"] for c in submitted["criteria"]} == {"tech", "comm", "culture"}


@pytest.mark.asyncio
async def test_invite_ics_carries_candidate_and_panel_and_respects_cancellation():
    service = _service()
    ics = await service.build_invite_ics("iv-1")
    assert "DTSTART:20261201T043000Z" in ics
    assert "dev@example.com" in ics and "bob@example.com" in ics
    service.interviews.docs["iv-1"]["status"] = "CANCELLED"
    assert "METHOD:CANCEL" in await service.build_invite_ics("iv-1")


# ── Panel weekly availability and company timezone (Phase 8 gaps) ──────────


def test_availability_window_must_end_after_it_starts():
    from pydantic import ValidationError
    from app.schemas.evaluation import AvailabilityWindow

    assert AvailabilityWindow(weekday=0, start="09:00", end="17:00").weekday == 0
    with pytest.raises(ValidationError):
        AvailabilityWindow(weekday=0, start="17:00", end="09:00")
    with pytest.raises(ValidationError):
        AvailabilityWindow(weekday=7, start="09:00", end="10:00")


def test_panel_create_accepts_weekly_windows():
    from app.schemas.evaluation import InterviewPanelCreate

    panel = InterviewPanelCreate(
        name="QA", availability="COMMON",
        members=[{"user_id": "u1", "name": "A"}],
        weekly_availability=[{"weekday": 1, "start": "10:00", "end": "13:00"}],
    )
    assert panel.weekly_availability[0].start == "10:00"


@pytest.mark.asyncio
async def test_evaluation_records_the_interviews_candidate():
    service = _service(interviews=[_interview("iv-1", candidate_id="cand-42")])
    saved = await service.save_evaluation("iv-1", ALICE, {"ratings": {"tech": 4}})
    assert saved["candidate_id"] == "cand-42"


def test_interview_create_accepts_an_application_link():
    from app.schemas.interview import InterviewCreateRequest

    fields = InterviewCreateRequest.model_fields
    assert "application_id" in fields and fields["application_id"].default is None
