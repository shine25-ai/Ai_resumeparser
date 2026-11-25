"""
Candidate applications (SRS 4.8 and 4.9, Screen 18): the 5-step apply form on the careers page, with AI pre-fill.

Candidate side (no accounts: the emailed code gives an applicant token, as before):
  1. Upload the resume  -> a draft. The file goes to the AI parser straight away.
  2. Ask for the draft  -> while the parser works: "processing"; then the details it read, in the form's shape,
                           with a confidence score. The form fills empty fields from it.
  3. Submit             -> the details the candidate checked and corrected, plus consent. The candidate profile is
                           built from the same parser job (the resume is not parsed twice). If this exact resume is
                           already on file at the company, the application is linked to that profile.
The form itself is kept on the candidate's device until they submit ("Save as draft").

Staff side: the list of applications, one application with what the candidate entered next to what the AI read
(and how sure it was), "mark reviewed", "use the candidate's corrections on the profile" and "read the resume again".

Applications live in `job_applications` (one per candidate and job). Each carries `candidate_id`, the ID of the
record in `candidates` (Phase 6); the resume keeps its CND code in `candidate_id` and points at the candidate
with `candidate_ref`.
"""

import hashlib
import io
import json
import os
import re
import secrets
from datetime import timedelta
from typing import Any, Dict, List, Optional, Tuple

import httpx
from fastapi import BackgroundTasks, UploadFile
from motor.motor_asyncio import AsyncIOMotorDatabase
from starlette.datastructures import Headers

from app.core.config import settings
from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.job_opening import (
    REVIEW_DONE,
    REVIEW_PENDING,
    JobApplicationDocument,
)
from app.services.candidate_service import link_resume_to_candidate
from app.utils.constants import JOB_APPLICATIONS_COLLECTION, RESUMES_COLLECTION
from app.utils.helpers import sanitize_filename, utc_now

DRAFTS_COLLECTION = "application_drafts"
DRAFT_DAYS = 7
CONSENT_VERSION = "2026-11"
CONSENT_TEXT = "I confirm that the information provided is true and correct, and I agree to the Privacy Policy and Terms of Use."

PARSE_QUEUED = "queued"
PARSE_PROCESSING = "processing"
PARSE_DONE = "done"
PARSE_FAILED = "failed"
PARSE_UNAVAILABLE = "unavailable"   # the parser couldn't be reached; the candidate fills the form by hand

NOTICE_PERIODS = ("Immediate", "15 Days", "30 Days", "45 Days", "60 Days", "90 Days", "More than 90 Days")
URL = re.compile(r"^https?://[^\s]+$", re.I)
PHONE = re.compile(r"^[0-9+()\-\s]{6,20}$")
YEAR = re.compile(r"^(19|20)\d{2}$")
MONTH = re.compile(r"^(19|20)\d{2}(-(0[1-9]|1[0-2]))?$")

# ── The form ──────────────────────────────────────────────────────────────────


def _t(value: Any, limit: int) -> str:
    return str(value or "").strip()[:limit]


def _url(value: Any, field: str) -> str:
    v = _t(value, 300)
    if v and not URL.match(v):
        if "." in v and " " not in v:
            v = "https://" + v
        else:
            raise BadRequestError(f"{field} must be a link such as https://…")
    return v


def _num(value: Any, field: str, lo: float = 0, hi: float = 1e12) -> Optional[float]:
    if value in (None, ""):
        return None
    try:
        n = float(str(value).replace(",", ""))
    except ValueError:
        raise BadRequestError(f"{field} must be a number.")
    if n < lo or n > hi:
        raise BadRequestError(f"{field} is out of range.")
    return int(n) if n.is_integer() else round(n, 1)


def _list(values: Any, limit: int, item_len: int) -> List[str]:
    out: List[str] = []
    for v in values or []:
        item = _t(v, item_len)
        if item and item.lower() not in {x.lower() for x in out}:
            out.append(item)
    return out[:limit]


def empty_form() -> Dict[str, Any]:
    return {
        "personal": {"full_name": "", "email": "", "phone_code": "+91", "phone": "", "location": "", "linkedin": "", "portfolio": ""},
        "notice_period": "", "expected_ctc": None, "current_ctc": None, "currency": "INR", "total_experience_years": None,
        "education": [], "experience": [], "skills": [], "certifications": [], "heard_from": "", "cover_note": "",
    }


