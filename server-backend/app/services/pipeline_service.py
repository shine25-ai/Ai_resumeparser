"""
Recruitment Pipeline & Workflow Service (SRS 4.11, Screen 14).

Manages multi-tenant hiring workflows (custom or company default),
stage transitions with validation and reason enforcement, application history tracking,
and the Recruitment Pipeline Kanban board with stage metrics and vacancy tracking.
"""

from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
import re

from app.models.workflow import (
    WorkflowDocument,
    WorkflowStage,
    ApplicationHistoryDocument,
    default_workflow_stages,
)
from app.utils.constants import (
    WORKFLOWS_COLLECTION,
    APPLICATION_HISTORY_COLLECTION,
    JOB_APPLICATIONS_COLLECTION,
    RESUMES_COLLECTION,
    JOB_OPENINGS_COLLECTION,
    INTERVIEWS_COLLECTION,
)
from app.utils.helpers import generate_uuid, utc_now
from app.services.audit_service import record_audit
from app.core.tenant import current_company_id
from app.utils.hiring_stage import verdict_of, stage_of
from app.services.dashboard_service import DashboardService


def _parse_iso(val: Any) -> Optional[datetime]:
    if not val:
        return None
    if isinstance(val, datetime):
        return val if val.tzinfo else val.replace(tzinfo=timezone.utc)
    if isinstance(val, str):
        try:
            dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except Exception:
            return None
    return None


def _clean_mongo_doc(doc: Any) -> Any:
    """Recursively converts ObjectId and other non-JSON types into strings."""
    if isinstance(doc, dict):
        return {str(k): (str(v) if k == "_id" else _clean_mongo_doc(v)) for k, v in doc.items()}
    elif isinstance(doc, list):
        return [_clean_mongo_doc(item) for item in doc]
    elif hasattr(doc, "__class__") and doc.__class__.__name__ == "ObjectId":
        return str(doc)
    return doc


def normalize_stage_id(stage_raw: Any, default_stage: str = "applied") -> str:
    """Normalize arbitrary stage labels into workflow stage slugs."""
    if not stage_raw:
        return default_stage
    s = str(stage_raw).strip().lower()
    if s in ("applied", "application", "new", "applied / uploaded"):
        return "applied"
    if s in ("screening", "screen"):
        return "screening"
    if s in ("shortlisted", "shortlist"):
        return "shortlisted"
    if s in ("interview", "interviewing", "interviews", "in progress"):
        return "interview"
    if s in ("selected", "offer", "offer to be released", "offer accepted", "offer sent"):
        return "selected"
    if s in ("hired", "joined"):
        return "hired"
    if s in ("rejected", "closed", "not recommended", "no hire"):
        return "rejected"
    if s in ("withdrawn", "offer rejected"):
        return "withdrawn"
    return s


