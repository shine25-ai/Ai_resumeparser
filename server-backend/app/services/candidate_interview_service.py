"""
Candidate-facing view of interviews for the integration API.

Only what a candidate should see is returned: schedule, joining details, status, and (when
enabled in Settings) a plain outcome such as "Selected". Internal evaluation data such as
ratings, written feedback, salary, AI scores and interviewer emails is never included.
"""

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.utils.constants import INTERVIEWS_COLLECTION, INTERVIEW_TYPES_COLLECTION

STATUS_LABELS = {
    "PENDING": "Awaiting confirmation",
    "SCHEDULED": "Scheduled",
    "RESCHEDULED": "Rescheduled",
    "COMPLETED": "Completed",
    "CANCELLED": "Cancelled",
    "NO_SHOW": "Missed",
}
OPEN_STATUSES = {"PENDING", "SCHEDULED", "RESCHEDULED"}

# Internal recommendation values -> candidate-facing outcome.
OUTCOMES = {
    "selected": ("SELECTED", "Selected"),
    "offer to be released": ("SELECTED", "Selected"),
    "offer accepted": ("OFFER_ACCEPTED", "Offer accepted"),
    "offer rejected": ("OFFER_DECLINED", "Offer declined"),
    "shortlisted": ("NEXT_ROUND", "Moved to next round"),
    "recommended": ("NEXT_ROUND", "Moved to next round"),
    "next round": ("NEXT_ROUND", "Moved to next round"),
    "rejected": ("NOT_SELECTED", "Not selected"),
    "not recommended": ("NOT_SELECTED", "Not selected"),
    "on hold": ("ON_HOLD", "On hold"),
    "hold": ("ON_HOLD", "On hold"),
    "no show": ("NO_SHOW", "Did not attend"),
    "withdrawn": ("WITHDRAWN", "Withdrawn"),
}
PENDING_OUTCOME = ("PENDING", "Result pending")
UNDECIDED_VALUES = {"", "pending", "need further evaluation", "reschedule required"}


def _scheduled_at(interview: Dict[str, Any]) -> Optional[datetime]:
    """Combine scheduled_date + scheduled_time in the interview's timezone."""
    date_str = (interview.get("scheduled_date") or "").strip()
    time_str = (interview.get("scheduled_time") or "00:00").strip()
    if not date_str:
        return None
    try:
        tz = ZoneInfo(interview.get("timezone") or "Asia/Kolkata")
    except (ZoneInfoNotFoundError, ValueError):
        tz = ZoneInfo("Asia/Kolkata")
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %I:%M %p"):
        try:
            return datetime.strptime(f"{date_str[:10]} {time_str}", fmt).replace(tzinfo=tz)
        except ValueError:
            continue
    return None


def interview_outcome(interview: Dict[str, Any]) -> Optional[Dict[str, str]]:
    """Plain outcome for a finished interview, or None if it hasn't happened yet."""
    status = str(interview.get("status") or "").upper()
    if status == "NO_SHOW":
        code, label = OUTCOMES["no show"]
        return {"outcome": code, "label": label}
    if status != "COMPLETED":
        return None
    for field in ("recommendation", "client_recommendation"):
        value = str(interview.get(field) or "").strip().lower()
        if value and value not in UNDECIDED_VALUES:
            code, label = OUTCOMES.get(value, PENDING_OUTCOME)
            return {"outcome": code, "label": label}
    code, label = PENDING_OUTCOME
    return {"outcome": code, "label": label}


