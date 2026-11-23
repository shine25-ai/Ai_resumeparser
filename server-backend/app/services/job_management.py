"""
Job management (SRS 4.4, Screens 5 and 6): job codes, the full job form, the status workflow with optional
approval, status history, duplicate / archive, job templates and the hiring progress of each job.

Workflow (actions on a job):
    DRAFT ──submit──▶ PENDING_APPROVAL ──approve──▶ OPEN (Published)
      │                     └──reject──▶ DRAFT
      └──publish──▶ OPEN       (directly, when approval is off or the person may approve)
    OPEN ──close──▶ CLOSED ──reopen──▶ OPEN
    DRAFT / CLOSED ──archive──▶ ARCHIVED ──restore──▶ DRAFT
Every change is kept in the job's status_history.
"""

import csv
import io
import re
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_next_sequence
from app.core.exceptions import AuthorizationError, BadRequestError, ConflictError, NotFoundError
from app.core.tenant import current_company_id
from app.models.company import DEFAULT_COMPANY_ID
from app.models.job_opening import (
    JOB_STATUS_ARCHIVED,
    JOB_STATUS_CLOSED,
    JOB_STATUS_DRAFT,
    JOB_STATUS_LABELS,
    JOB_STATUS_OPEN,
    JOB_STATUS_PENDING,
    SALARY_PERIODS,
    WORK_MODES,
    JobOpeningDocument,
    with_job_defaults,
)
from app.utils.constants import COMPANIES_COLLECTION, INTERVIEWS_COLLECTION, JOB_APPLICATIONS_COLLECTION, JOB_OPENINGS_COLLECTION
from app.utils.helpers import generate_uuid, utc_now

JOB_TEMPLATES_COLLECTION = "job_templates"
MAX_IMPORT_ROWS = 200
# Job import/export columns -> job fields.
CSV_FIELDS = {
    "Title": "title", "Department": "department", "Category": "category", "Location": "location",
    "Employment type": "employment_type", "Work mode": "work_mode", "Experience min": "experience_min",
    "Experience max": "experience_max", "Vacancies": "open_positions", "Primary skills": "primary_skills",
    "Secondary skills": "secondary_skills", "Salary min": "salary_min", "Salary max": "salary_max",
    "Currency": "salary_currency", "Closing date": "closing_date", "Description": "description",
}
CSV_COLUMNS = list(CSV_FIELDS)


def _fmt(n: Any) -> str:
    if n is None:
        return ""
    return str(int(n)) if float(n).is_integer() else str(n)

LIST_FIELDS = (
    "responsibilities", "qualifications", "certifications", "primary_skills", "secondary_skills",
    "what_we_offer", "tags", "requirements", "nice_to_have",
)
TEXT_FIELDS = {
    "title": 200, "department": 200, "location": 200, "employment_type": 100, "description": 5000,
    "category": 120, "work_mode": 20, "notice_period": 60, "additional_requirements": 2000, "salary_currency": 3,
    "tagline": 200, "salary_period": 10,
}
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# action -> (allowed from, to, permission needed)
TRANSITIONS: Dict[str, Tuple[Tuple[str, ...], str, str]] = {
    "submit": ((JOB_STATUS_DRAFT,), JOB_STATUS_PENDING, "jobs:publish"),
    "publish": ((JOB_STATUS_DRAFT,), JOB_STATUS_OPEN, "jobs:publish"),
    "approve": ((JOB_STATUS_PENDING,), JOB_STATUS_OPEN, "jobs:approve"),
    "reject": ((JOB_STATUS_PENDING,), JOB_STATUS_DRAFT, "jobs:approve"),
    "close": ((JOB_STATUS_OPEN,), JOB_STATUS_CLOSED, "jobs:publish"),
    "reopen": ((JOB_STATUS_CLOSED,), JOB_STATUS_OPEN, "jobs:publish"),
    "archive": ((JOB_STATUS_DRAFT, JOB_STATUS_CLOSED, JOB_STATUS_PENDING), JOB_STATUS_ARCHIVED, "jobs:delete"),
    "restore": ((JOB_STATUS_ARCHIVED,), JOB_STATUS_DRAFT, "jobs:edit"),
}


def _clean_list(values: Any, limit: int = 40, item_len: int = 300) -> List[str]:
    seen, out = set(), []
    for value in values or []:
        item = str(value).strip().lstrip("-•*").strip()[:item_len]
        if item and item.lower() not in seen:
            seen.add(item.lower())
            out.append(item)
    return out[:limit]


