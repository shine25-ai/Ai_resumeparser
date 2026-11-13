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
from app.models.job_opening import (
    CAREERS_PAGE_DEFAULTS,
    JOB_STATUS_CLOSED,
    JOB_STATUS_OPEN,
    ApplicantVerificationDocument,
    JobApplicationDocument,
    JobOpeningDocument,
)
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
    ):
        self.opening_repo = opening_repo
        self.application_repo = application_repo
        self.verification_repo = verification_repo
        self.resume_repo = resume_repo
        self.resume_service = resume_service
        self.settings_repo = SettingsRepository()
        self.page_settings_repo = page_settings_repo

    # ── Careers page text ─────────────────────────────────────────────────────

    async def get_page_settings(self) -> Dict[str, str]:
        """Saved page text over the defaults; a blank saved value falls back to the default."""
        saved = await self.page_settings_repo.get_settings() if self.page_settings_repo else {}
        return {key: (saved.get(key) or "").strip() or default for key, default in CAREERS_PAGE_DEFAULTS.items()}

    async def update_page_settings(self, changes: Dict[str, Any]) -> Dict[str, str]:
        clean = {k: (v or "").strip() for k, v in changes.items() if k in CAREERS_PAGE_DEFAULTS}
        if clean:
            await self.page_settings_repo.save_settings({**clean, "updated_at": utc_now().isoformat()})
        return await self.get_page_settings()

    # ── Public: listing ───────────────────────────────────────────────────────

    async def list_public_openings(self) -> List[Dict[str, Any]]:
        """Roles that are open and still have positions left."""
        openings = await self.opening_repo.find_many(
            query={"status": JOB_STATUS_OPEN, "open_positions": {"$gt": 0}},
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
            {
                "job_opening_id": opening_id,
                "job_title": opening["title"],
                "applicant_email": email,
                "applicant_heard_from": heard_from,
                "applicant_note": note,
            },
        )

        application = JobApplicationDocument(
            opening_id=opening_id,
            opening_title=opening["title"],
            applicant_email=email,
            resume_id=resume.id,
            heard_from=heard_from,
            note=note,
        )
        await self.application_repo.create(application.to_dict())
        return {"application_id": application.id, "resume_id": resume.id, "opening_title": opening["title"]}

    # ── Admin ─────────────────────────────────────────────────────────────────

    async def list_openings(self) -> List[Dict[str, Any]]:
        openings = await self.opening_repo.find_many(sort_by="created_at", descending=False, limit=500)
        counts = await self.application_repo.count_by_opening()
        for o in openings:
            o["applications_count"] = counts.get(o["id"], 0)
        return openings

    async def create_opening(self, data: Dict[str, Any]) -> Dict[str, Any]:
        title = (data.get("title") or "").strip()
        if not title:
            raise BadRequestError("Job title is required.")
        doc = JobOpeningDocument(
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
        changes["updated_at"] = utc_now().isoformat()
        updated = await self.opening_repo.update(opening_id, changes)
        counts = await self.application_repo.count_by_opening()
        updated["applications_count"] = counts.get(opening_id, 0)
        return updated

    async def list_applications(self, opening_id: Optional[str], skip: int, limit: int) -> Dict[str, Any]:
        query: Dict[str, Any] = {"opening_id": opening_id} if opening_id else {}
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