def clean_form(data: Dict[str, Any], email: str, require: bool = True) -> Dict[str, Any]:
    """Validate the application form. The email is always the verified one."""
    data = data or {}
    p = data.get("personal") or {}
    form = empty_form()
    personal = form["personal"]
    personal.update({
        "full_name": _t(p.get("full_name"), 100),
        "email": email,
        "phone_code": _t(p.get("phone_code"), 6) or "+91",
        "phone": _t(p.get("phone"), 20),
        "location": _t(p.get("location"), 120),
        "linkedin": _url(p.get("linkedin"), "LinkedIn profile"),
        "portfolio": _url(p.get("portfolio"), "Portfolio / GitHub"),
    })
    if personal["phone"] and not PHONE.match(personal["phone"]):
        raise BadRequestError("Enter a valid mobile number.")
    form["notice_period"] = _t(data.get("notice_period"), 40)
    form["expected_ctc"] = _num(data.get("expected_ctc"), "Expected CTC")
    form["current_ctc"] = _num(data.get("current_ctc"), "Current CTC")
    form["currency"] = (_t(data.get("currency"), 3) or "INR").upper()
    form["total_experience_years"] = _num(data.get("total_experience_years"), "Total experience", 0, 60)

    for e in list(data.get("education") or [])[:10]:
        e = e or {}
        item = {
            "degree": _t(e.get("degree"), 120), "specialization": _t(e.get("specialization"), 120),
            "institution": _t(e.get("institution"), 160), "year": _t(e.get("year"), 4), "score": _t(e.get("score"), 20),
        }
        if not (item["degree"] or item["institution"]):
            continue
        if item["year"] and not YEAR.match(item["year"]):
            raise BadRequestError(f"Year of passing for {item['degree'] or item['institution']} must be like 2019.")
        form["education"].append(item)

    for x in list(data.get("experience") or [])[:20]:
        x = x or {}
        item = {
            "company": _t(x.get("company"), 160), "designation": _t(x.get("designation"), 120),
            "start": _t(x.get("start"), 7), "end": _t(x.get("end"), 7), "current": bool(x.get("current")),
            "responsibilities": _t(x.get("responsibilities"), 2000),
        }
        if not (item["company"] or item["designation"]):
            continue
        for k in ("start", "end"):
            if item[k] and not MONTH.match(item[k]):
                raise BadRequestError(f"Dates for {item['company'] or item['designation']} must be like 2021-06.")
        if item["current"]:
            item["end"] = ""
        if item["start"] and item["end"] and item["start"] > item["end"]:
            raise BadRequestError(f"The start date at {item['company'] or item['designation']} is after the end date.")
        form["experience"].append(item)

    form["skills"] = _list(data.get("skills"), 50, 60)
    form["certifications"] = _list(data.get("certifications"), 20, 120)
    form["heard_from"] = _t(data.get("heard_from"), 100)
    form["cover_note"] = _t(data.get("cover_note"), 2000)

    if require:
        missing = [label for ok, label in (
            (personal["full_name"], "full name"), (personal["phone"], "mobile number"), (personal["location"], "current location"),
            (form["notice_period"], "notice period"), (form["expected_ctc"] is not None, "expected CTC"),
        ) if not ok]
        if missing:
            raise BadRequestError(f"Please add your {', '.join(missing)}.")
    return form


# ── What the AI read, in the form's shape ─────────────────────────────────────

SKILL_KEYS = ("primary_skills", "programming_languages", "frameworks", "databases", "cloud_tech",
              "devops_and_infrastructure", "other_technologies", "functional_skills")


def _ym(value: Any) -> str:
    v = _t(value, 10)
    if v.lower() == "present":
        return ""
    return v[:7] if MONTH.match(v[:7]) else (v[:4] if YEAR.match(v[:4]) else "")


