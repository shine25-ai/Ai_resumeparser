"""
Interview panels, evaluation forms, interviewer evaluations, conflict checks and .ics invites (Phase 8).

Business rules live here so they can be tested with in-memory repositories:
- Only an interviewer assigned to an interview may save or submit that interviewer's own evaluation.
- A submitted evaluation is locked. An admin may reopen it; the reopen is recorded in the evaluation's audit trail.
- Scores follow evaluation_scoring.py. Drafts never count toward the panel score.
- A scheduling conflict is any overlap, in real UTC time, with another live interview that shares an interviewer.
"""

from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Set

from app.core.exceptions import AuthorizationError, BadRequestError, ConflictError, NotFoundError
from app.models.evaluation import (
    EVALUATION_DRAFT,
    EVALUATION_SUBMITTED,
    RECOMMENDATIONS,
    EvaluationFormDocument,
    InterviewEvaluationDocument,
    InterviewPanelDocument,
)
from app.utils.evaluation_scoring import panel_summary, score_evaluation, validate_ratings
from app.utils.helpers import generate_uuid, utc_now
from app.utils.interview_scheduling import build_ics, find_conflicts, to_utc_range

DEFAULT_TIMEZONE = "Asia/Kolkata"
CANCELLED = "CANCELLED"
ADMIN_ROLES = {"admin", "superadmin"}


def assigned_interviewer_ids(interview: Dict[str, Any]) -> Set[str]:
    """Every user id attached to an interview as an interviewer, from the primary slot and the panel list."""
    ids: Set[str] = set()
    for key in ("interviewer_id", "evaluator_user_id"):
        if interview.get(key):
            ids.add(str(interview[key]))
    for item in interview.get("interviewers") or []:
        for key in ("interviewer_id", "evaluator_user_id"):
            if item.get(key):
                ids.add(str(item[key]))
    return ids


def is_admin_user(user: Dict[str, Any]) -> bool:
    return str(user.get("role", "")).strip().lower() in ADMIN_ROLES


def _actor_name(user: Dict[str, Any]) -> str:
    return user.get("full_name") or user.get("name") or user.get("email") or user.get("id", "")


def _now_iso() -> str:
    return utc_now().isoformat()


