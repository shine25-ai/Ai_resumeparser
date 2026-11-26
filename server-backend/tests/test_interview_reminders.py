"""
Interview reminders (Phase 8): which reminder is due when, sent-once claims, retries and permanent failures.
Uses an in-memory collection and a fake sender, so no database or mail server is needed.
"""

from datetime import datetime, timedelta, timezone

import pytest

from app.services import interview_reminders as reminders
from app.services.interview_invites import KIND_REMINDER_1H, KIND_REMINDER_24H
from app.services.interview_reminders import due_reminders, run_reminder_pass
from tests.test_phase8_interviews import _interview

# The interview in the shared fixture starts 2026-12-01 10:00 IST = 04:30 UTC.
START_UTC = datetime(2026, 12, 1, 4, 30, tzinfo=timezone.utc)


def _at(hours_before: float) -> datetime:
    return START_UTC - timedelta(hours=hours_before)


# ── Which reminder is due ───────────────────────────────────────────────────


def test_nothing_is_due_more_than_24_hours_before():
    assert due_reminders(_interview(), _at(25)) == []


def test_24h_reminder_is_due_from_24_hours_before():
    assert due_reminders(_interview(), _at(24)) == [KIND_REMINDER_24H]
    assert due_reminders(_interview(), _at(5)) == [KIND_REMINDER_24H]


def test_1h_reminder_is_due_from_1_hour_before():
    assert due_reminders(_interview(), _at(1)) == [KIND_REMINDER_1H]


def test_each_reminder_is_due_only_until_it_is_sent():
    sent_24h = _interview(reminders_sent={"24h": True})
    assert due_reminders(sent_24h, _at(5)) == []
    assert due_reminders(sent_24h, _at(0.5)) == [KIND_REMINDER_1H]


def test_late_booking_gets_one_email_not_two():
    # Booked 30 minutes before the start: only the 1h reminder goes out, and the 24h is treated as skipped.
    assert due_reminders(_interview(), _at(0.5)) == [KIND_REMINDER_1H]
    done = _interview(reminders_sent={"1h": True})
    assert due_reminders(done, _at(0.25)) == []


def test_nothing_is_due_after_the_interview_starts_or_when_closed():
    assert due_reminders(_interview(), _at(-0.1)) == []
    assert due_reminders(_interview(status="CANCELLED"), _at(1)) == []
    assert due_reminders(_interview(status="COMPLETED"), _at(1)) == []


def test_bad_schedule_is_skipped_rather_than_raising():
    assert due_reminders(_interview(scheduled_time="25:99"), _at(1)) == []


def test_reminder_timing_uses_the_interview_timezone():
    # 10:00 New York on 2026-12-01 is 15:00 UTC: the 1h reminder starts at 14:00 UTC.
    ny = _interview(timezone="America/New_York", scheduled_time="10:00")
    now = datetime(2026, 12, 1, 14, 0, tzinfo=timezone.utc)
    assert due_reminders(ny, now) == [KIND_REMINDER_1H]


# ── The pass: claims, sends, retries ────────────────────────────────────────


class _Cursor:
    def __init__(self, docs):
        self.docs = docs

    async def to_list(self, length=None):
        return [dict(d) for d in self.docs]


class FakeCollection:
    def __init__(self, docs):
        self.docs = {d["id"]: dict(d) for d in docs}

    def find(self, query):
        window = query["scheduled_date"]["$in"]
        closed = query["status"]["$nin"]
        return _Cursor([d for d in self.docs.values() if d["scheduled_date"] in window and d.get("status") not in closed])

    async def update_one(self, flt, update):
        doc = self.docs.get(flt["id"])
        matched = doc is not None
        for key, cond in flt.items():
            if key == "id":
                continue
            value = _dotted(doc, key) if doc else None
            if isinstance(cond, dict) and "$ne" in cond and value == cond["$ne"]:
                matched = False
        if matched:
            for key, value in update["$set"].items():
                _set_dotted(doc, key, value)
        return type("Result", (), {"modified_count": 1 if matched else 0})()


def _dotted(doc, key):
    value = doc
    for part in key.split("."):
        value = (value or {}).get(part)
    return value


def _set_dotted(doc, key, value):
    parts = key.split(".")
    target = doc
    for part in parts[:-1]:
        target = target.setdefault(part, {})
    target[parts[-1]] = value


class FakeDb:
    def __init__(self, docs):
        self.collection = FakeCollection(docs)

    def __getitem__(self, name):
        return self.collection


class FakeSender:
    """Records what would have been sent; `fail_with` makes every send return that reason."""

    calls = []
    fail_with = None

    def __init__(self, db, repo, *args, **kwargs):
        pass

    async def send(self, interview_id, kind, reason=None):
        FakeSender.calls.append((interview_id, kind))
        if FakeSender.fail_with:
            return {"sent": False, "reason": FakeSender.fail_with}
        return {"sent": True, "kind": kind}


@pytest.fixture(autouse=True)
def _reset_sender(monkeypatch):
    FakeSender.calls = []
    FakeSender.fail_with = None
    monkeypatch.setattr(reminders, "InterviewInviteService", FakeSender)


@pytest.mark.asyncio
async def test_pass_sends_each_reminder_once_even_when_run_twice():
    db = FakeDb([_interview("iv-1")])
    first = await run_reminder_pass(db, now=_at(5))
    second = await run_reminder_pass(db, now=_at(5))
    assert first == {"sent": 1, "failed": 0}
    assert second == {"sent": 0, "failed": 0}
    assert FakeSender.calls == [("iv-1", KIND_REMINDER_24H)]


@pytest.mark.asyncio
async def test_two_workers_racing_send_one_reminder():
    db = FakeDb([_interview("iv-1")])
    # Both workers read the interview as due, but only one claim can win.
    interview = db.collection.docs["iv-1"]
    assert await reminders._claim(reminders.BaseRepository(db, "interviews"), "iv-1", KIND_REMINDER_24H)
    assert not await reminders._claim(reminders.BaseRepository(db, "interviews"), "iv-1", KIND_REMINDER_24H)
    assert interview["reminders_sent"]["24h"] is True


@pytest.mark.asyncio
async def test_a_mail_failure_is_retried_on_the_next_pass():
    db = FakeDb([_interview("iv-1")])
    FakeSender.fail_with = "smtp is down"
    assert await run_reminder_pass(db, now=_at(5)) == {"sent": 0, "failed": 1}

    FakeSender.fail_with = None
    assert await run_reminder_pass(db, now=_at(5)) == {"sent": 1, "failed": 0}


@pytest.mark.asyncio
async def test_a_permanent_failure_is_not_retried_every_pass():
    db = FakeDb([_interview("iv-1", candidate_email=None, interviewer_email=None, interviewers=[])])
    FakeSender.fail_with = "no recipient email addresses"
    await run_reminder_pass(db, now=_at(5))
    await run_reminder_pass(db, now=_at(5))
    assert len(FakeSender.calls) == 1


@pytest.mark.asyncio
async def test_closed_interviews_are_never_picked_up():
    db = FakeDb([_interview("iv-1", status="CANCELLED"), _interview("iv-2", scheduled_date="2026-12-20")])
    assert await run_reminder_pass(db, now=_at(5)) == {"sent": 0, "failed": 0}
    assert FakeSender.calls == []
