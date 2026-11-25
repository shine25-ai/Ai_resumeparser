"""
Candidate management API endpoints (SRS 4.10, Phase 6).
Protected by module: candidates.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request, Response
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.core.database import get_database
from app.core.dependencies import get_current_active_user, require_access
from app.services.candidate_service import CandidateService
from app.utils.response import success_response

_ACCESS = require_access(
    "candidates",
    {
        ("GET", "/api/v1/candidates"): "candidates:view",
        ("GET", "/api/v1/candidates/summary-stats"): "candidates:view",
        ("GET", "/api/v1/candidates/duplicates"): "candidates:view",
        ("POST", "/api/v1/candidates/merge"): "candidates:edit",
        ("GET", "/api/v1/candidates/export"): "candidates:export",
        ("POST", "/api/v1/candidates/bulk-action"): "candidates:edit",
        ("GET", "/api/v1/candidates/{candidate_id}"): "candidates:view",
        ("PUT", "/api/v1/candidates/{candidate_id}"): "candidates:edit",
        ("PUT", "/api/v1/candidates/{candidate_id}/tags"): "candidates:edit",
        ("POST", "/api/v1/candidates/{candidate_id}/notes"): "candidates:edit",
        ("DELETE", "/api/v1/candidates/{candidate_id}/notes/{note_id}"): "candidates:edit",
        ("POST", "/api/v1/candidates/{candidate_id}/reprocess"): "candidates:edit",
    },
)

router = APIRouter(prefix="/api/v1/candidates", tags=["Candidates"], dependencies=[Depends(_ACCESS)])


def get_service(db: AsyncIOMotorDatabase = Depends(get_database)) -> CandidateService:
    return CandidateService(db)


# ── Request / Response Schemas ────────────────────────────────────────────────


class CandidateUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    linkedin: Optional[str] = None
    portfolio: Optional[str] = None
    total_experience_years: Optional[float] = None
    current_role: Optional[str] = None
    skills: Optional[List[str]] = None
    owner_id: Optional[str] = None
    owner_name: Optional[str] = None
    status: Optional[str] = None


class TagsUpdateRequest(BaseModel):
    tags: List[str] = Field(default_factory=list)


class AddNoteRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)
    mentions: List[str] = Field(default_factory=list)


class MergeRequest(BaseModel):
    primary_id: str = Field(..., description="The candidate record that remains active")
    secondary_id: str = Field(..., description="The candidate record to be merged and deactivated")


class BulkActionRequest(BaseModel):
    candidate_ids: List[str] = Field(..., min_length=1)
    action: str = Field(..., pattern="^(add_tags|remove_tags|assign_owner|update_status)$")
    value: Any = None


# ── Routes ───────────────────────────────────────────────────────────────────


@router.get("", summary="List candidates with search, filtering and sorting")
async def list_candidates(
    q: str = Query("", max_length=100),
    job_id: str = Query("", max_length=64),
    stage: str = Query("", max_length=40),
    source: str = Query("", max_length=60),
    location: str = Query("", max_length=100),
    min_experience: Optional[float] = Query(None, ge=0),
    max_experience: Optional[float] = Query(None, le=60),
    tags: Optional[List[str]] = Query(None),
    owner_id: str = Query("", max_length=64),
    date_from: str = Query("", max_length=30),
    date_to: str = Query("", max_length=30),
    sort: str = Query("latest", pattern="^(latest|oldest|experience_desc|experience_asc|name)$"),
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    _user: dict = Depends(get_current_active_user),
    service: CandidateService = Depends(get_service),
):
    result = await service.list(
        q=q,
        job_id=job_id,
        stage=stage,
        source=source,
        location=location,
        min_experience=min_experience,
        max_experience=max_experience,
        tags=tags,
        owner_id=owner_id,
        date_from=date_from,
        date_to=date_to,
        sort_by=sort,
        page=page,
        limit=limit,
    )
    return success_response(data=result, message="Candidates retrieved successfully.")


@router.get("/summary-stats", summary="Overview KPI cards for Candidate Management")
async def get_summary_stats(
    _user: dict = Depends(get_current_active_user),
    service: CandidateService = Depends(get_service),
):
    stats = await service.get_summary_stats()
    return success_response(data=stats, message="Candidate summary stats retrieved.")


@router.get("/duplicates", summary="Detect duplicate candidate groups")
async def get_duplicates(
    _user: dict = Depends(get_current_active_user),
    service: CandidateService = Depends(get_service),
):
    groups = await service.get_duplicates()
    return success_response(data=groups, message=f"Found {len(groups)} potential duplicate groups.")


@router.post("/merge", summary="Merge two candidate profiles")
async def merge_candidates(
    body: MergeRequest,
    user: dict = Depends(get_current_active_user),
    service: CandidateService = Depends(get_service),
):
    result = await service.merge(body.primary_id, body.secondary_id, user)
    return success_response(data=result, message="Candidate profiles successfully merged.")


@router.get("/export", summary="Export filtered candidates as CSV")
async def export_candidates_csv(
    q: str = Query("", max_length=100),
    job_id: str = Query("", max_length=64),
    stage: str = Query("", max_length=40),
    source: str = Query("", max_length=60),
    location: str = Query("", max_length=100),
    min_experience: Optional[float] = Query(None, ge=0),
    max_experience: Optional[float] = Query(None, le=60),
    tags: Optional[List[str]] = Query(None),
    owner_id: str = Query("", max_length=64),
    user: dict = Depends(get_current_active_user),
    service: CandidateService = Depends(get_service),
):
    csv_data = await service.export_csv(
        q=q,
        job_id=job_id,
        stage=stage,
        source=source,
        location=location,
        min_experience=min_experience,
        max_experience=max_experience,
        tags=tags,
        owner_id=owner_id,
        user=user,
    )
    filename = f"candidates_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/bulk-action", summary="Apply bulk updates to candidates")
async def bulk_action(
    body: BulkActionRequest,
    user: dict = Depends(get_current_active_user),
    service: CandidateService = Depends(get_service),
):
    res = await service.bulk_action(body.candidate_ids, body.action, body.value, user)
    return success_response(data=res, message="Bulk action completed.")


@router.get("/{candidate_id}", summary="Candidate 360 profile view")
async def get_candidate(
    candidate_id: str,
    _user: dict = Depends(get_current_active_user),
    service: CandidateService = Depends(get_service),
):
    data = await service.get(candidate_id)
    return success_response(data=data, message="Candidate profile retrieved.")


@router.put("/{candidate_id}", summary="Update candidate details")
async def update_candidate(
    candidate_id: str,
    body: CandidateUpdateRequest,
    user: dict = Depends(get_current_active_user),
    service: CandidateService = Depends(get_service),
):
    updated = await service.update(candidate_id, body.model_dump(exclude_unset=True), user)
    return success_response(data=updated, message="Candidate updated successfully.")


@router.put("/{candidate_id}/tags", summary="Update candidate tags")
async def update_tags(
    candidate_id: str,
    body: TagsUpdateRequest,
    user: dict = Depends(get_current_active_user),
    service: CandidateService = Depends(get_service),
):
    res = await service.update_tags(candidate_id, body.tags, user)
    return success_response(data=res, message="Tags updated successfully.")


@router.post("/{candidate_id}/notes", summary="Add note to candidate profile")
async def add_note(
    candidate_id: str,
    body: AddNoteRequest,
    user: dict = Depends(get_current_active_user),
    service: CandidateService = Depends(get_service),
):
    note = await service.add_note(candidate_id, body.text, user, body.mentions)
    return success_response(data=note, message="Note added successfully.")


@router.delete("/{candidate_id}/notes/{note_id}", summary="Remove note from candidate profile")
async def remove_note(
    candidate_id: str,
    note_id: str,
    user: dict = Depends(get_current_active_user),
    service: CandidateService = Depends(get_service),
):
    await service.remove_note(candidate_id, note_id, user)
    return success_response(message="Note removed successfully.")


@router.post("/{candidate_id}/reprocess", summary="Trigger resume reprocessing via AI Parser")
async def reprocess_candidate_resume(
    candidate_id: str,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_active_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
    service: CandidateService = Depends(get_service),
):
    cand = await service.get(candidate_id)
    docs = cand.get("documents") or []
    if not docs:
        from app.core.exceptions import BadRequestError
        raise BadRequestError("No resume document found to reprocess.")

    doc = docs[0]
    file_path = doc.get("file_path") or ""
    original_filename = doc.get("original_filename") or "resume.pdf"

    # Queue parsing background task if resume service is available
    from app.repositories.resume_repository import ResumeRepository
    from app.services.resume_service import ResumeService
    resume_svc = ResumeService(ResumeRepository(db))
    
    if file_path:
        background_tasks.add_task(
            resume_svc._process_ai_parsing_async,
            resume_id=doc.get("id"),
            user_id=user.get("id", "staff"),
            file_path=file_path,
            original_filename=original_filename,
            content_type="application/pdf",
        )

    return success_response(message="Resume reprocessing queued successfully.")