def _num(value: Any, field: str, cast=float) -> Optional[Any]:
    if value in (None, ""):
        return None
    try:
        n = cast(value)
    except (TypeError, ValueError):
        raise BadRequestError(f"{field} must be a number.")
    if n < 0:
        raise BadRequestError(f"{field} cannot be negative.")
    return n


def experience_text(lo: Optional[float], hi: Optional[float]) -> str:
    """2, 5 -> '2-5 years'; 3, None -> '3+ years'."""
    def fmt(n: float) -> str:
        return str(int(n)) if float(n).is_integer() else str(n)

    if lo is None and hi is None:
        return ""
    if hi is None:
        return f"{fmt(lo)}+ years"
    if lo is None or lo == 0:
        return f"Up to {fmt(hi)} years" if lo is None else f"0-{fmt(hi)} years"
    return f"{fmt(lo)}-{fmt(hi)} years"


def clean_job(data: Dict[str, Any], partial: bool = False) -> Dict[str, Any]:
    """Validate the job form. With `partial`, only the fields given."""
    out: Dict[str, Any] = {}
    for field, limit in TEXT_FIELDS.items():
        if field in data and data[field] is not None:
            out[field] = str(data[field]).strip()[:limit]
    if not partial or "title" in data:
        if not out.get("title"):
            raise BadRequestError("Job title is required.")
    if out.get("work_mode") and out["work_mode"] not in WORK_MODES:
        raise BadRequestError("Work mode must be Onsite, Hybrid or Remote.")
    if out.get("salary_period") and out["salary_period"] not in SALARY_PERIODS:
        raise BadRequestError("Salary period must be year, month or hour.")
    if "salary_currency" in out:
        out["salary_currency"] = (out["salary_currency"] or "INR").upper()
    for field in LIST_FIELDS:
        if field in data and data[field] is not None:
            out[field] = _clean_list(data[field])
    # Required/preferred skills (the careers page) follow primary/secondary; older clients send the old names.
    if "primary_skills" not in out and data.get("required_skills") is not None:
        out["primary_skills"] = _clean_list(data["required_skills"])
    if "secondary_skills" not in out and data.get("preferred_skills") is not None:
        out["secondary_skills"] = _clean_list(data["preferred_skills"])
    if "primary_skills" in out:
        out["required_skills"] = list(out["primary_skills"])
    if "secondary_skills" in out:
        out["preferred_skills"] = list(out["secondary_skills"])

    for field in ("experience_min", "experience_max"):
        if field in data:
            out[field] = _num(data[field], field.replace("_", " "))
    for field in ("salary_min", "salary_max"):
        if field in data:
            out[field] = _num(data[field], field.replace("_", " "), int)
    if out.get("experience_min") is not None and out.get("experience_max") is not None and out["experience_min"] > out["experience_max"]:
        raise BadRequestError("Minimum experience is more than the maximum.")
    if out.get("salary_min") is not None and out.get("salary_max") is not None and out["salary_min"] > out["salary_max"]:
        raise BadRequestError("Minimum salary is more than the maximum.")
    if "experience_min" in out or "experience_max" in out:
        out["experience"] = experience_text(out.get("experience_min"), out.get("experience_max"))
    elif "experience" in data and data["experience"] is not None:
        out["experience"] = str(data["experience"]).strip()[:100]

    if "open_positions" in data and data["open_positions"] is not None:
        n = _num(data["open_positions"], "Vacancies", int)
        if n > 10000:
            raise BadRequestError("Vacancies must be 10,000 or fewer.")
        out["open_positions"] = n
    for flag in ("show_salary", "send_candidate_confirmation", "accept_applications"):
        if flag in data and data[flag] is not None:
            out[flag] = bool(data[flag])
    if "closing_date" in data:
        d = (data["closing_date"] or "").strip()
        if d and not DATE.match(d):
            raise BadRequestError("Closing date must look like 2026-12-31.")
        out["closing_date"] = d or None
    if "notify_emails" in data and data["notify_emails"] is not None:
        emails = [e.lower() for e in _clean_list(data["notify_emails"], 10, 120)]
        bad = [e for e in emails if not EMAIL.match(e)]
        if bad:
            raise BadRequestError(f"Not an email address: {', '.join(bad)}")
        out["notify_emails"] = emails
    if "hiring_manager" in data:
        hm = data["hiring_manager"] or None
        out["hiring_manager"] = {"id": str(hm.get("id") or ""), "name": str(hm.get("name") or "")[:120]} if hm else None
    if "rounds" in data and data["rounds"] is not None:
        rounds = []
        for i, r in enumerate(list(data["rounds"])[:10]):
            name = str((r or {}).get("name") or "").strip()[:80]
            if not name:
                raise BadRequestError(f"Round {i + 1} needs a name.")
            minutes = _num((r or {}).get("duration_minutes") or 60, "Round duration", int)
            if not 10 <= minutes <= 480:
                raise BadRequestError("Round duration must be between 10 and 480 minutes.")
            rounds.append({
                "order": i + 1,
                "name": name,
                "interview_type": str((r or {}).get("interview_type") or "").strip()[:60],
                "duration_minutes": minutes,
            })
        out["rounds"] = rounds
    return out