def candidate_interview_view(
    interview: Dict[str, Any],
    type_names: Dict[str, str],
    share_results: bool,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    status = str(interview.get("status") or "PENDING").upper()
    scheduled_at = _scheduled_at(interview)
    is_open = status in OPEN_STATUSES
    type_code = interview.get("interview_type")

    panel_names = [p.get("interviewer_name") for p in (interview.get("interviewers") or []) if p.get("interviewer_name")]
    interviewer_names = panel_names or ([interview["interviewer_name"]] if interview.get("interviewer_name") else [])

    location = (interview.get("interview_location") or interview.get("location") or "").strip() or None
    history = interview.get("reschedule_history") or []

    return {
        "interview_id": interview.get("id"),
        "round_number": interview.get("round_number") or 1,
        "interview_type": type_names.get(type_code, type_code),
        "job_title": interview.get("job_title"),
        "job_location": interview.get("job_location"),
        "job_type": interview.get("job_type"),
        "scheduled_date": interview.get("scheduled_date"),
        "scheduled_time": interview.get("scheduled_time"),
        "timezone": interview.get("timezone") or "Asia/Kolkata",
        "scheduled_at": scheduled_at.isoformat() if scheduled_at else None,
        "duration_minutes": interview.get("duration_minutes") or 60,
        "status": status,
        "status_label": STATUS_LABELS.get(status, status.title()),
        "is_upcoming": bool(is_open and scheduled_at and scheduled_at > now),
        "was_rescheduled": bool(history) or status == "RESCHEDULED",
        "previous_schedule": (
            {"date": history[-1].get("previous_date"), "time": history[-1].get("previous_time")} if history else None
        ),
        "mode": "Online" if interview.get("meeting_link") or (location or "").lower() in ("online", "virtual") else ("In person" if location else None),
        "meeting_platform": interview.get("meeting_platform") if is_open else None,
        # Joining details are only useful (and only shared) while the interview is still ahead.
        "meeting_link": interview.get("meeting_link") if is_open else None,
        "location": location,
        "interviewer_names": interviewer_names,
        "result": interview_outcome(interview) if share_results else None,
        "last_updated_at": interview.get("updated_at"),
    }


def overall_progress(rounds: List[Dict[str, Any]], share_results: bool) -> Dict[str, Any]:
    """One-line summary of where the candidate stands. `rounds` must be in chronological order."""
    active = [r for r in rounds if r["status"] != "CANCELLED"]
    completed = [r for r in active if r["status"] in ("COMPLETED", "NO_SHOW")]
    upcoming = [r for r in active if r["is_upcoming"]]

    summary = {
        "total_rounds": len(active),
        "completed_rounds": len(completed),
        "next_interview": upcoming[0] if upcoming else None,
    }
    if not active:
        return {**summary, "stage": "NOT_SCHEDULED", "label": "No interview scheduled yet"}
    if upcoming:
        return {**summary, "stage": "INTERVIEW_SCHEDULED", "label": "Interview scheduled"}

    latest = active[-1]
    if latest["status"] in OPEN_STATUSES:
        return {**summary, "stage": "AWAITING_UPDATE", "label": "Interview held, awaiting update"}
    if not share_results:
        return {**summary, "stage": "UNDER_REVIEW", "label": "Under review"}

    outcome = (latest.get("result") or {}).get("outcome", "PENDING")
    stages = {
        "SELECTED": ("SELECTED", "Selected"),
        "OFFER_ACCEPTED": ("OFFER_ACCEPTED", "Offer accepted"),
        "OFFER_DECLINED": ("OFFER_DECLINED", "Offer declined"),
        "NOT_SELECTED": ("NOT_SELECTED", "Not selected"),
        "WITHDRAWN": ("WITHDRAWN", "Withdrawn"),
        "NEXT_ROUND": ("NEXT_ROUND_PENDING", "Cleared round, next round to be scheduled"),
        "ON_HOLD": ("ON_HOLD", "On hold"),
        "NO_SHOW": ("UNDER_REVIEW", "Under review"),
    }
    stage, label = stages.get(outcome, ("UNDER_REVIEW", "Under review"))
    return {**summary, "stage": stage, "label": label}


class CandidateInterviewService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def _type_names(self) -> Dict[str, str]:
        docs = await self.db[INTERVIEW_TYPES_COLLECTION].find({}, {"code": 1, "name": 1}).to_list(length=500)
        return {d["code"]: d["name"] for d in docs if d.get("code") and d.get("name")}

    async def _interviews_for(self, resume: Dict[str, Any]) -> List[Dict[str, Any]]:
        ids = [v for v in (resume.get("id"), resume.get("candidate_id")) if v]
        conditions: List[Dict[str, Any]] = [{"candidate_id": {"$in": ids}}, {"resume_id": resume.get("id")}]
        email = ((resume.get("parsed_data") or {}).get("email") or "").strip()
        if email:
            conditions.append({"candidate_email": re.compile(f"^{re.escape(email)}$", re.IGNORECASE)})
        cursor = self.db[INTERVIEWS_COLLECTION].find({"$or": conditions}, {"_id": 0})
        return await cursor.to_list(length=200)

    async def interviews_for_resume(self, resume: Dict[str, Any], share_results: bool) -> Dict[str, Any]:
        type_names = await self._type_names()
        now = datetime.now(timezone.utc)
        far_past = datetime.min.replace(tzinfo=timezone.utc)
        interviews = sorted(
            await self._interviews_for(resume),
            key=lambda i: (_scheduled_at(i) or far_past, i.get("round_number") or 1),
        )
        rounds = [candidate_interview_view(i, type_names, share_results, now) for i in interviews]

        parsed = resume.get("parsed_data") or {}
        return {
            "resume_id": resume.get("id"),
            "candidate_id": resume.get("candidate_id"),
            "candidate_name": parsed.get("full_name"),
            "candidate_email": parsed.get("email"),
            "results_shared": share_results,
            "overall": overall_progress(rounds, share_results),
            "interviews": rounds,
        }
