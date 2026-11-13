"""
Job opening service: public role listing, email-code verification for applicants, resume applications,
and admin management of openings and their applications.
"""

import asyncio
import hashlib
import hmac
import re
import secrets
import smtplib
from datetime import timedelta
from email.message import EmailMessage
from typing import Any, Dict, List, Optional

import jwt
from fastapi import BackgroundTasks, UploadFile
from loguru import logger

from app.core.config import settings
from app.core.exceptions import AuthenticationError, BadRequestError, ConflictError, NotFoundError
from app.core.security import decode_jwt_token
from app.models.company import (
    COMPANY_STATUS_ACTIVE,
    COMPANY_STATUS_INACTIVE,
    DEFAULT_COMPANY_ID,
    CompanyDocument,
    company_ref,
    default_company_doc,
    slugify,
)
from app.models.job_opening import (
    CAREERS_PAGE_DEFAULTS,
    JOB_STATUS_CLOSED,
    JOB_STATUS_OPEN,
    ApplicantVerificationDocument,
    JobApplicationDocument,
    JobOpeningDocument,
)
from app.repositories.company_repository import CompanyRepository, add_application_to_resume
from app.repositories.job_repository import (
    ApplicantVerificationRepository,
    CareersPageSettingsRepository,
    JobApplicationRepository,
    JobOpeningRepository,
)
from app.repositories.resume_repository import ResumeRepository
from app.repositories.settings_repository import SettingsRepository
from app.services.resume_service import ResumeService
from app.utils.encryption import decrypt_password
from app.utils.helpers import utc_now

CODE_TTL_MINUTES = 10
CODE_RESEND_COOLDOWN_SECONDS = 60
CODE_MAX_ATTEMPTS = 5
APPLICANT_TOKEN_MINUTES = 30
PUBLIC_APPLICANT_USER_ID = "public-applicant"
EMAIL_PATTERN = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")
# Role detail sections shown on the careers page; each is a list of short lines.
LIST_FIELDS = ("responsibilities", "required_skills", "qualifications", "preferred_skills")


def clean_lines(values: Any) -> List[str]:
    """Trim each item, drop blanks and repeats, keep the order."""
    seen, out = set(), []
    for value in values or []:
        item = str(value).strip().lstrip("-•*").strip()
        if item and item.lower() not in seen:
            seen.add(item.lower())
            out.append(item)
    return out


