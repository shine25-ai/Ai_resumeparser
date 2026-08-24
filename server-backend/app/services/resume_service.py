"""
Resume service handling file storage, text extraction (PyMuPDF & docx), metadata recording, and text cleanup for AI parsing.
"""

import os
from pathlib import Path
from typing import Any, Dict, List, Optional
import docx
import fitz  # PyMuPDF
from fastapi import UploadFile, BackgroundTasks
from loguru import logger
from app.core.config import settings
from app.core.database import get_next_sequence
from app.core.exceptions import FileUploadError, NotFoundError
from app.models.resume import ResumeDocument
from app.models.resume_log import ResumeLogDocument
from app.repositories.resume_repository import ResumeRepository
from app.repositories.resume_log_repository import ResumeLogRepository
from app.schemas.resume import (
    ResumeExtractResponse,
    ResumeListResponse,
    ResumeResponse,
    ResumeUpdateRequest,
    ResumeLogResponse,
    ResumeLogListResponse,
)
from app.services.s3_service import S3Service
from app.utils.enums import ResumeStatus
from app.utils.helpers import generate_uuid, sanitize_filename, utc_now
from app.utils.validators import validate_uploaded_file


class ResumeService:
    """Service handling resume processing, text extraction, S3 upload, and parsing."""

    def __init__(
        self,
        resume_repo: ResumeRepository,
        s3_service: Optional[S3Service] = None,
        resume_log_repo: Optional[ResumeLogRepository] = None,
    ):
        self.resume_repo = resume_repo
        self.resume_log_repo = resume_log_repo or ResumeLogRepository(resume_repo.db)
        self.s3_service = s3_service or S3Service()
        self.upload_dir = Path(__file__).resolve().parent.parent / settings.UPLOAD_FOLDER
        self.upload_dir.mkdir(parents=True, exist_ok=True)

    async def upload_and_process_resume(
        self,
        user_id: str,
        file: UploadFile,
        background_tasks: BackgroundTasks,
        resume_source: Optional[str] = None,
        resume_source_informer_name: Optional[str] = None,
        uploaded_by_name: Optional[str] = None,
        uploaded_by_email: Optional[str] = None,
    ) -> ResumeResponse:
        """
        Validate file, save to disk, upload to AWS S3, parse resume using resume-parser-pro, and save document in MongoDB with uploader user info.
        """
        if not file.filename:
            raise FileUploadError("No filename provided.")

        original_filename = sanitize_filename(file.filename)
        content = await validate_uploaded_file(file)

        # Compute SHA256 checksum for the file
        import hashlib
        file_hash = hashlib.sha256(content).hexdigest()

        ext = original_filename.rsplit(".", 1)[-1].lower()
        resume_id = generate_uuid()
        unique_filename = f"{resume_id}_{original_filename}"
        file_path = str(self.upload_dir / unique_filename)

        # Write file to disk
        with open(file_path, "wb") as f:
            f.write(content)

        logger.info(f"Saved uploaded file to disk: {file_path}")

        # 1. Upload to S3 Bucket
        content_type = file.content_type or "application/octet-stream"
        s3_url = self.s3_service.upload_file(content, unique_filename, content_type)

        # 2. Extract plain text
        extracted_text = ""
        status = ResumeStatus.PARSED

        try:
            extracted_text = self._extract_text_from_file(file_path, ext)
            if not extracted_text or not extracted_text.strip():
                status = ResumeStatus.FAILED
                extracted_text = ""
        except Exception as e:
            logger.error(f"Text extraction failed for file '{unique_filename}': {e}")
            status = ResumeStatus.FAILED
            extracted_text = ""

        # 3. Queue AI Parsing in background
        parsed_data = {}
        ai_evaluation = {}
        
        # Generate auto-incrementing candidate ID
        seq_num = await get_next_sequence(self.resume_repo.db, "candidate_id")
        candidate_id_str = f"CND{seq_num:04d}"
        
        resume_doc = ResumeDocument(
            id=resume_id,
            candidate_id=candidate_id_str,
            user_id=user_id,
            uploaded_by_user_id=user_id,
            uploaded_by_name=uploaded_by_name,
            uploaded_by_email=uploaded_by_email,
            filename=unique_filename,
            original_filename=original_filename,
            file_path=file_path,
            extracted_text=extracted_text,
            s3_url=s3_url,
            file_hash=file_hash,
            parsed_data=parsed_data,
            ai_evaluation=ai_evaluation,
            resume_source=resume_source,
            resume_source_informer_name=resume_source_informer_name,
            status=ResumeStatus.PENDING,
        )

        created = await self.resume_repo.create(resume_doc.to_dict())
        logger.info(f"Recorded temporary upload document in MongoDB: ID '{resume_id}' for user '{user_id}' with S3 URL '{s3_url}'")
        
        if status != ResumeStatus.FAILED:
            # Enqueue the background task for AI parsing
            background_tasks.add_task(
                self._process_ai_parsing_async,
                resume_id=resume_id,
                user_id=user_id,
                file_path=file_path,
                original_filename=original_filename,
                content_type=file.content_type or "application/pdf"
            )
            
        return ResumeResponse.model_validate(created)

    async def _process_ai_parsing_async(self, resume_id: str, user_id: str, file_path: str, original_filename: str, content_type: str):
        """Background task to run AI parsing via httpx and update MongoDB."""
        try:
            import httpx
            import asyncio
            import json
            from app.repositories.settings_repository import SettingsRepository
            from app.utils.encryption import decrypt_password
            
            # Fetch AI config from DB
            settings_repo = SettingsRepository()
            ai_config = await settings_repo.get_ai_config()
            
            config_payload = {}
            if ai_config:
                decrypted_key = decrypt_password(ai_config.api_key) if ai_config.api_key else ""
                config_payload = {
                    "provider": ai_config.provider,
                    "model_name": ai_config.model_name,
                    "api_key": decrypted_key,
                    "base_url": ai_config.base_url
                }
            else:
                logger.warning("No AI Configuration found in DB, relying on ai-parser defaults")
                
            with open(file_path, "rb") as f:
                async with httpx.AsyncClient(timeout=120.0) as client:
                    response = await client.post(
                        settings.AI_PARSER_URL,
                        files={"file": (original_filename, f, content_type)},
                        data={"ai_config": json.dumps(config_payload)}
                    )
                    response.raise_for_status()
                    ai_result = response.json()
                    
            parsed_data = {}
            ai_evaluation = {}

            job_id = ai_result.get("job_id")
            if not job_id:
                # Direct response from AI Parser (no async job_id)
                logger.info(f"[AI_PARSER_RESPONSE] Received immediate parsing response for '{resume_id}'")
                parsed_data = (
                    ai_result.get("parsed_resume") or
                    ai_result.get("parsed_data") or
                    ai_result.get("data", {}).get("parsed_resume") or
                    ai_result.get("data", {})
                )
                ai_evaluation = (
                    ai_result.get("evaluation") or
                    ai_result.get("ai_evaluation") or
                    ai_result.get("data", {}).get("evaluation") or
                    {}
                )
                if not parsed_data and ("full_name" in ai_result or "email" in ai_result):
                    parsed_data = ai_result
            else:
                status_url = settings.AI_PARSER_URL.replace("/upload", f"/status/{job_id}")
                
                # Poll for completion
                async with httpx.AsyncClient(timeout=30.0) as client:
                    for _ in range(60): # 60 * 5 = 300 seconds max
                        res = await client.get(status_url)
                        res.raise_for_status()
                        status_data = res.json()
                        
                        if status_data.get("status") == "completed":
                            parsed_data = status_data.get("parsed_resume", {})
                            ai_evaluation = status_data.get("evaluation", {})
                            break
                        elif status_data.get("status") == "error":
                            raise Exception(f"AI Parser error: {status_data.get('evaluation')}")
                            
                        await asyncio.sleep(5)
                    else:
                        raise Exception("AI Parser polling timed out after 5 minutes")

            # Extract email from parsed_data (handles nested dict or direct string)
            email = parsed_data.get("email") if isinstance(parsed_data, dict) else None
            clean_email = email.strip() if (email and isinstance(email, str) and email.strip()) else None

            existing_doc = None
            if clean_email:
                logger.info(f"[EXISTING_EMAIL_CHECK] Extracted email '{clean_email}' from parsed data for upload '{resume_id}'. Searching MongoDB...")
                existing_doc = await self.resume_repo.find_by_email(email=clean_email, exclude_resume_id=resume_id)
            else:
                logger.info(f"[EXISTING_EMAIL_CHECK] No valid email found in parsed_data for upload '{resume_id}'. Keys in parsed_data: {list(parsed_data.keys()) if isinstance(parsed_data, dict) else 'Not a dict'}")

            if existing_doc and existing_doc["id"] != resume_id:
                logger.info(f"========== [EXISTING EMAIL FLOW TRIGGERED] ==========")
                logger.info(f"[EXISTING_EMAIL_FLOW] Email '{clean_email}' matched existing candidate profile ID: '{existing_doc['id']}'.")
                logger.info(f"[EXISTING_EMAIL_FLOW] Action: Will NOT create a new candidate. Backing up existing values to 'resume_log' and updating profile '{existing_doc['id']}'.")

                # 1. Save ENTIRE OLD resume snapshot into resume_log model before updating
                old_snapshot = dict(existing_doc)
                old_snapshot.pop("_id", None)

                log_doc = ResumeLogDocument(
                    resume_id=existing_doc["id"],
                    temp_upload_id=resume_id,
                    user_id=user_id,
                    email=clean_email,
                    old_data=old_snapshot,
                    action="AUTOMATIC_EMAIL_UPDATE",
                )
                await self.resume_log_repo.create(log_doc.to_dict())
                logger.info(f"[EXISTING_EMAIL_FLOW] Step 1/3: Created ResumeLog snapshot ID '{log_doc.id}' in 'resume_logs' collection for candidate '{existing_doc['id']}'")

                # Get temporary resume upload document metadata
                temp_doc = await self.resume_repo.get_by_id(resume_id) or {}

                # 2. Prepare updated fields for the existing resume model
                other_docs = existing_doc.get("other_documents") or []
                if existing_doc.get("s3_url") and existing_doc.get("original_filename"):
                    other_docs.append({
                        "filename": existing_doc.get("original_filename"),
                        "s3_url": existing_doc.get("s3_url"),
                        "doc_type": "Previous Resume",
                        "uploaded_at": existing_doc.get("upload_date")
                    })

                hr_updates = existing_doc.get("hr_updates") or []
                hr_updates.append({
                    "comment": f"Auto-updated profile with new resume upload '{original_filename}'. Previous version backed up to resume_log.",
                    "author": "System",
                    "updated_at": utc_now().isoformat()
                })

                updated_existing_fields = {
                    "filename": temp_doc.get("filename") or original_filename,
                    "original_filename": original_filename,
                    "file_path": file_path,
                    "s3_url": temp_doc.get("s3_url"),
                    "file_hash": temp_doc.get("file_hash"),
                    "extracted_text": temp_doc.get("extracted_text"),
                    "parsed_data": parsed_data,
                    "ai_evaluation": ai_evaluation,
                    "other_documents": other_docs,
                    "hr_updates": hr_updates,
                    "status": ResumeStatus.PARSED.value,
                    "upload_date": utc_now().isoformat(),
                    "email_conflict": False,
                    "existing_resume_id": None,
                    "is_auto_updated": True,
                    "previous_upload_date": existing_doc.get("upload_date") or existing_doc.get("created_at"),
                    "resume_source": temp_doc.get("resume_source") or existing_doc.get("resume_source"),
                    "resume_source_informer_name": temp_doc.get("resume_source_informer_name") or existing_doc.get("resume_source_informer_name"),
                }
                await self.resume_repo.update(existing_doc["id"], updated_existing_fields)
                logger.info(f"[EXISTING_EMAIL_FLOW] Step 2/3: Updated existing candidate document '{existing_doc['id']}' in 'resumes' collection with new parsed values.")

                # 3. Clean up temporary upload document so resumes collection ONLY contains the updated existing candidate profile
                await self.resume_repo.delete(resume_id)
                logger.info(f"[EXISTING_EMAIL_FLOW] Step 3/3: Deleted temporary upload record '{resume_id}' from 'resumes' collection so ONLY updated candidate profile '{existing_doc['id']}' remains!")
                logger.info(f"=========================================================")
            else:
                await self.resume_repo.update(resume_id, {
                    "parsed_data": parsed_data,
                    "ai_evaluation": ai_evaluation,
                    "status": ResumeStatus.PARSED.value,
                    "email_conflict": False,
                    "existing_resume_id": None,
                })
                logger.info(f"[NEW_CANDIDATE_FLOW] No existing email conflict. Completed AI Parsing for new candidate resume ID '{resume_id}'")
        except Exception as e:
            logger.error(f"Background AI Parsing failed for '{resume_id}': {e}")
            await self.resume_repo.update(resume_id, {
                "status": ResumeStatus.FAILED.value
            })

    def _extract_text_from_file(self, file_path: str, ext: str) -> str:
        """Extract plain text from PDF, DOCX, or DOC file."""
        if ext == "pdf":
            return self._extract_text_from_pdf(file_path)
        elif ext == "docx":
            return self._extract_text_from_docx(file_path)
        elif ext == "doc":
            return self._extract_text_from_doc(file_path)
        else:
            raise FileUploadError(f"Unsupported extension: {ext}")

    def _extract_text_from_pdf(self, file_path: str) -> str:
        """Extract text from PDF using PyMuPDF (fitz)."""
        text_parts: List[str] = []
        with fitz.open(file_path) as doc:
            for page in doc:
                text_parts.append(str(page.get_text()))
        return "\n".join(text_parts).strip()

    def _extract_text_from_docx(self, file_path: str) -> str:
        """Extract text from DOCX using python-docx."""
        doc = docx.Document(file_path)
        text_parts = [para.text for para in doc.paragraphs if para.text.strip()]
        for table in doc.tables:
            for row in table.rows:
                row_text = " | ".join([cell.text.strip() for cell in row.cells if cell.text.strip()])
                if row_text:
                    text_parts.append(row_text)
        return "\n".join(text_parts).strip()

    def _extract_text_from_doc(self, file_path: str) -> str:
        """Fallback text extraction for legacy binary DOC format."""
        try:
            with open(file_path, "rb") as f:
                content = f.read().decode("utf-8", errors="ignore")
                # Filter printable ASCII/text characters
                clean = "".join([c for c in content if c.isprintable() or c in ("\n", "\r", "\t")])
                return clean.strip()
        except Exception:
            return ""

    async def get_resume_by_id(self, resume_id: str, user_id: str, is_admin: bool = False) -> ResumeResponse:
        """Fetch single resume by ID, checking ownership if non-admin."""
        resume = await self.resume_repo.get_by_id(resume_id)
        if not resume:
            raise NotFoundError("Resume not found.")
        if not is_admin and resume["user_id"] != user_id:
            raise NotFoundError("Resume not found.")
        enriched = await self.enrich_resumes_with_interviews([resume])
        return ResumeResponse.model_validate(enriched[0])

    async def enrich_resumes_with_interviews(self, resumes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Enrich candidate resume dicts with interview assignment status and dates."""
        if not resumes:
            return resumes

        candidate_ids = [r.get("candidate_id") for r in resumes if r.get("candidate_id")]
        resume_ids = [r.get("id") for r in resumes if r.get("id")]

        emails = []
        for r in resumes:
            em = None
            if r.get("parsed_data") and isinstance(r["parsed_data"], dict):
                em = r["parsed_data"].get("email")
            if not em:
                em = r.get("email")
            if em and isinstance(em, str) and em.strip():
                emails.append(em.strip().lower())

        or_conds = []
        if candidate_ids:
            or_conds.append({"candidate_id": {"$in": candidate_ids}})
        if resume_ids:
            or_conds.append({"resume_id": {"$in": resume_ids}})
        if emails:
            import re
            or_conds.append({"candidate_email": {"$in": [re.compile(f"^{re.escape(e)}$", re.IGNORECASE) for e in emails]}})

        interviews_by_cand: Dict[str, List[Dict[str, Any]]] = {}
        if or_conds:
            try:
                cursor = self.resume_repo.db["interviews"].find({"$or": or_conds}).sort([("scheduled_date", -1), ("created_at", -1)])
                interview_docs = await cursor.to_list(length=1000)

                for inv in interview_docs:
                    inv_cid = inv.get("candidate_id")
                    inv_rid = inv.get("resume_id")
                    inv_cemail = (inv.get("candidate_email") or "").strip().lower()

                    for r in resumes:
                        r_cid = r.get("candidate_id")
                        r_rid = r.get("id")
                        r_email = ""
                        if r.get("parsed_data") and isinstance(r["parsed_data"], dict):
                            r_email = r["parsed_data"].get("email") or ""
                        if not r_email:
                            r_email = r.get("email") or ""
                        r_email = r_email.strip().lower()

                        matched = False
                        if r_cid and inv_cid and r_cid == inv_cid:
                            matched = True
                        elif r_rid and inv_rid and r_rid == inv_rid:
                            matched = True
                        elif r_email and inv_cemail and r_email == inv_cemail:
                            matched = True

                        if matched:
                            raw_key = r_rid or r_cid
                            if raw_key:
                                str_key = str(raw_key)
                                if str_key not in interviews_by_cand:
                                    interviews_by_cand[str_key] = []
                                interviews_by_cand[str_key].append(inv)
            except Exception as e:
                logger.error(f"Failed to query interviews for candidate enrichment: {e}")

        for r in resumes:
            raw_key = r.get("id") or r.get("candidate_id")
            c_invs: List[Dict[str, Any]] = []
            if raw_key:
                c_invs = interviews_by_cand.get(str(raw_key), [])

            # Active or valid interviews (exclude CANCELLED if desired, or keep active ones)
            active_invs = [i for i in c_invs if str(i.get("status", "")).upper() != "CANCELLED"]
            valid_invs = active_invs if active_invs else c_invs

            if valid_invs:
                latest = valid_invs[0]
                assigned_date = latest.get("scheduled_date") or latest.get("created_at")

                r["interview_assigned"] = True
                r["interview_status"] = str(latest.get("status") or "ASSIGNED").upper()
                r["last_interview_assigned_date"] = assigned_date

                # Return full interview document dicts without Mongo _id
                latest_clean = dict(latest)
                latest_clean.pop("_id", None)
                r["latest_interview"] = latest_clean

                clean_invs = []
                for inv in valid_invs:
                    inv_clean = dict(inv)
                    inv_clean.pop("_id", None)
                    clean_invs.append(inv_clean)
                r["interviews"] = clean_invs
            else:
                r["interview_assigned"] = False
                r["interview_status"] = "NOT_ASSIGNED"
                r["last_interview_assigned_date"] = None
                r["latest_interview"] = None
                r["interviews"] = []

        return resumes

    async def update_resume(self, resume_id: str, user_id: str, update_payload: ResumeUpdateRequest, is_admin: bool = False) -> ResumeResponse:
        """Update resume metadata / parsed fields and append timestamped HR update record."""
        existing = await self.resume_repo.get_by_id(resume_id)
        if not existing:
            raise NotFoundError("Resume not found.")
        if not is_admin and existing["user_id"] != user_id:
            raise NotFoundError("Resume not found.")

        update_fields: Dict[str, Any] = {}
        if update_payload.parsed_data is not None:
            # Merge parsed_data updates into existing parsed_data dict
            current_parsed = existing.get("parsed_data") or {}
            current_parsed.update(update_payload.parsed_data)
            update_fields["parsed_data"] = current_parsed

        if update_payload.status is not None:
            update_fields["status"] = update_payload.status.value

        hr_update_dict: Optional[Dict[str, Any]] = None
        if update_payload.hr_update is not None:
            hr_update_dict = update_payload.hr_update.model_dump(exclude_unset=True)
            hr_update_dict["updated_at"] = utc_now().isoformat()

        updated_doc = await self.resume_repo.update_resume_fields(resume_id, update_fields, hr_update=hr_update_dict)
        if not updated_doc:
            raise NotFoundError("Failed to update resume.")
        enriched = await self.enrich_resumes_with_interviews([updated_doc])
        return ResumeResponse.model_validate(enriched[0])

    async def get_user_resumes(
        self,
        user_id: str,
        skip: int = 0,
        limit: int = 10,
        page: int = 1,
        search: Optional[str] = None,
        is_admin: bool = False,
    ) -> ResumeListResponse:
        """Fetch list of resumes belonging to user (or all resumes if admin) with total_pages calculation."""
        import math
        resumes = await self.resume_repo.get_by_user_id(user_id, skip=skip, limit=limit, is_admin=is_admin, search=search)
        resumes = await self.enrich_resumes_with_interviews(resumes)
        total = await self.resume_repo.count_by_user_id(user_id, is_admin=is_admin, search=search)
        items = [ResumeResponse.model_validate(r) for r in resumes]
        total_pages = math.ceil(total / limit) if limit > 0 else 1
        return ResumeListResponse(total=total, page=page, limit=limit, total_pages=total_pages, resumes=items)

    async def filter_resumes(
        self,
        user_id: str,
        job_title: Optional[List[str]] = None,
        min_experience: Optional[float] = None,
        max_experience: Optional[float] = None,
        location: Optional[List[str]] = None,
        employment_type: Optional[List[str]] = None,
        year_of_passing: Optional[List[str]] = None,
        skills: Optional[List[str]] = None,
        keywords: Optional[List[str]] = None,
        search: Optional[str] = None,
        name: Optional[str] = None,
        email: Optional[str] = None,
        role: Optional[str] = None,
        experience: Optional[float] = None,
        skip: int = 0,
        limit: int = 10,
        page: int = 1,
        is_admin: bool = False,
    ) -> ResumeListResponse:
        """Filter resumes matching criteria with backend pagination and total_pages calculation."""
        import math
        res_dict = await self.resume_repo.filter_resumes(
            user_id=user_id,
            job_title=job_title,
            min_experience=min_experience,
            max_experience=max_experience,
            location=location,
            employment_type=employment_type,
            year_of_passing=year_of_passing,
            skills=skills,
            keywords=keywords,
            search=search,
            name=name,
            email=email,
            role=role,
            experience=experience,
            skip=skip,
            limit=limit,
            is_admin=is_admin,
        )
        resumes = res_dict.get("resumes", [])
        resumes = await self.enrich_resumes_with_interviews(resumes)
        total = res_dict.get("total", 0)
        items = [ResumeResponse.model_validate(r) for r in resumes]
        total_pages = math.ceil(total / limit) if limit > 0 else 1
        return ResumeListResponse(total=total, page=page, limit=limit, total_pages=total_pages, resumes=items)

    async def extract_resume_text_for_ai(self, resume_id: str, user_id: str, is_admin: bool = False) -> ResumeExtractResponse:
        """Extract and format resume text for AI parsing pipeline."""
        resume = await self.resume_repo.get_by_id(resume_id)
        if not resume:
            raise NotFoundError("Resume not found.")
        if not is_admin and resume["user_id"] != user_id:
            raise NotFoundError("Resume not found.")

        extracted = resume.get("extracted_text", "") or ""
        return ResumeExtractResponse(
            id=resume["id"],
            original_filename=resume["original_filename"],
            status=ResumeStatus(resume["status"]),
            extracted_text=extracted,
            text_length=len(extracted),
        )

    async def delete_resume(self, resume_id: str, user_id: str, is_admin: bool = False) -> bool:
        """Delete resume record from DB and remove associated file from disk."""
        resume = await self.resume_repo.get_by_id(resume_id)
        if not resume:
            raise NotFoundError("Resume not found.")
        if not is_admin and resume["user_id"] != user_id:
            raise NotFoundError("Resume not found.")

        # Remove file from disk if present
        file_path = resume.get("file_path")
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
                logger.info(f"Deleted file from disk: {file_path}")
            except Exception as e:
                logger.error(f"Failed to delete file from disk: {file_path} - {e}")

        # Remove from MongoDB
        deleted = await self.resume_repo.delete(resume_id)
        logger.info(f"Deleted resume record '{resume_id}' from MongoDB.")
        return deleted


    async def get_parsed_resume_summary(
        self,
        user_id: str,
        skip: int = 0,
        limit: int = 100,
        is_admin: bool = False,
    ):
        """
        Return aggregated summary arrays across parsed resumes.
        """
        raw_resumes = await self.resume_repo.get_parsed_resume_summary(
            user_id=user_id,
            skip=skip,
            limit=limit,
            is_admin=is_admin,
        )

        locations = set()
        total_experience_years = set()
        primary_skills = set()
        frameworks = set()
        databases = set()
        designations = set()
        roles = set()
        year_of_passing = set()
        experience_levels = set()
        ai_technical_scores = set()
        personality_analysis_list = []

        for item in raw_resumes:
            parsed_data = item.get("parsed_data") or {}
            ai_eval = item.get("ai_evaluation") or {}

            # Locations
            if parsed_data.get("location"):
                locations.add(parsed_data["location"].strip())

            # Total experience years
            exp = parsed_data.get("total_experience_years")
            if exp is not None and isinstance(exp, (int, float)):
                total_experience_years.add(float(exp))

            # Primary skills
            for s in parsed_data.get("primary_skills") or []:
                if s and isinstance(s, str) and s.strip():
                    primary_skills.add(s.strip())

            # Frameworks
            for f in parsed_data.get("frameworks") or []:
                if f and isinstance(f, str) and f.strip():
                    frameworks.add(f.strip())

            # Databases
            for d in parsed_data.get("databases") or []:
                if d and isinstance(d, str) and d.strip():
                    databases.add(d.strip())

            # Designations (from top-level field or experience entries)
            if parsed_data.get("designation"):
                designations.add(parsed_data["designation"].strip())

            # Roles (from top-level field or projects/experience entries)
            if parsed_data.get("role"):
                roles.add(parsed_data["role"].strip())

            # Experience array items for designation and role
            for exp_item in parsed_data.get("experience") or []:
                if isinstance(exp_item, dict):
                    des = exp_item.get("designation")
                    if des and isinstance(des, str) and des.strip():
                        designations.add(des.strip())
                    r = exp_item.get("role")
                    if r and isinstance(r, str) and r.strip():
                        roles.add(r.strip())

            # Projects array items for roles/designations if present
            for proj in parsed_data.get("projects") or []:
                if isinstance(proj, dict):
                    r = proj.get("role")
                    if r and isinstance(r, str) and r.strip():
                        roles.add(r.strip())

            # Education array items for year_of_passing
            for edu_item in parsed_data.get("education") or []:
                if isinstance(edu_item, dict):
                    yop = edu_item.get("year_of_passing")
                    if yop and isinstance(yop, (str, int)) and str(yop).strip():
                        year_of_passing.add(str(yop).strip())

            # Experience levels (check both parsed_data and ai_evaluation)
            if parsed_data.get("experience_level"):
                experience_levels.add(str(parsed_data["experience_level"]).strip())
            if ai_eval.get("experience_level"):
                experience_levels.add(str(ai_eval["experience_level"]).strip())

            # AI technical scores
            score = ai_eval.get("ai_technical_score")
            if score is not None and isinstance(score, (int, float)):
                ai_technical_scores.add(int(score))

            # Personality analysis
            p_analysis = ai_eval.get("personality_analysis")
            if p_analysis and isinstance(p_analysis, dict) and p_analysis not in personality_analysis_list:
                personality_analysis_list.append(p_analysis)

        return {
            "locations": sorted(list(locations)),
            "total_experience_years": sorted(list(total_experience_years)),
            "primary_skills": sorted(list(primary_skills)),
            "frameworks": sorted(list(frameworks)),
            "databases": sorted(list(databases)),
            "designations": sorted(list(designations)),
            "roles": sorted(list(roles)),
            "year_of_passing": sorted(list(year_of_passing)),
            "experience_levels": sorted(list(experience_levels)),
            "ai_technical_scores": sorted(list(ai_technical_scores)),
            "personality_analysis": personality_analysis_list,
        }

    async def merge_resume(self, new_resume_id: str, existing_resume_id: str, user_id: str, is_admin: bool = False) -> ResumeResponse:
        """Merge a newly uploaded resume into an existing candidate profile."""
        new_resume = await self.resume_repo.get_by_id(new_resume_id)
        existing_resume = await self.resume_repo.get_by_id(existing_resume_id)

        if not new_resume or not existing_resume:
            raise NotFoundError("One or both resumes not found.")
        if not is_admin and (new_resume["user_id"] != user_id or existing_resume["user_id"] != user_id):
            raise NotFoundError("Resumes not found.")

        # Prepare update for the existing resume
        update_fields: Dict[str, Any] = {}
        
        # Merge parsed data (new overwrites old)
        current_parsed = existing_resume.get("parsed_data") or {}
        if new_resume.get("parsed_data"):
            current_parsed.update(new_resume["parsed_data"])
        update_fields["parsed_data"] = current_parsed
        
        # Update AI evaluation
        if new_resume.get("ai_evaluation"):
            update_fields["ai_evaluation"] = new_resume["ai_evaluation"]
            
        # Update text
        if new_resume.get("extracted_text"):
            update_fields["extracted_text"] = new_resume["extracted_text"]
            
        # Move the new file to other_documents (or set it as main and move old to other)
        # Let's set the new one as main and move old to other
        other_docs = existing_resume.get("other_documents") or []
        other_docs.append({
            "filename": existing_resume.get("original_filename"),
            "s3_url": existing_resume.get("s3_url"),
            "doc_type": "Previous Resume",
            "uploaded_at": existing_resume.get("upload_date")
        })
        
        update_fields["other_documents"] = other_docs
        update_fields["filename"] = new_resume.get("filename")
        update_fields["original_filename"] = new_resume.get("original_filename")
        update_fields["file_path"] = new_resume.get("file_path")
        update_fields["s3_url"] = new_resume.get("s3_url")
        update_fields["file_hash"] = new_resume.get("file_hash")
        
        # Add HR update
        hr_update = {
            "comment": f"Profile updated automatically from new upload {new_resume.get('original_filename')}",
            "author": "System",
            "updated_at": utc_now().isoformat()
        }

        updated_doc = await self.resume_repo.update_resume_fields(existing_resume_id, update_fields, hr_update=hr_update)
        
        # Delete the new resume document from DB (but keep the file on disk/S3 since we transferred it)
        await self.resume_repo.delete(new_resume_id)
        
        return ResumeResponse.model_validate(updated_doc)

    async def upload_additional_document(self, resume_id: str, user_id: str, file: UploadFile, doc_type: str, doc_title: Optional[str] = None, is_admin: bool = False) -> ResumeResponse:
        """Upload an auxiliary document to a candidate profile."""
        resume = await self.resume_repo.get_by_id(resume_id)
        if not resume:
            raise NotFoundError("Resume not found.")
        if not is_admin and resume["user_id"] != user_id:
            raise NotFoundError("Resume not found.")
            
        if not file.filename:
            raise FileUploadError("No filename provided.")

        original_filename = sanitize_filename(file.filename)
        content = await validate_uploaded_file(file)

        ext = original_filename.rsplit(".", 1)[-1].lower()
        doc_id = generate_uuid()
        unique_filename = f"{doc_id}_{original_filename}"
        file_path = str(self.upload_dir / unique_filename)

        with open(file_path, "wb") as f:
            f.write(content)

        content_type = file.content_type or "application/octet-stream"
        s3_url = self.s3_service.upload_file(content, unique_filename, content_type)
        
        new_doc = {
            "title": doc_title or original_filename,
            "filename": original_filename,
            "s3_url": s3_url,
            "doc_type": doc_type,
            "uploaded_at": utc_now().isoformat()
        }
        
        other_docs = resume.get("other_documents") or []
        other_docs.append(new_doc)
        
        updated_doc = await self.resume_repo.update_resume_fields(resume_id, {"other_documents": other_docs})
        return ResumeResponse.model_validate(updated_doc)

    async def get_resume_logs(self, resume_id: str, user_id: str, is_admin: bool = False) -> ResumeLogListResponse:
        """Fetch version history logs for a resume."""
        resume = await self.resume_repo.get_by_id(resume_id)
        if not resume:
            raise NotFoundError("Resume not found.")
        if not is_admin and resume["user_id"] != user_id:
            raise NotFoundError("Resume not found.")

        logs = await self.resume_log_repo.get_logs_by_resume_id(resume_id)
        items = [ResumeLogResponse.model_validate(l) for l in logs]
        return ResumeLogListResponse(total=len(items), logs=items)