def map_parsed(parsed: Dict[str, Any]) -> Dict[str, Any]:
    """The parser's resume, as application form fields (only what it found)."""
    parsed = parsed if isinstance(parsed, dict) else {}
    form = empty_form()
    phone = _t(parsed.get("phone"), 30)
    code = ""
    m = re.match(r"^\s*(\+\d{1,3})[\s-]*(.*)$", phone)
    if m:
        code, phone = m.group(1), m.group(2)
    form["personal"].update({
        "full_name": _t(parsed.get("full_name"), 100) if parsed.get("full_name") != "Processing..." else "",
        "email": _t(parsed.get("email"), 120).lower(),
        "phone_code": code or "+91",
        "phone": re.sub(r"[^0-9+()\-\s]", "", phone)[:20],
        "location": _t(parsed.get("location"), 120),
        "linkedin": _t(parsed.get("linkedin"), 300),
    })
    years = parsed.get("total_experience_years")
    form["total_experience_years"] = round(float(years), 1) if isinstance(years, (int, float)) and years > 0 else None
    for e in parsed.get("education") or []:
        if isinstance(e, dict) and (e.get("degree") or e.get("institution")):
            year = _t(e.get("year_of_passing"), 10)
            form["education"].append({
                "degree": _t(e.get("degree"), 120), "specialization": _t(e.get("specialization"), 120),
                "institution": _t(e.get("institution"), 160), "year": year[:4] if YEAR.match(year[:4]) else "",
                "score": _t(e.get("score"), 20),
            })
    for x in parsed.get("experience") or []:
        if isinstance(x, dict) and (x.get("company") or x.get("designation")):
            end_raw = _t(x.get("end_date"), 10)
            form["experience"].append({
                "company": _t(x.get("company"), 160), "designation": _t(x.get("designation"), 120),
                "start": _ym(x.get("start_date")), "end": _ym(end_raw), "current": end_raw.lower() == "present",
                "responsibilities": _t(x.get("responsibilities"), 2000),
            })
    skills: List[str] = []
    for key in SKILL_KEYS:
        for s in parsed.get(key) or []:
            s = _t(s, 60)
            if s and s.lower() not in {x.lower() for x in skills}:
                skills.append(s)
    form["skills"] = skills[:40]
    form["certifications"] = _list([c.get("name") for c in parsed.get("certifications") or [] if isinstance(c, dict)], 20, 120)
    return form


def confidence_of(extracted: Dict[str, Any], verified_email: str) -> Dict[str, Any]:
    """How much of the resume the AI could read, as a score and per field. The parser gives no scores of its own,
    so this counts what it found; the email it read is checked against the verified one."""
    p = extracted.get("personal") or {}
    fields = {
        "full_name": bool(p.get("full_name")),
        "email": bool(p.get("email")),
        "phone": bool(p.get("phone")),
        "location": bool(p.get("location")),
        "education": bool(extracted.get("education")),
        "experience": bool(extracted.get("experience")),
        "skills": len(extracted.get("skills") or []) >= 3,
    }
    score = round(sum(fields.values()) / len(fields), 2)
    level = "high" if score >= 0.8 else "medium" if score >= 0.5 else "low"
    email_matches = not p.get("email") or p.get("email", "").lower() == (verified_email or "").lower()
    return {"score": score, "level": level, "fields": fields, "email_matches": email_matches}


def summary_of(extracted: Dict[str, Any]) -> Dict[str, Any]:
    """The mockup's "Quick extracted summary": total experience, highest education, top skills."""
    edu = extracted.get("education") or []
    best = sorted(edu, key=lambda e: e.get("year") or "", reverse=True)[0] if edu else None
    return {
        "total_experience_years": extracted.get("total_experience_years"),
        "highest_education": " – ".join(x for x in ((best or {}).get("degree", ""), (best or {}).get("specialization", "")) if x),
        "top_skills": (extracted.get("skills") or [])[:6],
    }


# Labels for the staff review comparison.
COMPARE = [
    ("full_name", "Full name"), ("phone", "Mobile number"), ("location", "Current location"), ("linkedin", "LinkedIn"),
    ("total_experience_years", "Total experience (years)"), ("skills", "Skills"), ("education", "Education"),
    ("experience", "Experience"),
]


def _value(form: Dict[str, Any], key: str) -> Any:
    p = form.get("personal") or {}
    if key in p:
        return p.get(key)
    return form.get(key)


def _norm(v: Any) -> str:
    if isinstance(v, list):
        return json.dumps(sorted(json.dumps(x, sort_keys=True).lower() for x in v))
    return re.sub(r"\s+", " ", str(v if v is not None else "")).strip().lower()


def comparison(form: Dict[str, Any], extracted: Dict[str, Any]) -> List[Dict[str, Any]]:
    rows = []
    for key, label in COMPARE:
        entered, read = _value(form, key), _value(extracted, key)
        if key == "phone":
            entered = re.sub(r"\D", "", str(entered or ""))[-10:]
            read = re.sub(r"\D", "", str(read or ""))[-10:]
        if entered in (None, "", []) and read in (None, "", []):
            continue
        rows.append({
            "field": key, "label": label, "entered": _value(form, key), "extracted": _value(extracted, key),
            "same": _norm(entered) == _norm(read), "missing_from_resume": read in (None, "", []),
        })
    return rows