class JobOpeningService:
    def __init__(
        self,
        opening_repo: JobOpeningRepository,
        application_repo: JobApplicationRepository,
        verification_repo: ApplicantVerificationRepository,
        resume_repo: ResumeRepository,
        resume_service: ResumeService,
        page_settings_repo: Optional[CareersPageSettingsRepository] = None,
        company_repo: Optional[CompanyRepository] = None,
    ):
        self.opening_repo = opening_repo
        self.application_repo = application_repo
        self.verification_repo = verification_repo
        self.resume_repo = resume_repo
        self.resume_service = resume_service
        self.settings_repo = SettingsRepository()
        self.page_settings_repo = page_settings_repo
        self.company_repo = company_repo

    # ── Companies ─────────────────────────────────────────────────────────────

    async def company_by_id(self, company_id: Optional[str]) -> Dict[str, Any]:
        """A company for staff screens. No id means the default company."""
        company_id = (company_id or "").strip() or DEFAULT_COMPANY_ID
        company = await self.company_repo.get_by_id(company_id) if self.company_repo else None
        if company:
            return company
        if company_id == DEFAULT_COMPANY_ID:
            return default_company_doc()
        raise NotFoundError("Company not found.")

    async def public_company(self, slug: Optional[str]) -> Dict[str, Any]:
        """The company whose careers page is open (?company=<slug>). No slug means the default company."""
        slug = (slug or "").strip().lower()
        if not slug:
            return await self.company_by_id(DEFAULT_COMPANY_ID)
        company = await self.company_repo.get_by_slug(slug) if self.company_repo else None
        if not company or company.get("status") == COMPANY_STATUS_INACTIVE:
            raise NotFoundError("This careers page was not found.")
        return company

    @staticmethod
    def _company_query(company_id: str) -> Dict[str, Any]:
        # Roles from before companies existed have no company_id and belong to the default company.
        if company_id == DEFAULT_COMPANY_ID:
            return {"$or": [{"company_id": company_id}, {"company_id": {"$exists": False}}]}
        return {"company_id": company_id}

    async def list_companies(self) -> List[Dict[str, Any]]:
        await self.company_repo.ensure_default()
        companies = await self.company_repo.find_many(sort_by="created_at", descending=False, limit=500)
        roles = await self.opening_repo.find_many(projection={"company_id": 1, "status": 1}, limit=10000)
        for c in companies:
            mine = [r for r in roles if (r.get("company_id") or DEFAULT_COMPANY_ID) == c["id"]]
            c["roles_count"] = len(mine)
            c["open_roles_count"] = sum(1 for r in mine if r.get("status") == JOB_STATUS_OPEN)
            c["is_default"] = c["id"] == DEFAULT_COMPANY_ID
        # The default company first, then in the order they were added.
        return sorted(companies, key=lambda c: not c["is_default"])

    async def _clean_slug(self, value: str, own_id: Optional[str] = None) -> str:
        slug = slugify(value)
        if not slug:
            raise BadRequestError("The page address needs at least one letter or number.")
        taken = await self.company_repo.get_by_slug(slug)
        if taken and taken["id"] != own_id:
            raise ConflictError(f"The page address '{slug}' is already used by {taken['name']}.")
        return slug

    async def create_company(self, data: Dict[str, Any]) -> Dict[str, Any]:
        name = (data.get("name") or "").strip()
        if not name:
            raise BadRequestError("Company name is required.")
        doc = CompanyDocument(name=name, slug=await self._clean_slug(data.get("slug") or name))
        created = await self.company_repo.create(doc.to_dict())
        return {**created, "roles_count": 0, "open_roles_count": 0, "is_default": False}

    async def update_company(self, company_id: str, changes: Dict[str, Any]) -> Dict[str, Any]:
        existing = await self.company_repo.get_by_id(company_id)
        if not existing:
            raise NotFoundError("Company not found.")
        clean: Dict[str, Any] = {}
        if "name" in changes:
            clean["name"] = (changes["name"] or "").strip()
            if not clean["name"]:
                raise BadRequestError("Company name is required.")
        if "slug" in changes:
            clean["slug"] = await self._clean_slug(changes["slug"] or "", own_id=company_id)
        if "status" in changes:
            if changes["status"] not in (COMPANY_STATUS_ACTIVE, COMPANY_STATUS_INACTIVE):
                raise BadRequestError("Status must be ACTIVE or INACTIVE.")
            if company_id == DEFAULT_COMPANY_ID and changes["status"] == COMPANY_STATUS_INACTIVE:
                raise BadRequestError("The default company's careers page cannot be turned off.")
            clean["status"] = changes["status"]
        if not clean:
            return existing
        clean["updated_at"] = utc_now().isoformat()
        updated = await self.company_repo.update(company_id, clean)
        if clean.get("name") and clean["name"] != existing["name"]:
            await self._rename_company_everywhere(company_id, clean["name"])
        return updated

    async def _rename_company_everywhere(self, company_id: str, name: str) -> None:
        """Roles, applications and resumes keep a copy of the company name for lists and filters."""
        await self.opening_repo.collection.update_many({"company_id": company_id}, {"$set": {"company_name": name}})
        await self.application_repo.collection.update_many({"company_id": company_id}, {"$set": {"company_name": name}})
        resumes = self.resume_repo.collection
        await resumes.update_many({"company_id": company_id}, {"$set": {"company_name": name}})
        await resumes.update_many(
            {"applied_jobs.company_id": company_id},
            {"$set": {"applied_jobs.$[j].company_name": name}},
            array_filters=[{"j.company_id": company_id}],
        )

    # ── Careers page text ─────────────────────────────────────────────────────

    @staticmethod
    def page_defaults(company: Optional[Dict[str, Any]] = None) -> Dict[str, str]:
        name = (company or {}).get("name")
        defaults = dict(CAREERS_PAGE_DEFAULTS)
        if name:
            defaults["hero_eyebrow"] = f"Careers at {name}"
        return defaults

    async def get_page_settings(self, company: Optional[Dict[str, Any]] = None) -> Dict[str, str]:
        """Saved page text over the defaults; a blank saved value falls back to the default."""
        company_id = (company or {}).get("id") or DEFAULT_COMPANY_ID
        saved = await self.page_settings_repo.get_settings(company_id) if self.page_settings_repo else {}
        return {key: (saved.get(key) or "").strip() or default for key, default in self.page_defaults(company).items()}

    async def get_public_page(self, slug: Optional[str]) -> Dict[str, Any]:
        company = await self.public_company(slug)
        return {
            **await self.get_page_settings(company),
            "company": {"id": company["id"], "name": company["name"], "slug": company["slug"]},
        }

    async def update_page_settings(self, changes: Dict[str, Any], company: Optional[Dict[str, Any]] = None) -> Dict[str, str]:
        clean = {k: (v or "").strip() for k, v in changes.items() if k in CAREERS_PAGE_DEFAULTS}
        if clean:
            company_id = (company or {}).get("id") or DEFAULT_COMPANY_ID
            await self.page_settings_repo.save_settings({**clean, "updated_at": utc_now().isoformat()}, company_id)
        return await self.get_page_settings(company)

    # ── Public: listing ───────────────────────────────────────────────────────

    async def list_public_openings(self, slug: Optional[str] = None) -> List[Dict[str, Any]]:
        """A company's roles that are open and still have positions left."""
        company = await self.public_company(slug)
        openings = await self.opening_repo.find_many(
            query={"status": JOB_STATUS_OPEN, "open_positions": {"$gt": 0}, **self._company_query(company["id"])},
            sort_by="created_at",
            descending=False,
            limit=500,
        )
        return [
            {
                "id": o["id"],
                "title": o["title"],
                "department": o.get("department", ""),
                "location": o.get("location", ""),
                "employment_type": o.get("employment_type", ""),
                "experience": o.get("experience", ""),
                "description": o.get("description", ""),
                **{field: o.get(field) or [] for field in LIST_FIELDS},
                "open_positions": o.get("open_positions", 0),
                "created_at": o.get("created_at", ""),
            }
            for o in openings
        ]

    # ── Public: email verification ────────────────────────────────────────────

    @staticmethod
    def _normalize_email(email: str) -> str:
        clean = (email or "").strip().lower()
        if not EMAIL_PATTERN.fullmatch(clean):
            raise BadRequestError("Please enter a valid email address.")
        return clean

    @staticmethod
    def _hash_code(email: str, code: str) -> str:
        return hmac.new(settings.SECRET_KEY.encode(), f"{email}:{code}".encode(), hashlib.sha256).hexdigest()

    @staticmethod
    def _send_code_email(config: Any, to_email: str, code: str) -> None:
        """Blocking SMTP send, run in a worker thread. Uses the SMTP settings from the Settings page."""
        password = decrypt_password(config.smtp_password)
        msg = EmailMessage()
        msg["Subject"] = "Your verification code"
        msg["From"] = f"{config.sender_name} <{config.sender_email}>"
        msg["To"] = to_email
        msg.set_content(
            f"Your verification code is {code}.\n\n"
            f"It expires in {CODE_TTL_MINUTES} minutes. If you did not ask to apply for a job, ignore this email."
        )
        if config.use_ssl:
            server = smtplib.SMTP_SSL(config.smtp_server, config.smtp_port, timeout=30)
        else:
            server = smtplib.SMTP(config.smtp_server, config.smtp_port, timeout=30)
            if config.use_tls:
                server.starttls()
        try:
            server.login(config.smtp_username, password)
            server.send_message(msg)
        finally:
            server.quit()

    async def request_code(self, email: str) -> Dict[str, Any]:
        clean_email = self._normalize_email(email)

        config = await self.settings_repo.get_email_config()
        if not config:
            raise BadRequestError("Applications are unavailable right now because email is not configured.")

        existing = await self.verification_repo.get_by_id(clean_email)
        if existing:
            age = (utc_now() - _parse_iso(existing["created_at"])).total_seconds()
            if age < CODE_RESEND_COOLDOWN_SECONDS:
                raise BadRequestError("Please wait a minute before requesting another code.")

        code = f"{secrets.randbelow(1_000_000):06d}"
        now = utc_now()
        doc = ApplicantVerificationDocument(
            id=clean_email,
            code_hash=self._hash_code(clean_email, code),
            created_at=now.isoformat(),
            expires_at=(now + timedelta(minutes=CODE_TTL_MINUTES)).isoformat(),
        )
        await self.verification_repo.save_code(clean_email, doc.to_dict())

        try:
            await asyncio.to_thread(self._send_code_email, config, clean_email, code)
        except Exception as e:
            logger.error(f"Could not send applicant verification code to '{clean_email}': {e}")
            await self.verification_repo.delete(clean_email)
            raise BadRequestError("We could not send the verification email. Please try again in a few minutes.")

        return {"email": clean_email, "expires_in_minutes": CODE_TTL_MINUTES}

    async def confirm_code(self, email: str, code: str) -> Dict[str, Any]:
        clean_email = self._normalize_email(email)
        record = await self.verification_repo.get_by_id(clean_email)
        if not record:
            raise BadRequestError("No verification code was requested for this email. Request a new code.")
        if utc_now() > _parse_iso(record["expires_at"]):
            await self.verification_repo.delete(clean_email)
            raise BadRequestError("This code has expired. Request a new code.")
        if record.get("attempts", 0) >= CODE_MAX_ATTEMPTS:
            await self.verification_repo.delete(clean_email)
            raise BadRequestError("Too many wrong attempts. Request a new code.")

        if not hmac.compare_digest(record["code_hash"], self._hash_code(clean_email, (code or "").strip())):
            await self.verification_repo.update(clean_email, {"attempts": record.get("attempts", 0) + 1})
            raise BadRequestError("The code is incorrect.")

        # The code is single use.
        await self.verification_repo.delete(clean_email)
        now = utc_now()
        # A separate token type: it cannot be used as a staff login token.
        token = jwt.encode(
            {
                "sub": clean_email,
                "type": "applicant",
                "iat": now,
                "exp": now + timedelta(minutes=APPLICANT_TOKEN_MINUTES),
            },
            settings.SECRET_KEY,
            algorithm=settings.ALGORITHM,
        )
        return {"applicant_token": token, "email": clean_email, "expires_in_minutes": APPLICANT_TOKEN_MINUTES}

    @staticmethod
    def _email_from_token(token: str) -> str:
        payload = decode_jwt_token(token)
        if payload.get("type") != "applicant" or not payload.get("sub"):
            raise AuthenticationError("Please verify your email before applying.")
        return payload["sub"]

    # ── Public: applying ──────────────────────────────────────────────────────

    async def apply(
        self,
        opening_id: str,
        applicant_token: str,
        file: UploadFile,
        background_tasks: BackgroundTasks,
        heard_from: Optional[str] = None,
        note: Optional[str] = None,
    ) -> Dict[str, Any]:
        email = self._email_from_token(applicant_token)
        heard_from = (heard_from or "").strip() or None
        note = (note or "").strip() or None

        opening = await self.opening_repo.get_by_id(opening_id)
        if not opening or opening.get("status") != JOB_STATUS_OPEN or opening.get("open_positions", 0) <= 0:
            raise BadRequestError("This role is no longer accepting applications.")
        company = await self.company_by_id(opening.get("company_id"))
        if company.get("status") == COMPANY_STATUS_INACTIVE:
            raise BadRequestError("This role is no longer accepting applications.")
        ref = company_ref(company)

        already = await self.application_repo.find_one({"opening_id": opening_id, "applicant_email": email})
        if already:
            raise ConflictError("You have already applied for this role.")

        # Same validation, duplicate-file check, storage and background parsing as the staff upload.
        resume = await self.resume_service.upload_and_process_resume(
            user_id=PUBLIC_APPLICANT_USER_ID,
            file=file,
            background_tasks=background_tasks,
            resume_source="Careers page",
            uploaded_by_email=email,
        )
        await self.resume_repo.update(
            resume.id,
            {"applicant_email": email, "applicant_heard_from": heard_from, "applicant_note": note},
        )

        application = JobApplicationDocument(
            **ref,
            opening_id=opening_id,
            opening_title=opening["title"],
            applicant_email=email,
            resume_id=resume.id,
            heard_from=heard_from,
            note=note,
        )
        # The company and role go on the resume; if the parser later merges it into an existing profile,
        # they are added to that profile's list.
        await add_application_to_resume(
            self.resume_repo.db, resume.id, ref, opening_id, opening["title"], application.submitted_at
        )
        await self.application_repo.create(application.to_dict())
        return {
            "application_id": application.id,
            "resume_id": resume.id,
            "opening_title": opening["title"],
            "company_name": company["name"],
        }

    # ── Admin ─────────────────────────────────────────────────────────────────

    async def list_openings(self, company_id: Optional[str] = None) -> List[Dict[str, Any]]:
        query = self._company_query(company_id) if company_id else None
        openings = await self.opening_repo.find_many(query=query, sort_by="created_at", descending=False, limit=500)
        counts = await self.application_repo.count_by_opening()
        for o in openings:
            o["applications_count"] = counts.get(o["id"], 0)
            o.setdefault("company_id", DEFAULT_COMPANY_ID)
        return openings

    async def create_opening(self, data: Dict[str, Any]) -> Dict[str, Any]:
        title = (data.get("title") or "").strip()
        if not title:
            raise BadRequestError("Job title is required.")
        company = await self.company_by_id(data.get("company_id"))
        doc = JobOpeningDocument(
            **company_ref(company),
            title=title,
            department=(data.get("department") or "").strip(),
            location=(data.get("location") or "").strip(),
            employment_type=(data.get("employment_type") or "").strip(),
            experience=(data.get("experience") or "").strip(),
            description=(data.get("description") or "").strip(),
            **{field: clean_lines(data.get(field)) for field in LIST_FIELDS},
            open_positions=data.get("open_positions", 1),
        )
        created = await self.opening_repo.create(doc.to_dict())
        created["applications_count"] = 0
        return created

    async def update_opening(self, opening_id: str, changes: Dict[str, Any]) -> Dict[str, Any]:
        existing = await self.opening_repo.get_by_id(opening_id)
        if not existing:
            raise NotFoundError("Job opening not found.")
        if "status" in changes and changes["status"] not in (JOB_STATUS_OPEN, JOB_STATUS_CLOSED):
            raise BadRequestError("Status must be OPEN or CLOSED.")
        if "title" in changes:
            changes["title"] = (changes["title"] or "").strip()
            if not changes["title"]:
                raise BadRequestError("Job title is required.")
        for field in LIST_FIELDS:
            if field in changes:
                changes[field] = clean_lines(changes[field])
        if "company_id" in changes:
            changes.update(company_ref(await self.company_by_id(changes["company_id"])))
        changes["updated_at"] = utc_now().isoformat()
        updated = await self.opening_repo.update(opening_id, changes)
        counts = await self.application_repo.count_by_opening()
        updated["applications_count"] = counts.get(opening_id, 0)
        return updated

    async def list_applications(
        self, opening_id: Optional[str], skip: int, limit: int, company_id: Optional[str] = None
    ) -> Dict[str, Any]:
        query: Dict[str, Any] = {"opening_id": opening_id} if opening_id else {}
        if company_id:
            query.update(self._company_query(company_id))
        total = await self.application_repo.count(query)
        applications = await self.application_repo.find_many(
            query=query, skip=skip, limit=limit, sort_by="submitted_at", descending=True
        )

        resume_ids = [a["resume_id"] for a in applications]
        resumes = await self.resume_repo.find_many(
            query={"id": {"$in": resume_ids}},
            projection={"id": 1, "status": 1, "candidate_id": 1, "parsed_data.full_name": 1, "parsed_data.phone": 1},
            limit=max(len(resume_ids), 1),
        )
        by_id = {r["id"]: r for r in resumes}

        rows = []
        for a in applications:
            resume = by_id.get(a["resume_id"])
            parsed = (resume or {}).get("parsed_data") or {}
            rows.append({
                "id": a["id"],
                "opening_id": a["opening_id"],
                "opening_title": a["opening_title"],
                "company_id": a.get("company_id") or DEFAULT_COMPANY_ID,
                "company_name": a.get("company_name"),
                "applicant_email": a["applicant_email"],
                "submitted_at": a["submitted_at"],
                "heard_from": a.get("heard_from"),
                "note": a.get("note"),
                "resume_id": a["resume_id"],
                # The resume is gone when the parser merged it into an existing candidate profile.
                "candidate_id": (resume or {}).get("candidate_id"),
                "resume_status": (resume or {}).get("status", "MERGED"),
                "full_name": parsed.get("full_name") if isinstance(parsed, dict) else None,
                "phone": parsed.get("phone") if isinstance(parsed, dict) else None,
            })
        return {"items": rows, "total": total}


def _parse_iso(value: str):
    from datetime import datetime
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=utc_now().tzinfo)
    return parsed