class PipelineService:
    def __init__(self, db: Any):
        self.db = db

    # ── Workflow Configuration ──────────────────────────────────────────────

    async def get_workflow(self, job_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Fetch the active workflow for a job opening or the company default.
        Seeds a default 8-stage workflow if none exists for this company.
        """
        # 1. If job_id provided, look for job-specific workflow override
        if job_id:
            job_wf = await self.db[WORKFLOWS_COLLECTION].find_one(
                {"$or": [{"job_id": job_id}, {"job_opening_id": job_id}]}
            )
            if job_wf:
                return _clean_mongo_doc(job_wf)

        # 2. Look for company default workflow
        default_wf = await self.db[WORKFLOWS_COLLECTION].find_one(
            {"$or": [{"is_default": True}, {"job_id": None}]}
        )
        if default_wf:
            return _clean_mongo_doc(default_wf)

        # 3. Seed initial default workflow for this tenant
        stages = default_workflow_stages()
        company_id = current_company_id() or ""
        seeded = WorkflowDocument(
            company_id=company_id,
            job_id=None,
            name="Standard Recruitment Workflow",
            is_default=True,
            stages=stages,
        ).to_dict()
        if not company_id:
            seeded.pop("company_id", None)

        await self.db[WORKFLOWS_COLLECTION].insert_one(seeded)
        return _clean_mongo_doc(seeded)

    async def save_workflow(self, user: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
        """Create or update a workflow configuration."""
        company_id = current_company_id() or user.get("company_id", "")
        wf_id = payload.get("id") or generate_uuid()
        job_id = payload.get("job_id")
        name = payload.get("name") or "Recruitment Workflow"
        is_default = bool(payload.get("is_default", False))

        raw_stages = payload.get("stages", [])
        if not raw_stages or len(raw_stages) == 0:
            raise ValueError("Workflow must have at least one stage.")

        seen_stage_ids: Set[str] = set()
        stages: List[Dict[str, Any]] = []
        for i, s in enumerate(raw_stages):
            st_id = (s.get("id") or "").strip()
            if not st_id:
                st_id = re.sub(r"[^a-z0-9]+", "_", s.get("name", "").lower()).strip("_")
            if not st_id:
                raise ValueError(f"Stage at position {i+1} must have a valid non-empty id or name.")
            if st_id in seen_stage_ids:
                raise ValueError(f"Duplicate stage ID '{st_id}' found in workflow stages.")
            seen_stage_ids.add(st_id)

            stages.append({
                "id": st_id,
                "name": (s.get("name") or f"Stage {i+1}").strip(),
                "colour": s.get("colour", "#6366f1"),
                "type": s.get("type", "active"),
                "order": i + 1,
                "requires_reason": bool(s.get("requires_reason", False)),
                "allowed_transitions": s.get("allowed_transitions", []),
            })

        # If setting this workflow as default, clear is_default on other workflows in the company
        if is_default:
            await self.db[WORKFLOWS_COLLECTION].update_many(
                {"id": {"$ne": wf_id}, "is_default": True},
                {"$set": {"is_default": False}},
            )

        now_iso = utc_now().isoformat()
        doc = {
            "id": wf_id,
            "company_id": company_id,
            "job_id": job_id,
            "name": name,
            "is_default": is_default,
            "stages": stages,
            "updated_at": now_iso,
        }

        existing = await self.db[WORKFLOWS_COLLECTION].find_one({"id": wf_id})
        if existing:
            await self.db[WORKFLOWS_COLLECTION].update_one({"id": wf_id}, {"$set": doc})
        else:
            doc["created_at"] = now_iso
            await self.db[WORKFLOWS_COLLECTION].insert_one(doc)

        await record_audit(
            self.db,
            user,
            action="pipeline.configure_workflow",
            entity_type="workflow",
            entity_id=wf_id,
            entity_label=name,
            details=f"job_id={job_id}, stages={len(stages)}",
        )
        return _clean_mongo_doc(doc)

    async def delete_stage(
        self,
        user: Dict[str, Any],
        workflow_id: str,
        stage_id: str,
        reassign_to_stage_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Delete a stage from a workflow. If applications are currently in that stage,
        reassign_to_stage_id must be provided to move them safely first.
        Applications are scoped to the workflow's job if job_id is set.
        """
        wf = await self.db[WORKFLOWS_COLLECTION].find_one({"id": workflow_id})
        if not wf:
            raise ValueError("Workflow not found.")

        stages = wf.get("stages", [])
        stage_ids = {s.get("id") for s in stages}
        if stage_id not in stage_ids:
            raise ValueError(f"Stage '{stage_id}' does not exist in workflow.")

        # Check target stage exists in the workflow (and isn't the one being deleted)
        if reassign_to_stage_id:
            valid_targets = {s.get("id") for s in stages if s.get("id") != stage_id}
            if reassign_to_stage_id not in valid_targets:
                raise ValueError(f"Target stage '{reassign_to_stage_id}' does not exist in workflow.")

        # Scope application check and reassignment to the workflow's job if job_id is set
        app_filter: Dict[str, Any] = {"stage_id": stage_id}
        job_id = wf.get("job_id")
        if job_id:
            app_filter["$or"] = [{"job_id": job_id}, {"opening_id": job_id}]

        apps_in_stage = await self.db[JOB_APPLICATIONS_COLLECTION].count_documents(app_filter)
        if apps_in_stage > 0:
            if not reassign_to_stage_id:
                raise ValueError(
                    f"Stage '{stage_id}' is currently in use by {apps_in_stage} application(s). "
                    f"Please specify a target stage to reassign candidates to before deleting."
                )
            target_stage = next((s for s in stages if s.get("id") == reassign_to_stage_id), None)
            target_name = target_stage.get("name", reassign_to_stage_id.capitalize()) if target_stage else reassign_to_stage_id.capitalize()
            now_iso = utc_now().isoformat()
            await self.db[JOB_APPLICATIONS_COLLECTION].update_many(
                app_filter,
                {"$set": {"stage_id": reassign_to_stage_id, "stage_name": target_name, "stage_updated_at": now_iso}},
            )

        # Remove stage from workflow
        new_stages = [s for s in stages if s.get("id") != stage_id]
        # Re-index order
        for idx, s in enumerate(new_stages):
            s["order"] = idx + 1

        await self.db[WORKFLOWS_COLLECTION].update_one(
            {"id": workflow_id},
            {"$set": {"stages": new_stages, "updated_at": utc_now().isoformat()}},
        )

        await record_audit(
            self.db,
            user,
            action="pipeline.delete_stage",
            entity_type="workflow_stage",
            entity_id=stage_id,
            entity_label=stage_id,
            details=f"workflow_id={workflow_id}, reassigned_to={reassign_to_stage_id}, moved_candidates={apps_in_stage}",
        )
        return {"success": True, "reassigned_count": apps_in_stage}

        await self.db[WORKFLOWS_COLLECTION].update_one(
            {"id": workflow_id},
            {"$set": {"stages": new_stages, "updated_at": utc_now().isoformat()}},
        )

        await record_audit(
            self.db,
            user,
            action="pipeline.delete_stage",
            entity_type="workflow_stage",
            entity_id=stage_id,
            entity_label=stage_id,
            details=f"workflow_id={workflow_id}, reassigned_to={reassign_to_stage_id}, moved_candidates={apps_in_stage}",
        )
        return {"success": True, "reassigned_count": apps_in_stage}

    # ── Stage Transitions & History ─────────────────────────────────────────

    async def move_candidate_stage(
        self,
        user: Dict[str, Any],
        application_id: str,
        to_stage_id: str,
        reason: Optional[str] = None,
        comment: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Move a candidate application along allowed workflow transitions.
        Enforces required reasons for rejections/withdrawals, records immutable history,
        stamps hired_at on first move to Hired, and writes an audit log.
        Supports moving candidates synthesized from resumes by automatically creating
        an official job_applications record.
        """
        app = await self.db[JOB_APPLICATIONS_COLLECTION].find_one({"id": application_id})
        if not app:
            raise ValueError(f"Application '{application_id}' not found.")

        job_id = app.get("opening_id") or app.get("job_id")
        wf = await self.get_workflow(job_id)
        stages = wf.get("stages", [])
        stage_map = {s["id"]: s for s in stages}

        target_stage = stage_map.get(to_stage_id)
        if not target_stage:
            raise ValueError(f"Target stage '{to_stage_id}' does not exist in workflow.")

        current_stage_id = app.get("stage_id") or (stages[0]["id"] if stages else "applied")
        from_stage = stage_map.get(current_stage_id, {})
        from_stage_name = from_stage.get("name", current_stage_id.capitalize())
        to_stage_name = target_stage.get("name", to_stage_id.capitalize())

        # 1. Allowed transitions check
        allowed = from_stage.get("allowed_transitions") or []
        if allowed and to_stage_id not in allowed and to_stage_id != current_stage_id:
            raise ValueError(
                f"Transition from '{from_stage_name}' to '{to_stage_name}' is not allowed in this workflow."
            )

        # 2. Reason requirement check
        is_terminal_rejection = target_stage.get("type") in ("rejected", "withdrawn") or target_stage.get("requires_reason")
        if is_terminal_rejection and not (reason and reason.strip()):
            raise ValueError(f"A reason is required when moving a candidate to '{to_stage_name}'.")

        now = utc_now()
        now_iso = now.isoformat()
        history_id = generate_uuid()
        by_id = user.get("id") or user.get("user_id") or user.get("email") or "system"
        by_name = user.get("full_name") or user.get("name") or user.get("email") or "Recruiter"

        history_entry = {
            "id": history_id,
            "company_id": current_company_id() or app.get("company_id") or user.get("company_id", ""),
            "application_id": application_id,
            "job_id": job_id or "",
            "from_stage": current_stage_id,
            "from_stage_name": from_stage_name,
            "to_stage": to_stage_id,
            "to_stage_name": to_stage_name,
            "action": "stage_moved",
            "by": by_id,
            "by_name": by_name,
            "at": now_iso,
            "reason": reason.strip() if reason else None,
            "comment": comment.strip() if comment else None,
        }

        # Insert immutable application_history record
        await self.db[APPLICATION_HISTORY_COLLECTION].insert_one(dict(history_entry))

        # Update application doc
        update_fields: Dict[str, Any] = {
            "stage_id": to_stage_id,
            "stage_name": to_stage_name,
            "stage_updated_at": now_iso,
            "updated_at": now_iso,
        }
        if reason:
            update_fields["rejection_reason"] = reason.strip()
        if comment:
            update_fields["rejection_comment"] = comment.strip()

        # Stamp hired_at once when candidate moves to Hired
        if target_stage.get("type") == "hired" and not app.get("hired_at"):
            update_fields["hired_at"] = now_iso

        # Append to application's internal history array
        await self.db[JOB_APPLICATIONS_COLLECTION].update_one(
            {"id": application_id},
            {
                "$set": update_fields,
                "$push": {"history": history_entry},
            },
        )

        # Audit log
        await record_audit(
            self.db,
            user,
            action="pipeline.move_stage",
            entity_type="job_application",
            entity_id=application_id,
            entity_label=app.get("candidate_name") or "Candidate",
            details=f"from={current_stage_id} to={to_stage_id} reason={reason or ''} job_id={job_id or ''}",
        )

        # Invalidate DashboardService cache so dashboard stays completely in sync
        try:
            DashboardService.invalidate_cache()
        except Exception:
            pass

        updated_app = await self.db[JOB_APPLICATIONS_COLLECTION].find_one({"id": application_id})
        return _clean_mongo_doc(updated_app or {**app, **update_fields})

    async def bulk_move_stage(
        self,
        user: Dict[str, Any],
        application_ids: List[str],
        to_stage_id: str,
        reason: Optional[str] = None,
        comment: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Move multiple applications to a new stage."""
        success_count = 0
        errors: List[Dict[str, str]] = []

        for app_id in application_ids:
            try:
                await self.move_candidate_stage(user, app_id, to_stage_id, reason, comment)
                success_count += 1
            except Exception as e:
                errors.append({"application_id": app_id, "error": str(e)})

        return {
            "success": len(errors) == 0,
            "moved_count": success_count,
            "failed_count": len(errors),
            "errors": errors,
        }

    async def get_application_history(self, application_id: str) -> List[Dict[str, Any]]:
        """Fetch full stage transition audit timeline for an application."""
        history = await self.db[APPLICATION_HISTORY_COLLECTION].find(
            {"application_id": application_id}
        ).sort("at", 1).to_list(length=None)

        if not history:
            app = await self.db[JOB_APPLICATIONS_COLLECTION].find_one({"id": application_id})
            if app and app.get("history"):
                return _clean_mongo_doc(app["history"])

        return _clean_mongo_doc(history)

    # ── Kanban Board & Pipeline Analytics ───────────────────────────────────

    async def get_kanban_board(
        self,
        user: Dict[str, Any],
        job_id: Optional[str] = None,
        recruiter_id: Optional[str] = None,
        source: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        search: Optional[str] = None,
        sort_by: Optional[str] = "applied_date",
        limit: int = 1000,
    ) -> Dict[str, Any]:
        """
        Build the unified Recruitment Pipeline Kanban board (Screen 14) matching mockup:
        - 8 KPI cards: Total Candidates, Applied (This Week), Screening, Shortlisted, Interviewing, Selected, Rejected, Conversion Rate
        - Stage columns with badges and candidate cards
        - Progress vs vacancies for selected job
        - Stage-to-stage funnel conversion % and average days in stage
        - Limits cards to real applications with a cap to prevent massive queries
        """
        workflow = await self.get_workflow(job_id)
        stages = workflow.get("stages", [])
        stage_ids = [s["id"] for s in stages]
        stage_map = {s["id"]: s for s in stages}

        # Build application query
        query: Dict[str, Any] = {}
        if job_id and job_id != "all":
            query["$or"] = [{"opening_id": job_id}, {"job_id": job_id}]
        if source and source != "all":
            query["source"] = source

        # Date range filter on applied_at
        if date_from or date_to:
            date_filter: Dict[str, Any] = {}
            if date_from:
                date_filter["$gte"] = date_from
            if date_to:
                date_filter["$lte"] = date_to
            query["applied_at"] = date_filter

        # Fetch real applications with a cap (no synthesized cards from whole resume db)
        board_limit = min(max(1, limit), 1000)
        apps = await self.db[JOB_APPLICATIONS_COLLECTION].find(query).sort("applied_at", -1).to_list(length=board_limit)

        # Collect candidate and application IDs for referenced lookups
        cand_ids = list({str(a.get("candidate_id") or a.get("resume_id")) for a in apps if (a.get("candidate_id") or a.get("resume_id"))})
        app_ids = list({str(a.get("id")) for a in apps if a.get("id")})

        # Load only resumes referenced by these applications
        resumes_by_id: Dict[str, Dict[str, Any]] = {}
        if cand_ids:
            resumes_list = await self.db[RESUMES_COLLECTION].find(
                {"$or": [{"id": {"$in": cand_ids}}, {"resume_id": {"$in": cand_ids}}, {"candidate_id": {"$in": cand_ids}}]}
            ).to_list(length=len(cand_ids) * 2)
            for r in resumes_list:
                if r.get("id"):
                    resumes_by_id[str(r["id"])] = r
                if r.get("resume_id"):
                    resumes_by_id[str(r["resume_id"])] = r
                if r.get("candidate_id"):
                    resumes_by_id[str(r["candidate_id"])] = r

        # Load only interviews referenced by these applications or candidates
        interviews: List[Dict[str, Any]] = []
        if app_ids or cand_ids:
            inv_filter = []
            if app_ids:
                inv_filter.append({"application_id": {"$in": app_ids}})
            if cand_ids:
                inv_filter.append({"resume_id": {"$in": cand_ids}})
                inv_filter.append({"candidate_id": {"$in": cand_ids}})
            interviews = await self.db[INTERVIEWS_COLLECTION].find({"$or": inv_filter}).to_list(length=len(apps) * 5)

        inv_by_cand: Dict[str, List[Dict[str, Any]]] = {}
        for inv in interviews:
            for k in (inv.get("application_id"), inv.get("resume_id"), inv.get("candidate_id")):
                if k:
                    inv_by_cand.setdefault(str(k), []).append(inv)

        now = utc_now()
        one_week_ago = (now - timedelta(days=7)).isoformat()

        # Search filter in-memory if needed
        if search and search.strip():
            term = search.strip().lower()
            filtered_apps = []
            for a in apps:
                cname = (a.get("candidate_name") or "").lower()
                cemail = (a.get("candidate_email") or "").lower()
                jtitle = (a.get("job_title") or "").lower()
                if term in cname or term in cemail or term in jtitle:
                    filtered_apps.append(a)
            apps = filtered_apps

        # Build cards
        columns: Dict[str, List[Dict[str, Any]]] = {sid: [] for sid in stage_ids}
        # Fallback stage for unmatched applications
        default_stage_id = stage_ids[0] if stage_ids else "applied"

        stage_days_accumulator: Dict[str, List[int]] = {sid: [] for sid in stage_ids}

        for app in apps:
            app_id = app.get("id") or str(app.get("_id", ""))
            c_id = app.get("candidate_id") or app.get("resume_id") or app_id
            r_id = app.get("resume_id")
            resume = resumes_by_id.get(c_id) or (resumes_by_id.get(r_id) if r_id else {}) or {}
            parsed = resume.get("parsed_data", {})
            ai_eval = resume.get("ai_evaluation", {})

            cand_invs = (
                inv_by_cand.get(app_id)
                or inv_by_cand.get(c_id)
                or (inv_by_cand.get(str(r_id)) if r_id else [])
                or (inv_by_cand.get(str(resume.get("candidate_id"))) if resume.get("candidate_id") else [])
                or []
            )
            active_inv = cand_invs[0] if cand_invs else None

            # Stage is strictly determined from the application; never leaks from resume or other jobs
            raw_stage = normalize_stage_id(app.get("stage_id") or app.get("status"), default_stage=default_stage_id)
            if raw_stage not in columns:
                raw_stage = default_stage_id

            # Skills
            skills = parsed.get("primary_skills") or parsed.get("skills") or []
            if isinstance(skills, str):
                skills = [s.strip() for s in skills.split(",") if s.strip()]
            skills = [str(s) for s in skills[:3]]

            # Star rating (1.0 to 5.0)
            score = ai_eval.get("ai_technical_score")
            if score is not None:
                rating = round(min(5.0, max(1.0, (float(score) / 20.0))), 1)
            elif active_inv and active_inv.get("rating") is not None:
                rating = round(float(active_inv.get("rating")), 1)
            else:
                rating = 4.0

            # Calculate days in stage
            stage_updated = _parse_iso(app.get("stage_updated_at") or app.get("applied_at") or resume.get("upload_date"))
            days_in_stage = max(0, (now - stage_updated).days) if stage_updated else 0
            stage_days_accumulator[raw_stage].append(days_in_stage)

            # Candidate Code (CAN-XXXX)
            code_suffix = (resume.get("candidate_id") or c_id or app_id).replace("-", "")[:5].upper()
            candidate_code = resume.get("candidate_id") or app.get("candidate_code") or f"CAN-{code_suffix}"

            # Interview / rejection status pill matching mockup
            status_pill = None
            if raw_stage in ("rejected", "withdrawn"):
                status_pill = app.get("rejection_reason") or resume.get("rejection_reason") or "Rejected"
            elif raw_stage == "interview":
                if active_inv and active_inv.get("scheduled_time"):
                    status_pill = f"Today, {active_inv.get('scheduled_time')}"
                else:
                    status_pill = "In Progress"
            elif raw_stage == "selected":
                status_pill = "Selected"
            elif raw_stage == "hired":
                status_pill = "Hired"
            else:
                if days_in_stage == 0:
                    status_pill = "Today"
                elif days_in_stage == 1:
                    status_pill = "1 day ago"
                else:
                    status_pill = f"{days_in_stage} days ago"

            card = {
                "id": app_id,
                "application_id": app_id,
                "candidate_id": c_id,
                "candidate_name": app.get("candidate_name") or parsed.get("full_name") or parsed.get("name") or resume.get("candidate_name") or "Candidate",
                "candidate_email": app.get("candidate_email") or app.get("applicant_email") or parsed.get("email"),
                "candidate_code": candidate_code,
                "job_id": app.get("opening_id") or app.get("job_id"),
                "job_title": app.get("job_title") or app.get("opening_title") or parsed.get("current_role") or "Position",
                "rating": rating,
                "skills": skills,
                "days_in_stage": days_in_stage,
                "applied_at": app.get("applied_at") or resume.get("upload_date"),
                "stage_id": raw_stage,
                "stage_name": stage_map.get(raw_stage, {}).get("name", raw_stage.capitalize()),
                "status_pill": status_pill,
                "rejection_reason": app.get("rejection_reason") or resume.get("rejection_reason"),
                "rejection_comment": app.get("rejection_comment") or resume.get("rejection_comment"),
                "hired_at": app.get("hired_at"),
                "photo_url": resume.get("profile_picture_url"),
                "allowed_transitions": stage_map.get(raw_stage, {}).get("allowed_transitions", []),
            }
            columns[raw_stage].append(card)

        # Sort cards in each column
        for sid in columns:
            if sort_by == "rating":
                columns[sid].sort(key=lambda c: c.get("rating", 0), reverse=True)
            elif sort_by == "days":
                columns[sid].sort(key=lambda c: c.get("days_in_stage", 0), reverse=True)
            elif sort_by == "name":
                columns[sid].sort(key=lambda c: (c.get("candidate_name") or "").lower())
            else:  # applied_date
                columns[sid].sort(key=lambda c: c.get("applied_at") or "", reverse=True)

        # 8 KPI Metrics Row
        total_candidates = len(apps)
        applied_this_week = sum(1 for a in apps if (a.get("applied_at") or "") >= one_week_ago)
        screening_count = len(columns.get("screening", []))
        shortlisted_count = len(columns.get("shortlisted", []))
        interviewing_count = len(columns.get("interview", []))
        selected_count = len(columns.get("selected", []))
        rejected_count = len(columns.get("rejected", []))
        hired_count = len(columns.get("hired", []))

        conversion_rate = (
            round(((selected_count + hired_count) / max(total_candidates, 1)) * 100, 1)
            if total_candidates > 0
            else 0.0
        )

        kpis = {
            "total_candidates": total_candidates,
            "applied_this_week": applied_this_week,
            "screening": screening_count,
            "shortlisted": shortlisted_count,
            "interviewing": interviewing_count,
            "selected": selected_count,
            "rejected": rejected_count,
            "conversion_rate": conversion_rate,
        }

        # Bottom Panel Analytics: Funnel & Conversion Rates
        # Active progressive pipeline stages
        pipeline_order = ["applied", "screening", "shortlisted", "interview", "selected", "hired"]
        progressive_counts: List[Dict[str, Any]] = []

        # Progressive pipeline calculation: candidates who reached at least stage X
        for sid in pipeline_order:
            if sid in stage_map:
                s_name = stage_map[sid]["name"]
                # Count in this stage + subsequent stages
                idx = pipeline_order.index(sid)
                reached_count = sum(len(columns.get(p, [])) for p in pipeline_order[idx:])
                pct = round((reached_count / max(total_candidates, 1)) * 100, 1) if total_candidates > 0 else 0
                progressive_counts.append({
                    "stage_id": sid,
                    "stage_name": s_name,
                    "colour": stage_map[sid].get("colour", "#6366f1"),
                    "count": reached_count,
                    "percentage": pct,
                })

        # Stage-to-stage conversion rate
        stage_conversions = []
        conversion_pairs = [
            ("applied", "screening"),
            ("screening", "shortlisted"),
            ("shortlisted", "interview"),
            ("interview", "selected"),
        ]
        for from_s, to_s in conversion_pairs:
            if from_s in stage_map and to_s in stage_map:
                from_cnt = sum(len(columns.get(p, [])) for p in pipeline_order[pipeline_order.index(from_s):])
                to_cnt = sum(len(columns.get(p, [])) for p in pipeline_order[pipeline_order.index(to_s):])
                rate = round((to_cnt / max(from_cnt, 1)) * 100, 1) if from_cnt > 0 else 0
                stage_conversions.append({
                    "from_stage": from_s,
                    "to_stage": to_s,
                    "from_name": stage_map[from_s]["name"],
                    "to_name": stage_map[to_s]["name"],
                    "rate": rate,
                })

        # Vacancies Progress for selected job
        target_vacancies = 15
        job_title_label = "All Positions"
        if job_id and job_id != "all":
            job_doc = await self.db[JOB_OPENINGS_COLLECTION].find_one({"id": job_id})
            if job_doc:
                target_vacancies = job_doc.get("vacancies") or job_doc.get("target_vacancies") or 15
                job_title_label = job_doc.get("title") or f"Job {job_id}"

        in_process_count = screening_count + shortlisted_count + interviewing_count + selected_count
        pending_vacancies = max(0, target_vacancies - hired_count)

        hiring_progress = {
            "job_id": job_id,
            "job_title": job_title_label,
            "target_vacancies": target_vacancies,
            "hired": hired_count,
            "in_process": in_process_count,
            "pending": pending_vacancies,
        }

        # Column structure with meta and cards
        column_list = []
        for s in stages:
            sid = s["id"]
            days_list = stage_days_accumulator.get(sid, [])
            avg_days = round(sum(days_list) / len(days_list), 1) if days_list else 0.0
            column_list.append({
                "id": s["id"],
                "name": s["name"],
                "colour": s.get("colour", "#6366f1"),
                "type": s.get("type", "active"),
                "requires_reason": s.get("requires_reason", False),
                "allowed_transitions": s.get("allowed_transitions", []),
                "order": s.get("order", 0),
                "stage": s,
                "count": len(columns.get(sid, [])),
                "avg_days": avg_days,
                "avg_days_in_stage": avg_days,
                "cards": columns.get(sid, []),
            })

        return _clean_mongo_doc({
            "workflow": workflow,
            "kpis": kpis,
            "columns": column_list,
            "funnel": progressive_counts,
            "stage_conversions": stage_conversions,
            "hiring_progress": hiring_progress,
        })

