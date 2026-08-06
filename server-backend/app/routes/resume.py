"""
Resume processing routes for uploading PDF/DOC/DOCX files, listing resumes, text extraction, and deletion.
"""

from typing import Optional
from fastapi import APIRouter, Depends, File, Query, UploadFile, status, BackgroundTasks
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.controllers.resume_controller import ResumeController
from app.core.database import get_database
from app.core.dependencies import get_current_active_user, get_current_active_user_optional
from app.repositories.resume_repository import ResumeRepository
from app.schemas.resume import ResumeUpdateRequest
from app.services.resume_service import ResumeService
from app.utils.enums import UserRole

router = APIRouter(prefix="/api/v1/resumes", tags=["Resumes"])


from app.repositories.resume_log_repository import ResumeLogRepository


def get_resume_controller(db: AsyncIOMotorDatabase = Depends(get_database)) -> ResumeController:
    """Dependency injector for ResumeController."""
    resume_repo = ResumeRepository(db)
    resume_log_repo = ResumeLogRepository(db)
    resume_service = ResumeService(resume_repo, resume_log_repo=resume_log_repo)
    return ResumeController(resume_service)


@router.post(
    "/upload",
    status_code=status.HTTP_201_CREATED,
    summary="Upload resume file",
    description="Upload a PDF, DOC, or DOCX resume document. Extracts text and stores file metadata.",
)
async def upload_resume(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    resume_source: Optional[str] = Query(None, description="Source of resume upload (e.g. refer, linkdIn, nakuri, indeet, frients, campain)"),
    resume_source_informer_name: Optional[str] = Query(None, description="Name of the person who informed, referred, or sourced the candidate"),
    current_user: dict = Depends(get_current_active_user_optional),
    controller: ResumeController = Depends(get_resume_controller),
):
    return await controller.upload_resume(current_user["id"], file, background_tasks, resume_source=resume_source, resume_source_informer_name=resume_source_informer_name)


@router.get(
    "",
    status_code=status.HTTP_200_OK,
    summary="List user resumes",
    description="Retrieve paginated list of uploaded resumes belonging to current user.",
)
async def list_resumes(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: dict = Depends(get_current_active_user),
    controller: ResumeController = Depends(get_resume_controller),
):
    is_admin = current_user.get("role") in [UserRole.ADMIN, UserRole.ADMIN.value, "admin", "superadmin"]
    return await controller.list_resumes(current_user["id"], skip=skip, limit=limit, is_admin=is_admin)