# ── Parser ────────────────────────────────────────────────────────────────────


async def _ai_config() -> Dict[str, Any]:
    try:
        from app.repositories.settings_repository import SettingsRepository
        from app.utils.encryption import decrypt_password

        cfg = await SettingsRepository().get_ai_config()
        if not cfg:
            return {}
        return {"provider": cfg.provider, "model_name": cfg.model_name,
                "api_key": decrypt_password(cfg.api_key) if cfg.api_key else "", "base_url": cfg.base_url}
    except Exception:
        return {}


async def send_to_parser(content: bytes, filename: str, content_type: str) -> Tuple[str, str]:
    """(parser job id, status). The status is `unavailable` when the parser can't be reached."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(
                settings.AI_PARSER_URL,
                files={"file": (filename, io.BytesIO(content), content_type)},
                data={"ai_config": json.dumps(await _ai_config())},
            )
            r.raise_for_status()
            job = r.json().get("job_id")
        return (str(job), PARSE_QUEUED) if job else ("", PARSE_UNAVAILABLE)
    except (httpx.HTTPError, ValueError):
        return "", PARSE_UNAVAILABLE


async def parser_status(job_id: str) -> Tuple[str, Dict[str, Any], str]:
    """(status, parsed resume, error) for a parser job, checked once."""
    url = settings.AI_PARSER_URL.replace("/upload", f"/status/{job_id}")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(url)
            if r.status_code == 404:
                return PARSE_FAILED, {}, "The resume reader lost this file. Upload it again."
            r.raise_for_status()
            data = r.json()
    except (httpx.HTTPError, ValueError):
        return PARSE_PROCESSING, {}, ""
    state = data.get("status")
    if state == "completed":
        return PARSE_DONE, data.get("parsed_resume") or {}, ""
    if state == "error":
        return PARSE_FAILED, {}, "We couldn't read this resume automatically. Please fill in your details."
    return (PARSE_QUEUED if state == "queued" else PARSE_PROCESSING), {}, ""


# ── Service ───────────────────────────────────────────────────────────────────



DEFAULT_STAGE_ID = "applied"


def stage_of(a: Dict[str, Any]) -> Dict[str, str]:
    """The application's pipeline stage (Phase 7): its id and the name to show. Older applications are "Applied"."""
    stage_id = a.get("stage_id") or str(a.get("stage") or DEFAULT_STAGE_ID).strip().lower().replace(" ", "_")
    name = a.get("stage_name") or stage_id.replace("_", " ").title()
    return {"stage_id": stage_id, "stage_name": name}


