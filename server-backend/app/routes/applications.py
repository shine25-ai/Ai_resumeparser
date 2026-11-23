"""
Applications, staff side (SRS 4.8 / 4.9): the list, one application with what the candidate entered next to what the
AI read, mark reviewed, copy the candidate's corrections to the profile, and read the resume again.
Access: Candidates module (view; changes need candidates:edit).
"""

from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.core.database import get_database
from app.core.dependencies import get_current_active_user, require_access
from app.repositories.resume_log_repository import ResumeLogRepository
from app.repositories.resume_repository import ResumeRepository
from app.services.application_service import ApplicationService
from app.services.audit_service import record_audit
from app.services.resume_service import ResumeService
from app.utils.response import success_response

_ACCESS = require_access("candidates", {
    ("POST", "/api/v1/applications/{application_id}/review"): "candidates:edit",
    ("POST", "/api/v1/applications/{application_id}/apply-corrections"): "candidates:edit",
    ("POST", "/api/v1/applications/{application_id}/reprocess"): "candidates:edit",
})
router = APIRouter(prefix="/api/v1/applications", tags=["Applications"], dependencies=[Depends(_ACCESS)])


def get_service(db: AsyncIOMotorDatabase = Depends(get_database)) -> ApplicationService:
    repo = ResumeRepository(db)
    return ApplicationService(db, ResumeService(repo, resume_log_repo=ResumeLogRepository(db)))


class ReviewBody(BaseModel):
    status: str = Field(..., pattern="^(pending|reviewed)$")
    note: str = Field("", max_length=500)


class CorrectionsBody(BaseModel):
    fields: List[str] = Field(..., min_length=1, max_length=10)


@router.get("", summary="Applications, newest first")
async def list_applications(
    job_id: str = Query("", max_length=64),
    review: str = Query("", pattern="^(|pending|reviewed)$"),
    q: str = Query("", max_length=100),
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    _user: dict = Depends(get_current_active_user),
    service: ApplicationService = Depends(get_service),
):
    return success_response(data=await service.list(job_id, review, q, page, limit), message="Applications retrieved.")


@router.get("/{application_id}", summary="One application: entered details, AI-read details, consent and history")
async def get_application(application_id: str, _user: dict = Depends(get_current_active_user), service: ApplicationService = Depends(get_service)):
    return success_response(data=await service.get(application_id), message="Application retrieved.")


@router.post("/{application_id}/review", summary="Mark the application reviewed (or back to pending)")
async def review_application(
    application_id: str,
    body: ReviewBody,
    request: Request,
    user: dict = Depends(get_current_active_user),
    service: ApplicationService = Depends(get_service),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    data = await service.set_review(application_id, body.status, user, body.note)
    await record_audit(db, user, f"application.{body.status}", "application", application_id,
                       f"{data.get('full_name') or data['applicant_email']} · {data['opening_title']}", request=request)
    return success_response(data=data, message="Saved.")


@router.post("/{application_id}/apply-corrections", summary="Copy what the candidate entered to their profile")
async def apply_corrections(
    application_id: str,
    body: CorrectionsBody,
    request: Request,
    user: dict = Depends(get_current_active_user),
    service: ApplicationService = Depends(get_service),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    data = await service.apply_corrections(application_id, body.fields, user)
    await record_audit(db, user, "application.profile_updated", "application", application_id,
                       data.get("full_name") or data["applicant_email"], details=", ".join(body.fields), request=request)
    return success_response(data=data, message="Profile updated.")


@router.post("/{application_id}/reprocess", summary="Send the resume to the AI again")
async def reprocess(
    application_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_active_user),
    service: ApplicationService = Depends(get_service),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    data = await service.reprocess(application_id, user, background_tasks)
    await record_audit(db, user, "application.reprocessed", "application", application_id,
                       data.get("full_name") or data["applicant_email"], request=request)
    return success_response(data=data, message="The resume is being read again. Refresh in a minute.")