@router.get(
    "/match",
    status_code=status.HTTP_200_OK,
    summary="Match and filter resumes by criteria",
    description="Filter user resumes by job title, experience range, location, employment type, and required skills.",
)
async def match_resumes(
    job_title: list[str] = Query(None, description="Job title or role keyword filter"),
    min_experience: float = Query(None, ge=0, description="Minimum total years of experience"),
    max_experience: float = Query(None, ge=0, description="Maximum total years of experience"),
    location: list[str] = Query(None, description="Preferred location or city filter"),
    employment_type: list[str] = Query(None, description="Employment type (e.g. Full Time, Part Time, Contract)"),
    year_of_passing: list[str] = Query(None, description="Year of passing graduation filter"),
    skills: list[str] = Query(None, description="List of required skills"),
    keywords: list[str] = Query(None, description="List of keywords to search in full resume text"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: dict = Depends(get_current_active_user),
    controller: ResumeController = Depends(get_resume_controller),
):
    is_admin = current_user.get("role") in [UserRole.ADMIN, UserRole.ADMIN.value, "admin", "superadmin"]
    return await controller.filter_resumes(
        user_id=current_user["id"],
        job_title=job_title,
        min_experience=min_experience,
        max_experience=max_experience,
        location=location,
        employment_type=employment_type,
        year_of_passing=year_of_passing,
        skills=skills,
        keywords=keywords,
        skip=skip,
        limit=limit,
        is_admin=is_admin,
    )


@router.get(
    "/parsed-summary",
    status_code=status.HTTP_200_OK,
    summary="Parsed Resume Summary",
    description="Returns only parsed resume fields for dashboard/list view.",
)
async def parsed_resume_summary(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: dict = Depends(get_current_active_user),
    controller: ResumeController = Depends(get_resume_controller),
):
    is_admin = current_user.get("role") in [UserRole.ADMIN, UserRole.ADMIN.value, "admin", "superadmin"]
    return await controller.parsed_resume_summary(
        user_id=current_user["id"],
        skip=skip,
        limit=limit,
        is_admin=is_admin,
    )


@router.get(
    "/{resume_id}",
    status_code=status.HTTP_200_OK,
    summary="Get resume details",
    description="Retrieve metadata for specific resume by ID.",
)
async def get_resume(
    resume_id: str,
    current_user: dict = Depends(get_current_active_user_optional),
    controller: ResumeController = Depends(get_resume_controller),
):
    is_admin = current_user.get("role") == UserRole.ADMIN
    return await controller.get_resume(resume_id, current_user["id"], is_admin=is_admin)


@router.put(
    "/{resume_id}",
    status_code=status.HTTP_200_OK,
    summary="Update resume details and record HR update",
    description="Update resume parsed fields and append an HR evaluation update without modifying original AI baseline values.",
)
async def update_resume(
    resume_id: str,
    update_payload: ResumeUpdateRequest,
    current_user: dict = Depends(get_current_active_user),
    controller: ResumeController = Depends(get_resume_controller),
):
    is_admin = current_user.get("role") == UserRole.ADMIN
    return await controller.update_resume(resume_id, update_payload, current_user["id"], is_admin=is_admin)


@router.get(
    "/{resume_id}/extract",
    status_code=status.HTTP_200_OK,
    summary="Extract text for AI parsing",
    description="Retrieve extracted resume text formatted and ready for AI LLM parsing.",
)
async def extract_text(
    resume_id: str,
    current_user: dict = Depends(get_current_active_user),
    controller: ResumeController = Depends(get_resume_controller),
):
    is_admin = current_user.get("role") == UserRole.ADMIN
    return await controller.extract_text(resume_id, current_user["id"], is_admin=is_admin)


@router.delete(
    "/{resume_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete resume",
    description="Delete resume metadata from database and purge associated file from disk.",
)
async def delete_resume(
    resume_id: str,
    current_user: dict = Depends(get_current_active_user),
    controller: ResumeController = Depends(get_resume_controller),
):
    is_admin = current_user.get("role") == UserRole.ADMIN
    return await controller.delete_resume(resume_id, current_user["id"], is_admin=is_admin)

@router.post(
    "/{resume_id}/merge",
    status_code=status.HTTP_200_OK,
    summary="Merge duplicate resume",
    description="Merge newly uploaded resume into an existing candidate profile.",
)
async def merge_resume(
    resume_id: str,
    existing_resume_id: str = Query(..., description="ID of the existing resume to update"),
    current_user: dict = Depends(get_current_active_user),
    controller: ResumeController = Depends(get_resume_controller),
):
    is_admin = current_user.get("role") == UserRole.ADMIN
    return await controller.merge_resume(resume_id, existing_resume_id, current_user["id"], is_admin=is_admin)

@router.post(
    "/{resume_id}/documents",
    status_code=status.HTTP_201_CREATED,
    summary="Add auxiliary document",
    description="Upload an additional document (Cover Letter, ID, etc) to a candidate profile.",
)
async def add_document(
    resume_id: str,
    file: UploadFile = File(...),
    doc_type: str = Query(..., description="Type of document (e.g. Cover Letter, Certification, ID)"),
    doc_title: Optional[str] = Query(None, description="Optional title for the document"),
    current_user: dict = Depends(get_current_active_user),
    controller: ResumeController = Depends(get_resume_controller),
):
    is_admin = current_user.get("role") == UserRole.ADMIN
    return await controller.add_document(resume_id, file, doc_type, current_user["id"], doc_title=doc_title, is_admin=is_admin)

@router.get(
    "/{resume_id}/logs",
    status_code=status.HTTP_200_OK,
    summary="Get resume version logs",
    description="Retrieve version backup history snapshots saved for a resume before updates occurred.",
)
async def get_resume_logs(
    resume_id: str,
    current_user: dict = Depends(get_current_active_user),
    controller: ResumeController = Depends(get_resume_controller),
):
    is_admin = current_user.get("role") in [UserRole.ADMIN, UserRole.ADMIN.value, "admin", "superadmin"]
    return await controller.get_resume_logs(resume_id, current_user["id"], is_admin=is_admin)