class ApplicationService:
    def __init__(self, db: AsyncIOMotorDatabase, resume_service: Any = None, upload_dir: Optional[str] = None,
                 parse=send_to_parser, status=parser_status):
        self.db = db
        if resume_service is None:
            try:
                from app.repositories.resume_log_repository import ResumeLogRepository
                from app.repositories.resume_repository import ResumeRepository
                from app.services.resume_service import ResumeService
                resume_service = ResumeService(ResumeRepository(db), resume_log_repo=ResumeLogRepository(db))
            except Exception:
                resume_service = None
        self.resume_service = resume_service
        self.upload_dir = upload_dir or str(getattr(resume_service, "upload_dir", "") or "uploads")
        self.parse = parse
        self.status = status

    @property
    def drafts(self):
        return self.db[DRAFTS_COLLECTION]

    @property
    def applications(self):
        return self.db[JOB_APPLICATIONS_COLLECTION]

    # ── Candidate: resume draft ──────────────────────────────────────────────

    async def upload_resume(self, opening: Dict[str, Any], email: str, file: UploadFile) -> Dict[str, Any]:
        from app.utils.validators import validate_uploaded_file

        if not file.filename:
            raise BadRequestError("Choose a resume file.")
        content = await validate_uploaded_file(file)
        name = sanitize_filename(file.filename)
        draft_id = secrets.token_urlsafe(16)
        os.makedirs(self.upload_dir, exist_ok=True)
        path = os.path.join(self.upload_dir, f"draft_{draft_id}_{name}")
        with open(path, "wb") as f:
            f.write(content)

        # The same file uploaded again for this job reuses its earlier parse: no new parse, no quota use, no
        # extra storage. A different file is parsed (and counted) as usual.
        from app.services.limit_service import LimitService
        limit_svc = LimitService(self.db)
        cid = opening.get("company_id")
        file_hash = hashlib.sha256(content).hexdigest()
        previous = await self.drafts.find_one({"opening_id": opening["id"], "email": email})
        reuse = bool(previous and previous.get("file_hash") == file_hash and previous.get("parser_job_id")
                     and previous.get("parse_status") not in (PARSE_FAILED, PARSE_UNAVAILABLE, "skipped"))
        if reuse:
            job_id, state = previous["parser_job_id"], previous["parse_status"]
        elif await limit_svc.can_parse_ai(cid):
            job_id, state = await self.parse(content, name, file.content_type or "application/octet-stream")
            if cid:
                await limit_svc.increment_ai_parses(cid)
        else:
            job_id, state = None, "skipped"
            if cid:
                from app.services.notification_service import NotificationService
                await NotificationService(self.db).create_notification(
                    company_id=cid,
                    title="AI Parse Limit Reached on Application",
                    message=f"Application received for '{opening.get('title', 'job')}' from {email}, but AI parsing was skipped because monthly AI parse quota has been reached.",
                    notification_type="limit",
                    link="/applications",
                )
        if cid:
            # The new draft replaces the old one, so storage changes by the difference
            await limit_svc.record_storage_bytes(cid, len(content) - int((previous or {}).get("size") or 0))

        now = utc_now()
        # One draft per candidate and job: a new upload replaces the old one.
        await self._drop_drafts({"opening_id": opening["id"], "email": email})
        doc = {
            "id": draft_id, "opening_id": opening["id"], "email": email, "file_path": path, "filename": name,
            "content_type": file.content_type or "application/octet-stream", "file_hash": file_hash,
            "size": len(content), "parser_job_id": job_id, "parse_status": state, "parse_error": "",
            "extracted": ((previous or {}).get("extracted") or {}) if reuse else {},
            "confidence": ((previous or {}).get("confidence") or {}) if reuse else {}, "created_at": now.isoformat(),
            "expires_at": (now + timedelta(days=DRAFT_DAYS)).isoformat(),
        }
        await self.drafts.insert_one(dict(doc))
        return self._draft_view(doc)

    async def draft(self, draft_id: str, email: str) -> Dict[str, Any]:
        doc = await self._own_draft(draft_id, email)
        if doc["parse_status"] in (PARSE_QUEUED, PARSE_PROCESSING) and doc.get("parser_job_id"):
            state, parsed, error = await self.status(doc["parser_job_id"])
            changes: Dict[str, Any] = {"parse_status": state, "parse_error": error}
            if state == PARSE_DONE:
                extracted = map_parsed(parsed)
                changes.update({"extracted": extracted, "confidence": confidence_of(extracted, email)})
            await self.drafts.update_one({"id": draft_id}, {"$set": changes})
            doc.update(changes)
        return self._draft_view(doc)

    @staticmethod
    def _draft_view(doc: Dict[str, Any]) -> Dict[str, Any]:
        done = doc["parse_status"] == PARSE_DONE
        return {
            "draft_id": doc["id"], "filename": doc["filename"], "size": doc.get("size", 0),
            "parse_status": doc["parse_status"], "parse_error": doc.get("parse_error", ""),
            "extracted": doc.get("extracted") if done else None,
            "confidence": doc.get("confidence") if done else None,
            "summary": summary_of(doc.get("extracted") or {}) if done else None,
            "expires_at": doc.get("expires_at"),
        }

    async def _own_draft(self, draft_id: str, email: str) -> Dict[str, Any]:
        doc = await self.drafts.find_one({"id": draft_id})
        if not doc or doc.get("email") != email:
            raise NotFoundError("This resume upload has expired. Please upload your resume again.")
        if doc.get("expires_at", "") < utc_now().isoformat():
            await self._drop_drafts({"id": draft_id})
            raise NotFoundError("This resume upload has expired. Please upload your resume again.")
        return doc

    async def _drop_drafts(self, query: Dict[str, Any]) -> None:
        for d in await self.drafts.find(query).to_list(length=50):
            try:
                os.remove(d.get("file_path") or "")
            except OSError:
                pass
            await self.drafts.delete_one({"id": d["id"]})

    # ── Candidate: submit ────────────────────────────────────────────────────

    async def submit(
        self,
        opening: Dict[str, Any],
        company: Dict[str, Any],
        email: str,
        body: Dict[str, Any],
        background_tasks: BackgroundTasks,
        ip: str = "",
    ) -> Dict[str, Any]:
        from app.models.company import company_ref
        from app.repositories.company_repository import add_application_to_resume

        if not body.get("consent"):
            raise BadRequestError("Please confirm that your details are correct and accept the Privacy Policy.")
        form = clean_form(body.get("form") or {}, email)
        if await self.applications.find_one({"opening_id": opening["id"], "applicant_email": email}):
            raise ConflictError("You have already applied for this role.")
        draft = await self._own_draft(str(body.get("draft_id") or ""), email)
        if draft["opening_id"] != opening["id"]:
            raise BadRequestError("This resume was uploaded for another job. Please upload it again.")

        ref = company_ref(company)
        existing = await self.db[RESUMES_COLLECTION].find_one({"file_hash": draft["file_hash"]})
        linked = bool(existing)
        if existing:
            # The same resume is already on file here: one profile, one more application.
            resume_id = existing["id"]
        else:
            with open(draft["file_path"], "rb") as f:
                content = f.read()
            upload = UploadFile(file=io.BytesIO(content), filename=draft["filename"],
                                headers=Headers({"content-type": draft["content_type"]}))
            resume = await self.resume_service.upload_and_process_resume(
                user_id="public-applicant", file=upload, background_tasks=background_tasks,
                resume_source="Careers page", uploaded_by_email=email,
                parser_job_id=draft.get("parser_job_id") or None,
            )
            resume_id = resume.id
        now = utc_now().isoformat()
        await self.db[RESUMES_COLLECTION].update_one(
            {"id": resume_id},
            {"$set": {"applicant_email": email, "applicant_heard_from": form["heard_from"] or None,
                      "applicant_note": form["cover_note"] or None}},
        )
        # Phase 6: the application belongs to a candidate (same email in this company, else a new one).
        personal = form.get("personal") or {}
        first_job = (form.get("experience") or [{}])[0] or {}
        candidate_id = await link_resume_to_candidate(
            self.db, resume_id, source="Careers page", uploaded_by="public-applicant",
            details={
                "email": email,
                "full_name": personal.get("full_name"),
                "phone": personal.get("phone"),
                "location": personal.get("location"),
                "linkedin": personal.get("linkedin"),
                "portfolio": personal.get("portfolio"),
                "total_experience_years": form.get("total_experience_years"),
                "current_role": first_job.get("designation"),
                "skills": form.get("skills"),
            },
        )

        application = JobApplicationDocument(
            **ref,
            opening_id=opening["id"],
            opening_title=opening["title"],
            applicant_email=email,
            resume_id=resume_id,
            candidate_id=candidate_id,
            heard_from=form["heard_from"] or None,
            note=form["cover_note"] or None,
            form=form,
            extracted=draft.get("extracted") or {},
            confidence=draft.get("confidence") or {},
            consent={"accepted": True, "text": CONSENT_TEXT, "version": CONSENT_VERSION, "at": now, "ip": ip[:64]},
            history=[{"at": now, "action": "submitted", "by": email, "note": ""}],
            linked_existing_profile=linked,
        ).to_dict()
        await add_application_to_resume(self.db, resume_id, ref, opening["id"], opening["title"], application["submitted_at"])
        await self.applications.insert_one(dict(application))
        # The resume service saved its own copy of the file, so the draft and its file can go.
        await self._drop_drafts({"id": draft["id"]})
        return {
            "application_id": application["id"], "opening_title": opening["title"], "company_name": company.get("name"),
            "submitted_at": application["submitted_at"],
        }

    # ── Staff ─────────────────────────────────────────────────────────────────

    async def list(
        self, job_id: str = "", review: str = "", q: str = "", page: int = 1, limit: int = 25, stage: str = "",
    ) -> Dict[str, Any]:
        conditions: List[Dict[str, Any]] = []
        if job_id:
            conditions.append({"opening_id": job_id})
        if review == REVIEW_PENDING:
            conditions.append({"review.status": {"$ne": REVIEW_DONE}})
        elif review == REVIEW_DONE:
            conditions.append({"review.status": REVIEW_DONE})
        if q:
            rx = {"$regex": re.escape(q.strip()), "$options": "i"}
            conditions.append({"$or": [{"applicant_email": rx}, {"form.personal.full_name": rx}, {"opening_title": rx}]})
        if stage:
            # Applications sent before the pipeline (Phase 7) have no stage_id: they are still "applied".
            stage_q: List[Dict[str, Any]] = [{"stage_id": stage}]
            if stage == DEFAULT_STAGE_ID:
                stage_q += [{"stage_id": {"$exists": False}}, {"stage_id": None}]
            conditions.append({"$or": stage_q})
        query: Dict[str, Any] = {"$and": conditions} if len(conditions) > 1 else (conditions[0] if conditions else {})
        total = await self.applications.count_documents(query)
        rows = await self.applications.find(query, {"_id": 0}).sort("submitted_at", -1).skip((page - 1) * limit).limit(limit).to_list(length=limit)
        resumes = await self._resumes([r["resume_id"] for r in rows])
        return {"items": [self._row(a, resumes.get(a["resume_id"])) for a in rows], "total": total, "page": page, "limit": limit}

    async def _resumes(self, ids: List[str]) -> Dict[str, Dict[str, Any]]:
        if not ids:
            return {}
        docs = await self.db[RESUMES_COLLECTION].find(
            {"id": {"$in": ids}},
            {"_id": 0, "id": 1, "candidate_id": 1, "status": 1, "parsed_data": 1, "s3_url": 1, "original_filename": 1, "redirect_id": 1},
        ).to_list(length=len(ids))
        return {d["id"]: d for d in docs}

    @staticmethod
    def _row(a: Dict[str, Any], resume: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        form = a.get("form") or {}
        personal = form.get("personal") or {}
        parsed = (resume or {}).get("parsed_data") or {}
        return {
            "id": a["id"], "opening_id": a["opening_id"], "opening_title": a["opening_title"],
            "applicant_email": a["applicant_email"], "submitted_at": a["submitted_at"],
            "full_name": personal.get("full_name") or (parsed.get("full_name") if isinstance(parsed, dict) else None),
            "phone": " ".join(x for x in (personal.get("phone_code"), personal.get("phone")) if x) or (parsed.get("phone") if isinstance(parsed, dict) else None),
            "location": personal.get("location", ""),
            "total_experience_years": form.get("total_experience_years"),
            "notice_period": form.get("notice_period", ""),
            "expected_ctc": form.get("expected_ctc"),
            "stage": a.get("stage", "APPLIED"), **stage_of(a), "source": a.get("source") or "Careers page",
            "heard_from": a.get("heard_from"), "note": a.get("note"),
            "review_status": (a.get("review") or {}).get("status", REVIEW_PENDING),
            "confidence": a.get("confidence") or {},
            "resume_id": a["resume_id"],
            "candidate_id": a.get("candidate_id"),                  # the candidate record (Phase 6)
            "candidate_code": (resume or {}).get("candidate_id"),   # the resume's CND code, for display
            "resume_status": (resume or {}).get("status", "MERGED"),
            "full_form": bool(form),
        }

    async def get(self, application_id: str) -> Dict[str, Any]:
        a = await self.applications.find_one({"id": application_id}, {"_id": 0})
        if not a:
            raise NotFoundError("Application not found.")
        resume = (await self._resumes([a["resume_id"]])).get(a["resume_id"])
        extracted = a.get("extracted") or {}
        # Older applications (before the 5-step form) or a later re-read: compare with the profile as it is now.
        if resume and resume.get("parsed_data") and resume.get("status") == "PARSED":
            extracted = map_parsed(resume["parsed_data"])
        return {
            **self._row(a, resume),
            "form": a.get("form") or {},
            "extracted": extracted,
            "comparison": comparison(a.get("form") or {}, extracted) if a.get("form") else [],
            "consent": a.get("consent") or {},
            "review": a.get("review") or {"status": REVIEW_PENDING},
            "history": a.get("history") or [],
            "linked_existing_profile": bool(a.get("linked_existing_profile")),
            "resume": {
                "id": (resume or {}).get("id"), "status": (resume or {}).get("status"), "s3_url": (resume or {}).get("s3_url"),
                "filename": (resume or {}).get("original_filename"), "candidate_id": (resume or {}).get("candidate_id"),
            } if resume else None,
        }

    async def _log(self, application_id: str, action: str, user: Dict[str, Any], note: str = "", extra: Optional[Dict[str, Any]] = None):
        entry = {"at": utc_now().isoformat(), "action": action, "by": user.get("full_name") or user.get("email"), "note": note}
        await self.applications.update_one({"id": application_id}, {"$push": {"history": entry}, **({"$set": extra} if extra else {})})

    async def set_review(self, application_id: str, status: str, user: Dict[str, Any], note: str = "") -> Dict[str, Any]:
        if status not in (REVIEW_PENDING, REVIEW_DONE):
            raise BadRequestError("Review status must be pending or reviewed.")
        await self.get(application_id)
        review = {"status": status, "by": user.get("full_name") or user.get("email"), "at": utc_now().isoformat(), "note": _t(note, 500)}
        await self._log(application_id, "reviewed" if status == REVIEW_DONE else "review reopened", user, review["note"], {"review": review})
        return await self.get(application_id)

    async def apply_corrections(self, application_id: str, fields: List[str], user: Dict[str, Any]) -> Dict[str, Any]:
        """Put what the candidate entered on their profile, for the chosen fields (recorded as an HR update)."""
        a = await self.get(application_id)
        if not a["resume"] or not a["form"]:
            raise BadRequestError("There is nothing to copy for this application.")
        p = a["form"].get("personal") or {}
        values = {
            "full_name": p.get("full_name"),
            "phone": " ".join(x for x in (p.get("phone_code"), p.get("phone")) if x),
            "location": p.get("location"),
            "linkedin": p.get("linkedin"),
            "total_experience_years": a["form"].get("total_experience_years"),
            "skills": a["form"].get("skills"),
        }
        chosen = [f for f in fields if f in values and values[f] not in (None, "", [])]
        if not chosen:
            raise BadRequestError("Choose at least one detail to copy.")
        sets: Dict[str, Any] = {}
        for f in chosen:
            key = "primary_skills" if f == "skills" else f
            sets[f"parsed_data.{key}"] = values[f]
        resume_id = a["resume"]["id"]
        resume = await self.db[RESUMES_COLLECTION].find_one({"id": resume_id})
        parsed = dict((resume or {}).get("parsed_data") or {})
        for k, v in sets.items():
            parsed[k.split(".", 1)[1]] = v
        await self.db[RESUMES_COLLECTION].update_one(
            {"id": resume_id},
            {"$set": {"parsed_data": parsed, "updated_at": utc_now().isoformat()},
             "$push": {"hr_updates": {"at": utc_now().isoformat(), "by": user.get("full_name") or user.get("email"),
                                      "fields": chosen, "note": f"From application {application_id}"}}},
        )
        await self._log(application_id, "profile updated", user, ", ".join(chosen))
        return await self.get(application_id)

    async def reprocess(self, application_id: str, user: Dict[str, Any], background_tasks: BackgroundTasks) -> Dict[str, Any]:
        """Send the candidate's resume to the AI again (e.g. after the parser was improved or failed)."""
        a = await self.get(application_id)
        resume = await self.db[RESUMES_COLLECTION].find_one({"id": (a.get("resume") or {}).get("id")})
        if not resume:
            raise BadRequestError("The resume for this application was merged into another profile; reprocess that profile.")
        path = resume.get("file_path") or ""
        if not os.path.exists(path):
            if not resume.get("s3_url"):
                raise BadRequestError("The resume file isn't available on this server.")
            from app.services.s3_service import S3Service

            try:
                content = S3Service().download_file(resume["s3_url"])
            except Exception:
                raise BadRequestError("The resume file couldn't be fetched from storage.")
            os.makedirs(self.upload_dir, exist_ok=True)
            path = os.path.join(self.upload_dir, f"{resume['id']}_{resume.get('original_filename') or 'resume'}")
            with open(path, "wb") as f:
                f.write(content)
            await self.db[RESUMES_COLLECTION].update_one({"id": resume["id"]}, {"$set": {"file_path": path}})
        await self.db[RESUMES_COLLECTION].update_one({"id": resume["id"]}, {"$set": {"status": "PENDING"}})
        background_tasks.add_task(
            self.resume_service._process_ai_parsing_async,
            resume_id=resume["id"], user_id=user.get("id") or "staff", file_path=path,
            original_filename=resume.get("original_filename") or "resume.pdf",
            content_type="application/pdf" if path.lower().endswith(".pdf") else "application/octet-stream",
        )
        await self._log(application_id, "resume sent for reading again", user)
        return await self.get(application_id)


__all__ = [
    "ApplicationService", "clean_form", "map_parsed", "confidence_of", "summary_of", "comparison", "empty_form",
    "NOTICE_PERIODS", "CONSENT_TEXT",
]
