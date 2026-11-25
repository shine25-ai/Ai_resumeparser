"""
Candidate service for Phase 6 (SRS 4.10):
- Search & multi-field filter
- Candidate 360 profile aggregation
- Profile updates, tags, notes
- Duplicate detection & merge
- Bulk actions & CSV export
"""

import csv
import io
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.core.tenant import current_company_id
from app.models.candidate import (
    CandidateDocument,
    CandidateFileDocument,
    normalize_email,
    normalize_phone,
    with_candidate_defaults,
)
from app.services.audit_service import diff, record_audit
from app.utils.constants import (
    AUDIT_LOGS_COLLECTION,
    CANDIDATE_DOCUMENTS_COLLECTION,
    CANDIDATES_COLLECTION,
    INTERVIEWS_COLLECTION,
    JOB_APPLICATIONS_COLLECTION,
    RESUMES_COLLECTION,
)
from app.utils.helpers import generate_uuid, utc_now


async def ensure_candidate_indexes(db: AsyncIOMotorDatabase) -> None:
    """Ensure required compound indexes exist for candidate collections."""
    try:
        await db[CANDIDATES_COLLECTION].create_index([("company_id", 1), ("normalized_email", 1)])
        await db[CANDIDATES_COLLECTION].create_index([("company_id", 1), ("normalized_phone", 1)])
        await db[CANDIDATE_DOCUMENTS_COLLECTION].create_index([("company_id", 1), ("candidate_id", 1)])
    except Exception:
        pass