class EvaluationService:
    def __init__(self, panels, forms, evaluations, interviews):
        self.panels = panels
        self.forms = forms
        self.evaluations = evaluations
        self.interviews = interviews

    # ── Panels ─────────────────────────────────────────────────────────────

    async def create_panel(self, payload: Dict[str, Any], actor: Dict[str, Any]) -> Dict[str, Any]:
        members = payload.get("members") or []
        if not any(m.get("role") == "lead" for m in members):
            # Every panel needs a lead. The first member becomes lead when none is marked.
            members[0]["role"] = "lead"
        doc = InterviewPanelDocument(**{**payload, "members": members, "created_by": actor.get("id")})
        await self.panels.create(doc.to_dict())
        return doc.to_dict()

    async def update_panel(self, panel_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        existing = await self.panels.get_by_id(panel_id)
        if not existing:
            raise NotFoundError("Interview panel not found.")
        members = payload.get("members") or []
        if members and not any(m.get("role") == "lead" for m in members):
            members[0]["role"] = "lead"
        changes = {**payload, "members": members, "updated_at": _now_iso()}
        updated = await self.panels.update(panel_id, changes)
        return updated

    async def list_panels(self) -> List[Dict[str, Any]]:
        return await self.panels.find_many(sort=[("created_at", -1)], limit=500)

    async def delete_panel(self, panel_id: str) -> None:
        if not await self.panels.delete(panel_id):
            raise NotFoundError("Interview panel not found.")

    async def check_conflicts(
        self,
        *,
        interviewer_ids: Iterable[str],
        scheduled_date: str,
        scheduled_time: str,
        timezone_name: str = DEFAULT_TIMEZONE,
        duration_minutes: int = 60,
        exclude_interview_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Return the live interviews that overlap the requested slot for any of these interviewers."""
        try:
            start, end = to_utc_range(scheduled_date, scheduled_time, timezone_name, duration_minutes)
        except ValueError as exc:
            raise BadRequestError(str(exc)) from exc

        wanted = set(interviewer_ids)
        if not wanted:
            return []

        # Timezones can move a slot across midnight, so look one day either side of the requested date.
        day = date.fromisoformat(scheduled_date)
        window = [(day + timedelta(days=offset)).isoformat() for offset in (-1, 0, 1)]
        candidates = await self.interviews.find_many(
            query={"scheduled_date": {"$in": window}},
            limit=2000,
        )

        busy: List[Dict[str, Any]] = []
        for interview in candidates:
            if interview.get("id") == exclude_interview_id or interview.get("status") == CANCELLED:
                continue
            if not (assigned_interviewer_ids(interview) & wanted):
                continue
            try:
                i_start, i_end = to_utc_range(
                    interview["scheduled_date"],
                    interview["scheduled_time"],
                    interview.get("timezone") or DEFAULT_TIMEZONE,
                    int(interview.get("duration_minutes") or 60),
                )
            except (ValueError, KeyError):
                continue  # an interview with an unreadable time cannot be compared; skip it
            busy.append({
                "interview_id": interview.get("id"),
                "candidate_name": interview.get("candidate_name"),
                "start": i_start,
                "end": i_end,
            })

        clashes = find_conflicts(start, end, busy)
        return [
            {
                "interview_id": c["interview_id"],
                "candidate_name": c["candidate_name"],
                "start_utc": c["start"].isoformat(),
                "end_utc": c["end"].isoformat(),
            }
            for c in clashes
        ]

    # ── Evaluation forms ───────────────────────────────────────────────────

    async def create_form(self, payload: Dict[str, Any], actor: Dict[str, Any]) -> Dict[str, Any]:
        ids = [c["id"] for c in payload["criteria"]]
        if len(ids) != len(set(ids)):
            raise BadRequestError("Each criterion needs a unique id.")
        if sum(c.get("weight", 1) for c in payload["criteria"]) <= 0:
            raise BadRequestError("Criteria weights must add up to more than zero.")
        doc = EvaluationFormDocument(**{**payload, "created_by": actor.get("id")})
        await self.forms.create(doc.to_dict())
        return doc.to_dict()

    async def list_forms(self) -> List[Dict[str, Any]]:
        return await self.forms.find_many(sort=[("created_at", -1)], limit=500)

    async def resolve_form(self, interview: Dict[str, Any]) -> Dict[str, Any]:
        """Job + round form, then the job's form, then the company default."""
        forms = await self.forms.find_many(limit=500)
        job_id = interview.get("job_id")
        round_number = interview.get("round_number")
        exact = [f for f in forms if f.get("job_id") == job_id and f.get("round_number") == round_number] if job_id else []
        by_job = [f for f in forms if job_id and f.get("job_id") == job_id and f.get("round_number") is None]
        default = [f for f in forms if f.get("job_id") is None and f.get("round_number") is None]
        for pool in (exact, by_job, default):
            if pool:
                return pool[0]
        raise BadRequestError("No evaluation form is set up for this interview. Create a company default first.")

    # ── Evaluations ────────────────────────────────────────────────────────

    async def _get_interview(self, interview_id: str) -> Dict[str, Any]:
        interview = await self.interviews.get_by_id(interview_id)
        if not interview:
            raise NotFoundError("Interview not found.")
        return interview

    async def get_panel_view(self, interview_id: str, viewer: Dict[str, Any]) -> Dict[str, Any]:
        """
        Everything the evaluation screen needs: assigned interviewers, "N of M submitted", the score,
        and the evaluations the viewer may see. Other interviewers' drafts stay hidden until submitted.
        """
        interview = await self._get_interview(interview_id)
        assigned = assigned_interviewer_ids(interview)
        records = await self.evaluations.find_many(query={"interview_id": interview_id}, limit=200)
        admin = is_admin_user(viewer)

        visible = []
        for record in records:
            is_owner = record["interviewer_user_id"] == viewer.get("id")
            if admin or is_owner or record["status"] == EVALUATION_SUBMITTED:
                visible.append(record)

        summary = panel_summary(records, assigned_count=len(assigned))
        return {
            "interview_id": interview_id,
            "assigned_count": len(assigned),
            "summary": summary,
            "evaluations": visible,
            "can_evaluate": viewer.get("id") in assigned,
        }

    async def save_evaluation(
        self,
        interview_id: str,
        actor: Dict[str, Any],
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        interview = await self._get_interview(interview_id)
        if interview.get("status") == CANCELLED:
            raise BadRequestError("This interview was cancelled and can no longer be evaluated.")
        if actor.get("id") not in assigned_interviewer_ids(interview):
            raise AuthorizationError("Only an assigned interviewer can evaluate this interview.")

        existing = await self.evaluations.find_one({
            "interview_id": interview_id,
            "interviewer_user_id": actor["id"],
        })
        if existing and existing["status"] == EVALUATION_SUBMITTED:
            raise ConflictError("This evaluation is submitted and locked. Ask an admin to reopen it.")

        if existing:
            criteria, scale_max, form_id = existing["criteria"], existing["scale_max"], existing["form_id"]
        else:
            form = await self.resolve_form(interview)
            criteria, scale_max, form_id = form["criteria"], form["scale_max"], form["id"]

        ratings = {k: float(v) for k, v in (payload.get("ratings") or {}).items() if v is not None}
        try:
            validate_ratings(ratings, criteria, scale_max)
        except ValueError as exc:
            raise BadRequestError(str(exc)) from exc

        submit = bool(payload.get("submit"))
        recommendation = payload.get("recommendation")
        score = None
        if submit:
            if recommendation not in RECOMMENDATIONS:
                raise BadRequestError("Choose a recommendation before submitting.")
            try:
                score = score_evaluation(ratings, criteria)
            except ValueError as exc:
                raise BadRequestError(str(exc)) from exc

        now = _now_iso()
        audit = list(existing.get("audit", [])) if existing else []
        audit.append({"action": "SUBMITTED" if submit else "DRAFT_SAVED", "by": actor["id"], "at": now})

        doc = InterviewEvaluationDocument(
            id=existing["id"] if existing else generate_uuid(),
            interview_id=interview_id,
            candidate_id=interview.get("candidate_id"),
            interviewer_user_id=actor["id"],
            interviewer_name=_actor_name(actor),
            form_id=form_id,
            scale_max=scale_max,
            criteria=criteria,
            ratings=ratings,
            comments=payload.get("comments"),
            recommendation=recommendation,
            score=score,
            status=EVALUATION_SUBMITTED if submit else EVALUATION_DRAFT,
            submitted_at=now if submit else None,
            audit=audit,
            created_at=existing["created_at"] if existing else now,
            updated_at=now,
        )
        if existing:
            await self.evaluations.update(existing["id"], doc.to_dict())
        else:
            await self.evaluations.create(doc.to_dict())
        if submit and doc.candidate_id:
            # Keep the candidate's skill matrix current. Never raises, so the submit always goes ahead.
            from app.services.skill_intelligence_service import recalculate_skills_for
            await recalculate_skills_for(self.interviews.collection.database, doc.candidate_id)
        return doc.to_dict()

    async def reopen_evaluation(
        self,
        interview_id: str,
        target_user_id: str,
        actor: Dict[str, Any],
        reason: str,
    ) -> Dict[str, Any]:
        if not is_admin_user(actor):
            raise AuthorizationError("Only an admin can reopen a submitted evaluation.")
        record = await self.evaluations.find_one({"interview_id": interview_id, "interviewer_user_id": target_user_id})
        if not record:
            raise NotFoundError("No evaluation found for that interviewer.")
        if record["status"] != EVALUATION_SUBMITTED:
            raise BadRequestError("This evaluation is not submitted, so there is nothing to reopen.")

        now = _now_iso()
        audit = list(record.get("audit", []))
        audit.append({"action": "REOPENED", "by": actor["id"], "reason": reason, "at": now})
        await self.evaluations.update(record["id"], {
            "status": EVALUATION_DRAFT,
            "score": None,
            "submitted_at": None,
            "audit": audit,
            "updated_at": now,
        })
        return await self.evaluations.get_by_id(record["id"])

    # ── Calendar invite ────────────────────────────────────────────────────

    async def build_invite_ics(self, interview_id: str) -> str:
        interview = await self._get_interview(interview_id)
        try:
            start, end = to_utc_range(
                interview["scheduled_date"],
                interview["scheduled_time"],
                interview.get("timezone") or DEFAULT_TIMEZONE,
                int(interview.get("duration_minutes") or 60),
            )
        except (ValueError, KeyError) as exc:
            raise BadRequestError(f"This interview has no valid schedule: {exc}") from exc

        attendees = []
        if interview.get("candidate_email"):
            attendees.append(interview["candidate_email"])
        for item in interview.get("interviewers") or []:
            if item.get("interviewer_email"):
                attendees.append(item["interviewer_email"])
        if interview.get("interviewer_email") and interview["interviewer_email"] not in attendees:
            attendees.append(interview["interviewer_email"])

        return build_ics(
            uid=f"{interview_id}@hirelogics",
            start_utc=start,
            end_utc=end,
            summary=f"Interview: {interview.get('candidate_name', 'Candidate')} – {interview.get('job_title', '')}".strip(),
            description=interview.get("notes") or "",
            location=interview.get("meeting_link") or interview.get("location") or "",
            attendee_emails=attendees,
            sequence=len(interview.get("reschedule_history") or []),
            cancelled=interview.get("status") == CANCELLED,
        )


async def stage_suggestion(
    interviews_repo,
    jobs_repo,
    candidate_id: str,
    job_id: str,
) -> Optional[Dict[str, Any]]:
    """
    Read-only: the next-stage suggestion for one candidate and job, or None. Never moves the candidate.
    The job's defined rounds set how many must be completed.
    """
    from app.utils.hiring_stage import candidate_stage
    from app.utils.pipeline_suggestion import suggest_next_stage

    job = await jobs_repo.get_by_id(job_id)
    if not job:
        raise NotFoundError("Job opening not found.")
    interviews = await interviews_repo.find_many(
        query={"candidate_id": candidate_id, "job_id": job_id},
        limit=500,
    )
    return suggest_next_stage(
        required_rounds=len(job.get("rounds") or []),
        interviews=interviews,
        current_stage=candidate_stage(interviews),
    )
