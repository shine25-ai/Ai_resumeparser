"""
Interview reminders (Phase 8): a reminder email 24 hours and 1 hour before each interview.

How it runs: an in-process asyncio loop started from the app lifespan, checking every few minutes.
Each reminder is claimed with one atomic conditional update on the interview before it is sent, so a
reminder is sent at most once even when several workers run the loop. A failed send releases the claim
so the next pass retries it. Cancelled and completed interviews are skipped.
"""

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from loguru import logger
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.tenant import company_scope, system_scope
from app.models.company import DEFAULT_COMPANY_ID
from app.repositories.base_repository import BaseRepository
from app.services.evaluation_service import DEFAULT_TIMEZONE
from app.services.interview_invites import KIND_REMINDER_1H, KIND_REMINDER_24H, InterviewInviteService
from app.utils.constants import INTERVIEW_EVALUATIONS_COLLECTION, INTERVIEWS_COLLECTION
from app.utils.interview_scheduling import to_utc_range

REMINDERS_FIELD = "reminders_sent"
EVALUATION_DUE_FIELD = "evaluation_due_notified"
DEFAULT_INTERVAL_SECONDS = 300
_CLOSED_STATUSES = ["CANCELLED", "COMPLETED"]
_FLAG_FOR_KIND = {KIND_REMINDER_24H: "24h", KIND_REMINDER_1H: "1h"}


def due_reminders(interview: Dict[str, Any], now: datetime) -> List[str]:
    """
    Reminder kinds that should go out now, given what was already sent.

    24h is due from 24 hours before the start. 1h is due from 1 hour before. Once the 1h window is
    reached, a 24h reminder that was never sent is treated as skipped, so a late booking gets one email.
    Nothing is due after the interview has started.
    """
    if interview.get("status") in _CLOSED_STATUSES:
        return []
    try:
        start, _ = to_utc_range(
            interview["scheduled_date"],
            interview["scheduled_time"],
            interview.get("timezone") or DEFAULT_TIMEZONE,
            int(interview.get("duration_minutes") or 60),
        )
    except (ValueError, KeyError):
        return []

    if now >= start:
        return []
    sent = interview.get(REMINDERS_FIELD) or {}
    if now >= start - timedelta(hours=1):
        return [] if sent.get("1h") else [KIND_REMINDER_1H]
    if now >= start - timedelta(hours=24) and not sent.get("24h"):
        return [KIND_REMINDER_24H]
    return []


async def _claim(repo: BaseRepository, interview_id: str, kind: str) -> bool:
    """Atomically mark one reminder as sent. Only the caller whose update matches gets True."""
    flag = f"{REMINDERS_FIELD}.{_FLAG_FOR_KIND[kind]}"
    result = await repo.collection.update_one(
        {"id": interview_id, flag: {"$ne": True}},
        {"$set": {flag: True}},
    )
    return result.modified_count == 1


async def _release(repo: BaseRepository, interview_id: str, kind: str) -> None:
    flag = f"{REMINDERS_FIELD}.{_FLAG_FOR_KIND[kind]}"
    await repo.collection.update_one({"id": interview_id}, {"$set": {flag: False}})


async def run_reminder_pass(db: AsyncIOMotorDatabase, now: Optional[datetime] = None) -> Dict[str, int]:
    """One pass over every company's upcoming interviews. Returns counts for logging and tests."""
    now = now or datetime.now(timezone.utc)
    repo = BaseRepository(db, INTERVIEWS_COLLECTION)
    # Interviews in other timezones can fall a day either side of today's date in UTC.
    today = now.date()
    window = [(today + timedelta(days=offset)).isoformat() for offset in (-1, 0, 1, 2)]

    with system_scope():
        candidates = await repo.collection.find(
            {"scheduled_date": {"$in": window}, "status": {"$nin": _CLOSED_STATUSES}},
        ).to_list(length=5000)

    counts = {"sent": 0, "failed": 0}
    for interview in candidates:
        kinds = due_reminders(interview, now)
        for kind in kinds:
            if not await _claim(repo, interview["id"], kind):
                continue  # another worker already took this reminder
            company_id = interview.get("company_id") or DEFAULT_COMPANY_ID
            with company_scope(company_id):
                result = await InterviewInviteService(db, repo).send(interview["id"], kind)
            if result.get("sent"):
                counts["sent"] += 1
                continue
            reason = result.get("reason") or ""
            counts["failed"] += 1
            logger.warning(f"Reminder {kind} not sent for interview {interview['id']}: {reason}")
            # Retry only failures that can clear up (mail server down, email not yet set up).
            # A missing address or a bad schedule will not change between passes, so stay claimed.
            permanent = reason.startswith("no recipient") or reason.startswith("invalid schedule")
            if not permanent:
                await _release(repo, interview["id"], kind)
    return counts