async def _follow_merges(db: Any, candidate: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """A merged candidate points at the one it was merged into; return the live record."""
    seen = set()
    while candidate and candidate.get("merged_into") and candidate["merged_into"] not in seen:
        seen.add(candidate["id"])
        candidate = await db[CANDIDATES_COLLECTION].find_one({"id": candidate["merged_into"]})
    return candidate


async def link_resume_to_candidate(
    db: Any,
    resume_id: str,
    *,
    source: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    uploaded_by: Optional[str] = None,
) -> Optional[str]:
    """
    Give a resume its candidate (SRS 4.10). Used by portal uploads (single and bulk) once the parser
    finishes, and by the careers form when an application is sent.

    - A resume already linked (`candidate_ref`) keeps its candidate; only the document copy is refreshed.
    - Otherwise the candidate with the same email in this company is used (following merges).
    - Otherwise a new candidate is created. A different email with the same phone is NOT merged: it becomes
      a new candidate and shows in the duplicate review (P6-05).

    `details` overrides what the parser read (the careers form sends what the applicant entered).
    Resumes keep their CND code in `candidate_id`; the link to the candidate record is `candidate_ref`.
    Returns the candidate's ID, or None when the resume does not exist or has no company.
    """
    resume = await db[RESUMES_COLLECTION].find_one({"id": resume_id})
    if not resume:
        return None
    company_id = current_company_id() or resume.get("company_id")
    if not company_id:
        return None

    pd = resume.get("parsed_data") or {}
    d = {k: v for k, v in (details or {}).items() if v not in (None, "", [])}
    email = d.get("email") or resume.get("applicant_email") or pd.get("email") or ""
    phone = d.get("phone") or pd.get("phone") or pd.get("phone_number") or ""
    norm_em, norm_ph = normalize_email(email), normalize_phone(phone)
    skills = d.get("skills") or pd.get("primary_skills") or pd.get("skills") or []
    if not isinstance(skills, list):
        skills = []
    now = utc_now().isoformat()

    candidate = None
    if resume.get("candidate_ref"):
        candidate = await _follow_merges(db, await db[CANDIDATES_COLLECTION].find_one({"id": resume["candidate_ref"]}))
    if not candidate and norm_em:
        candidate = await _follow_merges(db, await db[CANDIDATES_COLLECTION].find_one({"normalized_email": norm_em}))

    if candidate:
        candidate_id = candidate["id"]
        fill: Dict[str, Any] = {"updated_at": now}
        for field in ("location", "linkedin", "portfolio", "current_role"):
            value = d.get(field) or pd.get(field)
            if value and not candidate.get(field):
                fill[field] = value
        if candidate.get("total_experience_years") is None:
            years = d.get("total_experience_years", pd.get("total_experience_years"))
            if years is not None:
                fill["total_experience_years"] = years
        if skills:
            fill["skills"] = list(dict.fromkeys([*(candidate.get("skills") or []), *skills]))
        if phone and norm_ph and norm_ph != candidate.get("normalized_phone"):
            fill["phones"] = list(dict.fromkeys([*(candidate.get("phones") or []), phone]))
        if not candidate.get("candidate_id_display") and resume.get("candidate_id"):
            fill["candidate_id_display"] = resume["candidate_id"]
        await db[CANDIDATES_COLLECTION].update_one({"id": candidate_id}, {"$set": fill})
    else:
        candidate_id = generate_uuid()
        name = (d.get("full_name") or pd.get("full_name") or pd.get("name") or resume.get("candidate_name")
                or (email.split("@")[0] if email else "") or resume.get("original_filename") or "Candidate")
        doc = CandidateDocument(
            id=candidate_id,
            company_id=company_id,
            full_name=name,
            email=email,
            normalized_email=norm_em,
            phone=phone,
            normalized_phone=norm_ph,
            location=d.get("location") or pd.get("location") or "",
            linkedin=d.get("linkedin") or pd.get("linkedin") or "",
            portfolio=d.get("portfolio") or pd.get("portfolio") or "",
            total_experience_years=d.get("total_experience_years", pd.get("total_experience_years")),
            current_role=d.get("current_role") or pd.get("current_role") or "",
            skills=list(dict.fromkeys(skills)),
            source=source or resume.get("resume_source") or "Upload",
            candidate_id_display=resume.get("candidate_id"),
            created_at=now,
            updated_at=now,
        ).to_dict()
        if norm_ph and len(norm_ph) >= 7:
            same_phone = await db[CANDIDATES_COLLECTION].find(
                {"normalized_phone": norm_ph, "merged_into": None}, {"_id": 0, "id": 1}
            ).to_list(length=10)
            if same_phone:
                doc["possible_duplicate_of"] = [c["id"] for c in same_phone]
        await db[CANDIDATES_COLLECTION].insert_one(doc)

    await db[CANDIDATE_DOCUMENTS_COLLECTION].update_one(
        {"id": resume_id},
        {"$set": CandidateFileDocument(
            id=resume_id,
            company_id=company_id,
            candidate_id=candidate_id,
            original_filename=resume.get("original_filename") or resume.get("filename") or "resume.pdf",
            filename=resume.get("filename") or "resume.pdf",
            file_path=resume.get("file_path") or "",
            s3_url=resume.get("s3_url"),
            file_hash=resume.get("file_hash"),
            extracted_text=resume.get("extracted_text"),
            parsed_data=pd,
            ai_evaluation=resume.get("ai_evaluation") or {},
            confidence=resume.get("confidence") or {},
            status=str(resume.get("status") or "PENDING"),
            uploaded_by=uploaded_by or resume.get("uploaded_by_email") or resume.get("user_id"),
            upload_date=str(resume.get("upload_date") or now),
            created_at=str(resume.get("created_at") or now),
            updated_at=now,
        ).to_dict()},
        upsert=True,
    )
    if resume.get("candidate_ref") != candidate_id:
        await db[RESUMES_COLLECTION].update_one({"id": resume_id}, {"$set": {"candidate_ref": candidate_id}})
    return candidate_id


class CandidateService:
    def __init__(self, db: Any):
        self.db = db

    @property
    def candidates(self):
        return self.db[CANDIDATES_COLLECTION]

    @property
    def documents(self):
        return self.db[CANDIDATE_DOCUMENTS_COLLECTION]

    @property
    def applications(self):
        return self.db[JOB_APPLICATIONS_COLLECTION]

    @property
    def interviews(self):
        return self.db[INTERVIEWS_COLLECTION]

    @property
    def audit_logs(self):
        return self.db[AUDIT_LOGS_COLLECTION]

    # ── 1. List with search, multi-field filters & sorting ────────────────────

    async def list(
        self,
        q: str = "",
        job_id: str = "",
        stage: str = "",
        source: str = "",
        location: str = "",
        min_experience: Optional[float] = None,
        max_experience: Optional[float] = None,
        tags: Optional[List[str]] = None,
        owner_id: str = "",
        date_from: str = "",
        date_to: str = "",
        sort_by: str = "latest",
        page: int = 1,
        limit: int = 25,
    ) -> Dict[str, Any]:
        query: Dict[str, Any] = {
            "$or": [{"merged_into": None}, {"merged_into": {"$exists": False}}, {"merged_into": ""}]
        }

        # Candidate text search (name, email, phone, skill)
        if q and q.strip():
            rx = {"$regex": re.escape(q.strip()), "$options": "i"}
            query["$and"] = [
                {
                    "$or": [
                        {"full_name": rx},
                        {"email": rx},
                        {"phone": rx},
                        {"skills": rx},
                        {"location": rx},
                        {"current_role": rx},
                    ]
                }
            ]

        if source:
            query["source"] = source

        if location:
            query["location"] = {"$regex": re.escape(location.strip()), "$options": "i"}

        if min_experience is not None or max_experience is not None:
            exp_q: Dict[str, Any] = {}
            if min_experience is not None:
                exp_q["$gte"] = float(min_experience)
            if max_experience is not None:
                exp_q["$lte"] = float(max_experience)
            query["total_experience_years"] = exp_q

        if tags:
            clean_tags = [t.strip() for t in tags if t and t.strip()]
            if clean_tags:
                query["tags"] = {"$all": clean_tags}

        if owner_id:
            query["owner_id"] = owner_id

        if date_from or date_to:
            dt_q: Dict[str, Any] = {}
            if date_from:
                dt_q["$gte"] = date_from
            if date_to:
                dt_q["$lte"] = date_to
            query["created_at"] = dt_q

        # Job or stage filter narrows candidate IDs via job_applications
        if job_id or stage:
            app_query: Dict[str, Any] = {}
            if job_id:
                app_query["opening_id"] = job_id
            if stage and stage.upper() != "ALL":
                app_query["stage"] = stage.upper()
            matching_apps = await self.applications.find(app_query, {"candidate_id": 1, "applicant_email": 1}).to_list(length=10000)
            cand_ids = {a.get("candidate_id") for a in matching_apps if a.get("candidate_id")}
            cand_emails = {a.get("applicant_email", "").strip().lower() for a in matching_apps if a.get("applicant_email")}
            cand_id_list = list(cand_ids)
            cand_email_list = list(cand_emails)

            id_or = []
            if cand_id_list:
                id_or.append({"id": {"$in": cand_id_list}})
            if cand_email_list:
                id_or.append({"normalized_email": {"$in": cand_email_list}})

            if not id_or:
                return {"items": [], "total": 0, "page": page, "limit": limit, "total_pages": 0}
            
            if "$and" in query:
                query["$and"].append({"$or": id_or})
            else:
                query["$and"] = [{"$or": id_or}]

        # Sort order
        sort_field = "created_at"
        sort_dir = -1
        if sort_by == "oldest":
            sort_dir = 1
        elif sort_by == "experience_desc":
            sort_field = "total_experience_years"
            sort_dir = -1
        elif sort_by == "experience_asc":
            sort_field = "total_experience_years"
            sort_dir = 1
        elif sort_by == "name":
            sort_field = "full_name"
            sort_dir = 1

        total = await self.candidates.count_documents(query)
        total_pages = (total + limit - 1) // limit if limit > 0 else 1

        rows = (
            await self.candidates.find(query, {"_id": 0})
            .sort(sort_field, sort_dir)
            .skip((page - 1) * limit)
            .limit(limit)
            .to_list(length=limit)
        )

        candidate_ids = [r["id"] for r in rows]
        candidate_emails = [r.get("normalized_email") or normalize_email(r.get("email")) for r in rows]

        # Fetch applications for candidates to attach active jobs/stages
        apps_cursor = self.applications.find(
            {"$or": [{"candidate_id": {"$in": candidate_ids}}, {"applicant_email": {"$in": candidate_emails}}]},
            {"_id": 0, "id": 1, "candidate_id": 1, "applicant_email": 1, "opening_id": 1, "opening_title": 1, "stage": 1, "submitted_at": 1},
        ).sort("submitted_at", -1)
        all_apps = await apps_cursor.to_list(length=1000)

        apps_by_cand: Dict[str, List[Dict[str, Any]]] = {}
        for a in all_apps:
            cid = a.get("candidate_id")
            em = normalize_email(a.get("applicant_email"))
            if cid:
                apps_by_cand.setdefault(cid, []).append(a)
            if em:
                apps_by_cand.setdefault(em, []).append(a)

        items = []
        for r in rows:
            c = with_candidate_defaults(r)
            c_apps = apps_by_cand.get(c["id"]) or apps_by_cand.get(c.get("normalized_email", "")) or []
            # Deduplicate applications in case matched by both id and email
            seen_app_ids = set()
            unique_apps = []
            for app in c_apps:
                if app["id"] not in seen_app_ids:
                    seen_app_ids.add(app["id"])
                    unique_apps.append(app)
            latest_app = unique_apps[0] if unique_apps else None
            c["applications"] = unique_apps
            c["latest_application"] = latest_app
            c["stage"] = latest_app.get("stage", "APPLIED") if latest_app else "SOURCED"
            items.append(c)

        return {
            "items": items,
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": total_pages,
        }

    # ── 2. Summary stats ──────────────────────────────────────────────────────

    async def get_summary_stats(self) -> Dict[str, Any]:
        base_filter: Dict[str, Any] = {
            "$or": [{"merged_into": None}, {"merged_into": {"$exists": False}}, {"merged_into": ""}]
        }
        total_candidates = await self.candidates.count_documents(base_filter)

        # Count active in pipeline (not HIRED / REJECTED)
        hired_apps = await self.applications.find({"stage": {"$in": ["HIRED", "Hired"]}}, {"candidate_id": 1, "applicant_email": 1}).to_list(length=5000)
        hired_cands = {a.get("candidate_id") or normalize_email(a.get("applicant_email")) for a in hired_apps}

        active_apps = await self.applications.find(
            {"stage": {"$nin": ["HIRED", "Hired", "REJECTED", "Rejected", "CLOSED", "Closed"]}},
            {"candidate_id": 1, "applicant_email": 1},
        ).to_list(length=5000)
        active_cands = {a.get("candidate_id") or normalize_email(a.get("applicant_email")) for a in active_apps}

        duplicates = await self.get_duplicates()

        return {
            "total_candidates": total_candidates,
            "active_pipeline": len(active_cands),
            "hired": len(hired_cands),
            "possible_duplicates": len(duplicates),
        }

    # ── 3. Candidate 360 View ────────────────────────────────────────────────

    async def resolve_id(self, any_id: str) -> str:
        """
        Profile links still arrive with a resume ID or a CND code (applications, interviews, the old
        /evaluation/:id links). Turn any of these into the candidate's ID, linking the resume on the way when
        needed; follow merges. An unknown ID is returned unchanged (the caller then reports "not found").
        """
        c = await self.candidates.find_one({"id": any_id}, {"_id": 0, "id": 1, "merged_into": 1})
        if c:
            live = await _follow_merges(self.db, c)
            return (live or c)["id"]
        resume = await self.db[RESUMES_COLLECTION].find_one(
            {"$or": [{"id": any_id}, {"candidate_id": any_id}]}, {"_id": 0, "id": 1, "candidate_ref": 1})
        if resume:
            if resume.get("candidate_ref"):
                live = await _follow_merges(self.db, await self.candidates.find_one({"id": resume["candidate_ref"]}))
                if live:
                    return live["id"]
            return await link_resume_to_candidate(self.db, resume["id"]) or any_id
        return any_id

    async def get(self, candidate_id: str) -> Dict[str, Any]:
        candidate_id = await self.resolve_id(candidate_id)
        c = await self.candidates.find_one({"id": candidate_id}, {"_id": 0})
        if not c:
            raise NotFoundError("Candidate not found.")

        cand = with_candidate_defaults(c)
        norm_email = cand.get("normalized_email") or normalize_email(cand.get("email"))

        # Documents
        docs = await self.documents.find({"candidate_id": candidate_id}, {"_id": 0}).sort("upload_date", -1).to_list(length=100)
        if not docs and norm_email:
            # Fallback check on resumes collection if migration hasn't run yet or direct read
            legacy_resumes = await self.db[RESUMES_COLLECTION].find(
                {"$or": [{"candidate_ref": candidate_id}, {"applicant_email": norm_email}, {"parsed_data.email": norm_email}]},
                {"_id": 0},
            ).sort("upload_date", -1).to_list(length=10)
            for lr in legacy_resumes:
                docs.append({
                    "id": lr.get("id"),
                    "candidate_id": candidate_id,
                    "original_filename": lr.get("original_filename") or lr.get("filename", "resume.pdf"),
                    "filename": lr.get("filename", "resume.pdf"),
                    "file_path": lr.get("file_path", ""),
                    "s3_url": lr.get("s3_url"),
                    "status": lr.get("status", "PARSED"),
                    "confidence": lr.get("confidence") or {},
                    "parsed_data": lr.get("parsed_data") or {},
                    "ai_evaluation": lr.get("ai_evaluation") or {},
                    "upload_date": lr.get("upload_date") or lr.get("created_at"),
                })

        # Applications
        apps = await self.applications.find(
            {"$or": [{"candidate_id": candidate_id}, {"applicant_email": norm_email}]},
            {"_id": 0},
        ).sort("submitted_at", -1).to_list(length=100)

        # Interviews (by candidate_id or resume_id)
        resume_ids = [d["id"] for d in docs if "id" in d]
        inv_query: Dict[str, Any] = {"$or": [{"candidate_id": candidate_id}]}
        if resume_ids:
            inv_query["$or"].append({"resume_id": {"$in": resume_ids}})
        interviews = await self.interviews.find(inv_query, {"_id": 0}).sort("scheduled_date", -1).to_list(length=50)

        # Audit logs for activity timeline
        logs = await self.audit_logs.find(
            {"$or": [{"entity_id": candidate_id}, {"metadata.candidate_id": candidate_id}]},
            {"_id": 0}
        ).sort("created_at", -1).to_list(length=100)

        # Notes (stored in candidate document)
        notes = list(cand.get("notes") or [])

        return {
            **cand,
            "documents": docs,
            "applications": apps,
            "interviews": interviews,
            "notes": notes,
            "activity": logs,
        }

    # ── 4. Updates, Tags, Notes ──────────────────────────────────────────────

    async def update(self, candidate_id: str, payload: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
        candidate_id = await self.resolve_id(candidate_id)
        existing = await self.candidates.find_one({"id": candidate_id})
        if not existing:
            raise NotFoundError("Candidate not found.")

        allowed = {
            "full_name", "email", "phone", "location", "linkedin", "portfolio",
            "total_experience_years", "current_role", "skills", "owner_id", "owner_name", "status"
        }
        updates: Dict[str, Any] = {}
        for k, v in payload.items():
            if k in allowed:
                updates[k] = v

        if "email" in updates and updates["email"]:
            updates["normalized_email"] = normalize_email(updates["email"])
            emails = list(existing.get("emails") or [])
            if updates["email"] not in emails:
                emails.append(updates["email"])
            updates["emails"] = emails

        if "phone" in updates and updates["phone"]:
            updates["normalized_phone"] = normalize_phone(updates["phone"])
            phones = list(existing.get("phones") or [])
            if updates["phone"] not in phones:
                phones.append(updates["phone"])
            updates["phones"] = phones

        updates["updated_at"] = utc_now().isoformat()

        changes = diff(existing, updates, list(updates.keys()))
        await self.candidates.update_one({"id": candidate_id}, {"$set": updates})

        # Dual-write sync to resumes if exists
        try:
            resume_sync: Dict[str, Any] = {}
            if "full_name" in updates:
                resume_sync["parsed_data.full_name"] = updates["full_name"]
            if "phone" in updates:
                resume_sync["parsed_data.phone"] = updates["phone"]
            if "location" in updates:
                resume_sync["parsed_data.location"] = updates["location"]
            if "total_experience_years" in updates:
                resume_sync["parsed_data.total_experience_years"] = updates["total_experience_years"]
            if "skills" in updates:
                resume_sync["parsed_data.primary_skills"] = updates["skills"]
            if resume_sync:
                await self.db[RESUMES_COLLECTION].update_many(
                    {"$or": [{"candidate_id": candidate_id}, {"applicant_email": existing.get("email")}]},
                    {"$set": resume_sync},
                )
        except Exception:
            pass

        await record_audit(
            db=self.db,
            actor=user,
            action="CANDIDATE_UPDATED",
            entity_type="candidate",
            entity_id=candidate_id,
            entity_label=updates.get("full_name") or existing.get("full_name", ""),
            changes=changes,
        )

        return await self.get(candidate_id)

    async def update_tags(self, candidate_id: str, tags: List[str], user: Dict[str, Any]) -> Dict[str, Any]:
        candidate_id = await self.resolve_id(candidate_id)
        existing = await self.candidates.find_one({"id": candidate_id})
        if not existing:
            raise NotFoundError("Candidate not found.")

        clean_tags = list(dict.fromkeys(t.strip() for t in tags if t and t.strip()))
        now = utc_now().isoformat()
        await self.candidates.update_one({"id": candidate_id}, {"$set": {"tags": clean_tags, "updated_at": now}})

        # Dual-write to resumes
        await self.db[RESUMES_COLLECTION].update_many(
            {"$or": [{"candidate_id": candidate_id}, {"applicant_email": existing.get("email")}]},
            {"$set": {"tags": clean_tags, "updated_at": now}},
        )

        await record_audit(
            db=self.db,
            actor=user,
            action="CANDIDATE_TAGS_UPDATED",
            entity_type="candidate",
            entity_id=candidate_id,
            entity_label=existing.get("full_name", ""),
            details=f"Tags updated: {', '.join(clean_tags) or 'cleared'}",
        )
        return {"candidate_id": candidate_id, "tags": clean_tags}

    async def add_note(self, candidate_id: str, text: str, user: Dict[str, Any], mentions: Optional[List[str]] = None) -> Dict[str, Any]:
        if not text or not text.strip():
            raise BadRequestError("Note text cannot be empty.")
        candidate_id = await self.resolve_id(candidate_id)

        existing = await self.candidates.find_one({"id": candidate_id})
        if not existing:
            raise NotFoundError("Candidate not found.")

        note_id = generate_uuid()
        now = utc_now().isoformat()
        note = {
            "id": note_id,
            "text": text.strip(),
            "author_id": user.get("id", "user"),
            "author_name": user.get("full_name") or user.get("name") or user.get("email", "Staff"),
            "author_email": user.get("email", ""),
            "mentions": mentions or [],
            "created_at": now,
        }

        await self.candidates.update_one(
            {"id": candidate_id},
            {"$push": {"notes": {"$each": [note], "$position": 0}}, "$set": {"updated_at": now}},
        )

        # Dual-write to resumes
        await self.db[RESUMES_COLLECTION].update_many(
            {"$or": [{"candidate_id": candidate_id}, {"applicant_email": existing.get("email")}]},
            {"$push": {"notes": {"$each": [note], "$position": 0}}, "$set": {"updated_at": now}},
        )

        await record_audit(
            db=self.db,
            actor=user,
            action="CANDIDATE_NOTE_ADDED",
            entity_type="candidate",
            entity_id=candidate_id,
            entity_label=existing.get("full_name", ""),
            details=f"Added note: {text[:80]}...",
        )
        return note

    async def remove_note(self, candidate_id: str, note_id: str, user: Dict[str, Any]) -> None:
        candidate_id = await self.resolve_id(candidate_id)
        existing = await self.candidates.find_one({"id": candidate_id})
        if not existing:
            raise NotFoundError("Candidate not found.")

        now = utc_now().isoformat()
        await self.candidates.update_one(
            {"id": candidate_id},
            {"$pull": {"notes": {"id": note_id}}, "$set": {"updated_at": now}},
        )
        await self.db[RESUMES_COLLECTION].update_many(
            {"$or": [{"candidate_id": candidate_id}, {"applicant_email": existing.get("email")}]},
            {"$pull": {"notes": {"id": note_id}}, "$set": {"updated_at": now}},
        )

        await record_audit(
            db=self.db,
            actor=user,
            action="CANDIDATE_NOTE_REMOVED",
            entity_type="candidate",
            entity_id=candidate_id,
            entity_label=existing.get("full_name", ""),
            details=f"Removed note ID {note_id}",
        )

    # ── 5. Duplicate Detection & Merge ────────────────────────────────────────

    async def get_duplicates(self) -> List[Dict[str, Any]]:
        # Find active non-merged candidates
        query = {"$or": [{"merged_into": None}, {"merged_into": {"$exists": False}}, {"merged_into": ""}]}
        cands = await self.candidates.find(query, {"_id": 0}).sort("created_at", -1).to_list(length=5000)

        by_email: Dict[str, List[Dict[str, Any]]] = {}
        by_phone: Dict[str, List[Dict[str, Any]]] = {}

        for c in cands:
            em = c.get("normalized_email") or normalize_email(c.get("email"))
            ph = c.get("normalized_phone") or normalize_phone(c.get("phone"))
            if em:
                by_email.setdefault(em, []).append(c)
            if ph and len(ph) >= 7:
                by_phone.setdefault(ph, []).append(c)

        groups = []
        seen_pairs = set()

        def _cand_card(c: Dict[str, Any]) -> Dict[str, Any]:
            return {
                "id": c["id"],
                "full_name": c.get("full_name", "Candidate"),
                "email": c.get("email", ""),
                "phone": c.get("phone", ""),
                "current_role": c.get("current_role", ""),
                "total_experience_years": c.get("total_experience_years"),
                "skills": (c.get("skills") or [])[:5],
                "created_at": c.get("created_at", ""),
            }

        for match_label, bucket in (("Matching Email", by_email), ("Matching Phone", by_phone)):
            for key_val, docs in bucket.items():
                if len(docs) < 2:
                    continue
                sorted_docs = sorted(docs, key=lambda d: str(d.get("created_at") or ""), reverse=True)
                id_tuple = tuple(sorted(d["id"] for d in sorted_docs))
                if id_tuple in seen_pairs:
                    continue
                seen_pairs.add(id_tuple)
                groups.append({
                    "id": f"{match_label.lower().replace(' ', '_')}_{key_val}",
                    "match_type": match_label,
                    "matched_value": key_val,
                    "reason": f"{match_label}: {key_val}",
                    "candidates": [_cand_card(d) for d in sorted_docs[:4]],
                })

        return groups[:50]

    async def merge(self, primary_id: str, secondary_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
        if primary_id == secondary_id:
            raise BadRequestError("Primary and secondary candidate IDs must be different.")

        primary = await self.candidates.find_one({"id": primary_id})
        secondary = await self.candidates.find_one({"id": secondary_id})

        if not primary or not secondary:
            raise NotFoundError("One or both candidate records do not exist.")
        if primary.get("merged_into") or secondary.get("merged_into"):
            raise ConflictError("One of these candidates has already been merged into another record.")

        now = utc_now().isoformat()

        # 1. Merge skills, tags, notes, emails, phones
        p_skills = list(primary.get("skills") or [])
        s_skills = list(secondary.get("skills") or [])
        merged_skills = list(dict.fromkeys([*p_skills, *s_skills]))

        merged_tags = list(dict.fromkeys([*(primary.get("tags") or []), *(secondary.get("tags") or []), "Merged"]))
        merged_notes = [*(primary.get("notes") or []), *(secondary.get("notes") or [])]

        merged_emails = list(dict.fromkeys([
            *(primary.get("emails") or [primary.get("email")]),
            *(secondary.get("emails") or [secondary.get("email")]),
        ]))
        merged_phones = list(dict.fromkeys([
            *(primary.get("phones") or [primary.get("phone")]),
            *(secondary.get("phones") or [secondary.get("phone")]),
        ]))

        p_exp = primary.get("total_experience_years")
        s_exp = secondary.get("total_experience_years")
        max_exp = max(p_exp, s_exp) if p_exp is not None and s_exp is not None else (p_exp or s_exp)

        # 2. Update primary candidate
        await self.candidates.update_one(
            {"id": primary_id},
            {
                "$set": {
                    "skills": merged_skills,
                    "tags": merged_tags,
                    "notes": merged_notes,
                    "emails": [e for e in merged_emails if e],
                    "phones": [p for p in merged_phones if p],
                    "total_experience_years": max_exp,
                    "updated_at": now,
                }
            },
        )

        # 3. Update secondary candidate
        await self.candidates.update_one(
            {"id": secondary_id},
            {"$set": {"merged_into": primary_id, "status": "merged", "updated_at": now}},
        )

        # 4. Consolidate applications
        await self.applications.update_many(
            {"candidate_id": secondary_id},
            {"$set": {"candidate_id": primary_id}},
        )

        # 5. Consolidate candidate_documents
        await self.documents.update_many(
            {"candidate_id": secondary_id},
            {"$set": {"candidate_id": primary_id}},
        )

        # 6. Consolidate interviews
        await self.interviews.update_many(
            {"candidate_id": secondary_id},
            {"$set": {"candidate_id": primary_id}},
        )

        # 7. The secondary's resumes now belong to the primary (resumes keep their CND code in candidate_id;
        #    `redirect_id` is a resume-to-resume link and is left alone, or the resumes would vanish from lists).
        await self.db[RESUMES_COLLECTION].update_many(
            {"candidate_ref": secondary_id},
            {"$set": {"candidate_ref": primary_id, "updated_at": now}},
        )

        await record_audit(
            db=self.db,
            actor=user,
            action="CANDIDATE_MERGED",
            entity_type="candidate",
            entity_id=primary_id,
            entity_label=primary.get("full_name", ""),
            details=f"Merged candidate {secondary.get('full_name')} ({secondary_id}) into {primary.get('full_name')} ({primary_id}).",
            changes={"merged_secondary_id": secondary_id},
        )

        return {
            "primary_id": primary_id,
            "secondary_id": secondary_id,
            "merged_skills_count": len(merged_skills),
            "merged_tags_count": len(merged_tags),
        }

    # ── 6. Bulk Actions ───────────────────────────────────────────────────────

    async def bulk_action(
        self,
        candidate_ids: List[str],
        action: str,
        value: Any,
        user: Dict[str, Any],
    ) -> Dict[str, Any]:
        if not candidate_ids:
            return {"updated": 0}

        now = utc_now().isoformat()
        act = action.strip().lower()

        if act == "add_tags":
            tags_to_add = value if isinstance(value, list) else [str(value)]
            clean_tags = [t.strip() for t in tags_to_add if t and t.strip()]
            res = await self.candidates.update_many(
                {"id": {"$in": candidate_ids}},
                {"$addToSet": {"tags": {"$each": clean_tags}}, "$set": {"updated_at": now}},
            )
            count = res.modified_count
        elif act == "remove_tags":
            tags_to_remove = value if isinstance(value, list) else [str(value)]
            res = await self.candidates.update_many(
                {"id": {"$in": candidate_ids}},
                {"$pullAll": {"tags": tags_to_remove}, "$set": {"updated_at": now}},
            )
            count = res.modified_count
        elif act == "assign_owner":
            owner_id = (value or {}).get("owner_id", "")
            owner_name = (value or {}).get("owner_name", "")
            res = await self.candidates.update_many(
                {"id": {"$in": candidate_ids}},
                {"$set": {"owner_id": owner_id, "owner_name": owner_name, "updated_at": now}},
            )
            count = res.modified_count
        elif act == "update_status":
            st = str(value).strip().lower()
            res = await self.candidates.update_many(
                {"id": {"$in": candidate_ids}},
                {"$set": {"status": st, "updated_at": now}},
            )
            count = res.modified_count
        else:
            raise BadRequestError(f"Unsupported bulk action '{action}'.")

        await record_audit(
            db=self.db,
            actor=user,
            action="CANDIDATES_BULK_ACTION",
            entity_type="candidate",
            details=f"Bulk action '{action}' executed for {count} candidates.",
        )

        return {"action": action, "updated": count}

    # ── 7. CSV Export ─────────────────────────────────────────────────────────

    async def export_csv(
        self,
        candidate_ids: Optional[List[str]] = None,
        q: str = "",
        job_id: str = "",
        stage: str = "",
        source: str = "",
        location: str = "",
        min_experience: Optional[float] = None,
        max_experience: Optional[float] = None,
        tags: Optional[List[str]] = None,
        owner_id: str = "",
        user: Optional[Dict[str, Any]] = None,
    ) -> str:
        if candidate_ids and isinstance(candidate_ids, list):
            query_filter = {"id": {"$in": candidate_ids}, "$or": [{"merged_into": None}, {"merged_into": {"$exists": False}}, {"merged_into": ""}]}
            cursor = self.candidates.find(query_filter).sort("created_at", -1)
            docs = await cursor.to_list(length=len(candidate_ids))
            items = [with_candidate_defaults(d) for d in docs]
        else:
            # Fetch up to 5,000 matching candidates
            data = await self.list(
                q=q or "",
                job_id=job_id,
                stage=stage,
                source=source,
                location=location,
                min_experience=min_experience,
                max_experience=max_experience,
                tags=tags,
                owner_id=owner_id,
                page=1,
                limit=5000,
            )
            items = data["items"]

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "ID", "Full Name", "Email", "Phone", "Current Role", "Experience (Years)",
            "Location", "Stage", "Latest Job Applied", "Tags", "Skills", "Owner", "Status", "Date Added"
        ])

        for c in items:
            latest_job = (c.get("latest_application") or {}).get("opening_title", "")
            writer.writerow([
                c.get("id"),
                c.get("full_name", ""),
                c.get("email", ""),
                c.get("phone", ""),
                c.get("current_role", ""),
                c.get("total_experience_years") if c.get("total_experience_years") is not None else "",
                c.get("location", ""),
                c.get("stage", ""),
                latest_job,
                ", ".join(c.get("tags") or []),
                ", ".join((c.get("skills") or [])[:8]),
                c.get("owner_name") or "",
                c.get("status", ""),
                c.get("created_at", "")[:10],
            ])

        if user:
            await record_audit(
                db=self.db,
                actor=user,
                action="CANDIDATES_EXPORTED",
                entity_type="candidate",
                details=f"Exported {len(items)} candidates to CSV.",
            )

        return output.getvalue()