def is_accepting(job: Dict[str, Any], today: Optional[str] = None) -> bool:
    """Published, taking applications, positions left and not past its closing date."""
    if job.get("status") != JOB_STATUS_OPEN or job.get("accept_applications") is False:
        return False
    if (job.get("open_positions") or 0) <= 0:
        return False
    closing = job.get("closing_date")
    return not closing or closing >= (today or date.today().isoformat())


def _can(user: Dict[str, Any], permission: str) -> bool:
    from app.core.dependencies import can

    return can(user, permission)


def _actor(user: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    user = user or {}
    return {"id": user.get("id"), "name": user.get("full_name") or user.get("email") or "System"}


class JobManagementService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    @property
    def jobs(self):
        return self.db[JOB_OPENINGS_COLLECTION]

    async def _company(self) -> Dict[str, Any]:
        company_id = current_company_id() or DEFAULT_COMPANY_ID
        return await self.db[COMPANIES_COLLECTION].find_one({"id": company_id}) or {"id": company_id, "name": ""}

    async def settings(self) -> Dict[str, Any]:
        company = await self._company()
        return {"require_approval": bool((company.get("job_settings") or {}).get("require_approval"))}

    async def save_settings(self, require_approval: bool) -> Dict[str, Any]:
        company = await self._company()
        job_settings = {**(company.get("job_settings") or {}), "require_approval": bool(require_approval)}
        await self.db[COMPANIES_COLLECTION].update_one({"id": company["id"]}, {"$set": {"job_settings": job_settings}})
        return {"require_approval": bool(require_approval)}

    async def _next_code(self, company_id: str) -> str:
        n = await get_next_sequence(self.db, f"job_code:{company_id}")
        return f"JOB-{n:04d}"

    async def _get(self, job_id: str) -> Dict[str, Any]:
        job = await self.jobs.find_one({"id": job_id})
        if not job:
            raise NotFoundError("Job opening not found.")
        return job

    # ── Read ─────────────────────────────────────────────────────────────────

    async def list(self, include_archived: bool = False) -> List[Dict[str, Any]]:
        query: Dict[str, Any] = {} if include_archived else {"status": {"$ne": JOB_STATUS_ARCHIVED}}
        jobs = await self.jobs.find(query, {"_id": 0}).sort("created_at", -1).to_list(length=1000)
        company = await self._company()
        stats = await self._progress([j["id"] for j in jobs])
        out = []
        for job in jobs:
            if not job.get("code"):
                # Jobs from before job codes get one the first time they are listed.
                job["code"] = await self._next_code(company["id"])
                await self.jobs.update_one({"id": job["id"]}, {"$set": {"code": job["code"]}})
            item = with_job_defaults(job)
            item.update(stats.get(job["id"], {"applications_count": 0, "interviews_count": 0, "selected_count": 0}))
            item["accepting"] = is_accepting(item)
            out.append(item)
        return out

    async def get(self, job_id: str) -> Dict[str, Any]:
        job = with_job_defaults(await self._get(job_id))
        job.update((await self._progress([job_id])).get(job_id, {"applications_count": 0, "interviews_count": 0, "selected_count": 0}))
        job["accepting"] = is_accepting(job)
        return job

    async def stats(self) -> Dict[str, Any]:
        """Summary cards on the job list (Screen 5): jobs per status and applications in all."""
        jobs = await self.jobs.find({}, {"_id": 0, "id": 1, "status": 1}).to_list(length=None)
        by_status = {st: 0 for st in JOB_STATUS_LABELS}
        for j in jobs:
            by_status[j.get("status") or JOB_STATUS_OPEN] = by_status.get(j.get("status") or JOB_STATUS_OPEN, 0) + 1
        applications = await self.db[JOB_APPLICATIONS_COLLECTION].count_documents({})
        return {
            "total": sum(v for k, v in by_status.items() if k != JOB_STATUS_ARCHIVED),
            "active": by_status[JOB_STATUS_OPEN],
            "draft": by_status[JOB_STATUS_DRAFT],
            "pending_approval": by_status[JOB_STATUS_PENDING],
            "closed": by_status[JOB_STATUS_CLOSED],
            "archived": by_status[JOB_STATUS_ARCHIVED],
            "applications": applications,
            # Needs hire dates, which the pipeline (Phase 7) records. None until then.
            "avg_days_to_hire": None,
        }

    async def export_csv(self, include_archived: bool = False) -> str:
        jobs = await self.list(include_archived=include_archived)
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(CSV_COLUMNS + ["Code", "Status", "Applications", "Interviews", "Selected", "Created"])
        for j in jobs:
            w.writerow([
                j.get("title", ""), j.get("department", ""), j.get("category", ""), j.get("location", ""),
                j.get("employment_type", ""), j.get("work_mode", ""), _fmt(j.get("experience_min")), _fmt(j.get("experience_max")),
                j.get("open_positions", 1), "; ".join(j.get("primary_skills") or []), "; ".join(j.get("secondary_skills") or []),
                _fmt(j.get("salary_min")), _fmt(j.get("salary_max")), j.get("salary_currency", ""), j.get("closing_date") or "",
                j.get("description", ""),
                j.get("code", ""), j.get("status_label", ""), j.get("applications_count", 0), j.get("interviews_count", 0),
                j.get("selected_count", 0), (j.get("created_at") or "")[:10],
            ])
        return buf.getvalue()

    async def import_csv(self, text: str, user: Dict[str, Any]) -> Dict[str, Any]:
        """Each row becomes a draft job. Rows with problems are skipped and reported."""
        rows = list(csv.DictReader(io.StringIO(text)))
        if not rows:
            raise BadRequestError("The file has no rows. Use the template's column names in the first row.")
        if len(rows) > MAX_IMPORT_ROWS:
            raise BadRequestError(f"Import at most {MAX_IMPORT_ROWS} jobs at a time.")
        created, errors = [], []
        for n, row in enumerate(rows, start=2):
            row = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
            data = {field: row.get(col.lower(), "") for col, field in CSV_FIELDS.items()}
            for f in ("primary_skills", "secondary_skills"):
                data[f] = [x for x in re.split(r"[;,]", data[f]) if x.strip()]
            data["open_positions"] = data["open_positions"] or 1
            if not data["closing_date"]:
                data.pop("closing_date")
            try:
                job = await self.create(data, user)
                created.append({"row": n, "id": job["id"], "code": job["code"], "title": job["title"]})
            except BadRequestError as e:
                errors.append({"row": n, "message": e.message})
        return {"created": created, "errors": errors}

    async def _progress(self, job_ids: List[str]) -> Dict[str, Dict[str, int]]:
        """Applications, interviews and selected candidates per job."""
        if not job_ids:
            return {}
        out: Dict[str, Dict[str, int]] = {j: {"applications_count": 0, "interviews_count": 0, "selected_count": 0} for j in job_ids}
        apps = await self.db[JOB_APPLICATIONS_COLLECTION].find({"opening_id": {"$in": job_ids}}, {"opening_id": 1}).to_list(length=None)
        for a in apps:
            out[a["opening_id"]]["applications_count"] += 1
        interviews = await self.db[INTERVIEWS_COLLECTION].find(
            {"job_id": {"$in": job_ids}}, {"job_id": 1, "candidate_id": 1, "recommendation": 1, "outcome": 1, "status": 1}
        ).to_list(length=None)
        selected: Dict[str, set] = {}
        for i in interviews:
            out[i["job_id"]]["interviews_count"] += 1
            verdict = f"{i.get('recommendation') or ''} {i.get('outcome') or ''}".lower()
            if "select" in verdict or "hire" in verdict:
                selected.setdefault(i["job_id"], set()).add(i.get("candidate_id"))
        for job_id, people in selected.items():
            out[job_id]["selected_count"] = len(people)
        return out

    # ── Create / edit ────────────────────────────────────────────────────────

    async def create(self, data: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
        """New jobs start as drafts. `publish: true` also publishes (or sends for approval)."""
        fields = clean_job(data)
        company = await self._company()
        doc = JobOpeningDocument(
            **fields,
            company_id=company["id"],
            company_name=company.get("name"),
            status=JOB_STATUS_DRAFT,
            code=await self._next_code(company["id"]),
            created_by=_actor(user),
            status_history=[{"from": None, "to": JOB_STATUS_DRAFT, "at": utc_now().isoformat(), "by": _actor(user), "note": "Created"}],
        ).to_dict()
        await self.jobs.insert_one(dict(doc))
        if data.get("publish"):
            return await self.act(doc["id"], "publish", user)
        return await self.get(doc["id"])

    async def update(self, job_id: str, data: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
        job = await self._get(job_id)
        if job.get("status") == JOB_STATUS_ARCHIVED:
            raise BadRequestError("Restore this job before editing it.")
        changes = clean_job(data, partial=True)
        # Older screens change status with a plain edit; route it through the workflow.
        status = data.get("status")
        if changes:
            changes["updated_at"] = utc_now().isoformat()
            await self.jobs.update_one({"id": job_id}, {"$set": changes})
        if status and status != job.get("status"):
            action = {JOB_STATUS_OPEN: "reopen" if job.get("status") == JOB_STATUS_CLOSED else "publish", JOB_STATUS_CLOSED: "close"}.get(status)
            if not action:
                raise BadRequestError("Use the job actions to change its status.")
            return await self.act(job_id, action, user)
        return await self.get(job_id)

    async def duplicate(self, job_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
        job = with_job_defaults(await self._get(job_id))
        keep = {k: job[k] for k in JobOpeningDocument.model_fields if k in job}
        for k in ("id", "code", "status", "status_history", "created_at", "updated_at", "published_at", "closed_at", "created_by"):
            keep.pop(k, None)
        keep["title"] = f"Copy of {job['title']}"[:200]
        return await self.create(keep, user)

    # ── Workflow ─────────────────────────────────────────────────────────────

    async def act(self, job_id: str, action: str, user: Dict[str, Any], note: str = "") -> Dict[str, Any]:
        if action not in TRANSITIONS:
            raise BadRequestError(f"Unknown action '{action}'.")
        job = await self._get(job_id)
        allowed_from, target, permission = TRANSITIONS[action]

        # Publishing goes through approval when the company asks for it, unless this person may approve.
        if action == "publish" and (await self.settings())["require_approval"] and not _can(user, "jobs:approve"):
            action, target = "submit", JOB_STATUS_PENDING
        if not _can(user, permission):
            raise AuthorizationError(f"You don't have permission to {action} jobs.")
        current = job.get("status") or JOB_STATUS_OPEN
        if current not in allowed_from:
            raise ConflictError(
                f"A {JOB_STATUS_LABELS.get(current, current).lower()} job can't be {_past(action)}."
            )
        if action == "reject" and not (note or "").strip():
            raise BadRequestError("Say why the job is sent back, so its author can fix it.")
        if target == JOB_STATUS_OPEN:
            missing = [label for key, label in (("description", "a description"), ("primary_skills", "primary skills")) if not job.get(key)]
            if missing:
                raise BadRequestError(f"Add {' and '.join(missing)} before publishing.")

        now = utc_now().isoformat()
        entry = {"from": current, "to": target, "action": action, "at": now, "by": _actor(user), "note": (note or "").strip()[:500]}
        changes: Dict[str, Any] = {"status": target, "updated_at": now}
        if target == JOB_STATUS_OPEN:
            changes["published_at"] = job.get("published_at") or now
            changes["closed_at"] = None
        if target == JOB_STATUS_CLOSED:
            changes["closed_at"] = now
        await self.jobs.update_one({"id": job_id}, {"$set": changes, "$push": {"status_history": entry}})
        return await self.get(job_id)

    # ── Templates ────────────────────────────────────────────────────────────

    @property
    def templates(self):
        return self.db[JOB_TEMPLATES_COLLECTION]

    async def list_templates(self) -> List[Dict[str, Any]]:
        return await self.templates.find({}, {"_id": 0}).sort("name", 1).to_list(length=200)

    async def save_template(self, name: str, data: Dict[str, Any], user: Dict[str, Any], from_job: Optional[str] = None) -> Dict[str, Any]:
        name = (name or "").strip()[:120]
        if not name:
            raise BadRequestError("Give the template a name.")
        if await self.templates.find_one({"name": name}):
            raise ConflictError(f"A template called '{name}' already exists.")
        if from_job:
            job = with_job_defaults(await self._get(from_job))
            data = {k: job[k] for k in JobOpeningDocument.model_fields if k in job}
        fields = clean_job({**data, "title": data.get("title") or name})
        for k in ("closing_date", "status", "code"):
            fields.pop(k, None)
        doc = {"id": generate_uuid(), "name": name, "job": fields, "created_by": _actor(user), "created_at": utc_now().isoformat()}
        await self.templates.insert_one(dict(doc))
        return doc

    async def delete_template(self, template_id: str) -> None:
        if not await self.templates.find_one({"id": template_id}):
            raise NotFoundError("Template not found.")
        await self.templates.delete_one({"id": template_id})


def _past(action: str) -> str:
    return {
        "submit": "sent for approval", "publish": "published", "approve": "approved", "reject": "sent back",
        "close": "closed", "reopen": "reopened", "archive": "archived", "restore": "restored",
    }[action]