def evaluation_due(interview: Dict[str, Any], now: datetime) -> bool:
    """True once the interview has ended (and was not cancelled) and its "evaluation due" notice has not gone out."""
    if interview.get("status") == "CANCELLED" or interview.get(EVALUATION_DUE_FIELD):
        return False
    try:
        _, end = to_utc_range(
            interview["scheduled_date"],
            interview["scheduled_time"],
            interview.get("timezone") or DEFAULT_TIMEZONE,
            int(interview.get("duration_minutes") or 60),
        )
    except (ValueError, KeyError):
        return False
    return now >= end


async def run_evaluation_due_pass(db: AsyncIOMotorDatabase, now: Optional[datetime] = None) -> int:
    """
    Once an interview has ended, tell each assigned interviewer who has not submitted an evaluation that it is due.
    Only interviews from the last two days are checked, so the first run after a release does not notify old ones.
    Claimed with one conditional update per interview, so each notice goes out once even with several workers.
    """
    from app.models.evaluation import EVALUATION_SUBMITTED
    from app.services.evaluation_service import assigned_interviewer_ids
    from app.services.notification_service import NotificationService

    now = now or datetime.now(timezone.utc)
    repo = BaseRepository(db, INTERVIEWS_COLLECTION)
    window = [(now.date() - timedelta(days=offset)).isoformat() for offset in (2, 1, 0)]
    with system_scope():
        ended = await repo.collection.find(
            {"scheduled_date": {"$in": window}, "status": {"$ne": "CANCELLED"}, EVALUATION_DUE_FIELD: {"$ne": True}},
        ).to_list(length=5000)

    sent = 0
    for interview in ended:
        if not evaluation_due(interview, now):
            continue
        claimed = await repo.collection.update_one(
            {"id": interview["id"], EVALUATION_DUE_FIELD: {"$ne": True}}, {"$set": {EVALUATION_DUE_FIELD: True}},
        )
        if claimed.modified_count != 1:
            continue
        company_id = interview.get("company_id") or DEFAULT_COMPANY_ID
        with company_scope(company_id):
            submitted = await db[INTERVIEW_EVALUATIONS_COLLECTION].find(
                {"interview_id": interview["id"], "status": EVALUATION_SUBMITTED}, {"interviewer_user_id": 1},
            ).to_list(length=50)
            done = {str(e.get("interviewer_user_id")) for e in submitted}
            waiting = [u for u in assigned_interviewer_ids(interview) if u not in done]
            if not waiting:
                continue
            who = interview.get("candidate_name") or "the candidate"
            job = f" ({interview['job_title']})" if interview.get("job_title") else ""
            created = await NotificationService(db).notify_users(
                waiting, title="Evaluation due",
                message=f"Please submit your evaluation for {who}{job}.",
                notification_type="evaluation", link="/interviews/evaluations", company_id=company_id,
            )
            sent += len(created)
    return sent


def start_reminder_loop(db: AsyncIOMotorDatabase, interval_seconds: int = DEFAULT_INTERVAL_SECONDS) -> asyncio.Task:
    """Start the background loop. Call from the lifespan startup; cancel the returned task on shutdown."""

    async def _loop() -> None:
        while True:
            try:
                counts = await run_reminder_pass(db)
                if counts["sent"] or counts["failed"]:
                    logger.info(f"Interview reminders: {counts['sent']} sent, {counts['failed']} failed")
                due = await run_evaluation_due_pass(db)
                if due:
                    logger.info(f"Evaluation due notices: {due} sent")
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # keep the loop alive through transient database errors
                logger.warning(f"Interview reminder pass failed: {exc}")
            await asyncio.sleep(interval_seconds)

    return asyncio.create_task(_loop())
