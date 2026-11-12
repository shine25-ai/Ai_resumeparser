"""
Job openings routes.

Public (no login): list open roles, request and confirm an email code, apply with a resume.
Staff (login): manage openings and open positions, and review applications.
"""

from typing import Any, Dict, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Header, Query, UploadFile, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.core.database import get_database
from app.core.dependencies import get_current_active_user, is_admin_or_staff_user
from app.core.exceptions import AuthorizationError
from app.repositories.job_repository import (
    ApplicantVerificationRepository,
    JobApplicationRepository,
    JobOpeningRepository,
)
from app.repositories.resume_log_repository import ResumeLogRepository
from app.repositories.resume_repository import ResumeRepository
from app.services.job_opening_service import JobOpeningService
from app.services.resume_service import ResumeService
from app.utils.constants import ERROR_FORBIDDEN
from app.utils.response import success_response

public_router = APIRouter(prefix="/api/v1/public/jobs", tags=["Public Jobs"])
router = APIRouter(prefix="/api/v1/job-openings", tags=["Job Openings"])


def get_job_service(db: AsyncIOMotorDatabase = Depends(get_database)) -> JobOpeningService:
    resume_repo = ResumeRepository(db)
    resume_service = ResumeService(resume_repo, resume_log_repo=ResumeLogRepository(db))
    return JobOpeningService(
        opening_repo=JobOpeningRepository(db),
        application_repo=JobApplicationRepository(db),
        verification_repo=ApplicantVerificationRepository(db),
        resume_repo=resume_repo,
        resume_service=resume_service,
    )


def _require_staff(user: dict) -> None:
    if not is_admin_or_staff_user(user):
        raise AuthorizationError(ERROR_FORBIDDEN)


# ── Public ────────────────────────────────────────────────────────────────────

class EmailRequest(BaseModel):
    email: str = Field(..., max_length=254)


class CodeConfirmRequest(BaseModel):
    email: str = Field(..., max_length=254)
    code: str = Field(..., pattern=r"^\d{6}$")


@public_router.get("", summary="List open roles with open positions")
async def list_public_openings(service: JobOpeningService = Depends(get_job_service)):
    data = await service.list_public_openings()
    return success_response(data=data, message="Open roles retrieved successfully.")


@public_router.post("/verification/request", summary="Email a verification code to the applicant")
async def request_verification_code(body: EmailRequest, service: JobOpeningService = Depends(get_job_service)):
    data = await service.request_code(body.email)
    return success_response(data=data, message="A verification code has been sent to your email.")


@public_router.post("/verification/confirm", summary="Confirm the emailed code")
async def confirm_verification_code(body: CodeConfirmRequest, service: JobOpeningService = Depends(get_job_service)):
    data = await service.confirm_code(body.email, body.code)
    return success_response(data=data, message="Email verified.")


@public_router.post(
    "/{opening_id}/apply",
    status_code=status.HTTP_201_CREATED,
    summary="Submit a resume for an open role",
    description="Send the resume file with the applicant token from the verification step in the X-Applicant-Token header.",
)
async def apply_for_role(
    opening_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    x_applicant_token: str = Header(..., alias="X-Applicant-Token"),
    service: JobOpeningService = Depends(get_job_service),
):
    data = await service.apply(opening_id, x_applicant_token, file, background_tasks)
    return success_response(
        data=data,
        message="Application submitted successfully. Your resume is being processed.",
        status_code=status.HTTP_201_CREATED,
    )


# ── Staff ─────────────────────────────────────────────────────────────────────

class JobOpeningCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    department: Optional[str] = Field(default="", max_length=200)
    location: Optional[str] = Field(default="", max_length=200)
    employment_type: Optional[str] = Field(default="", max_length=100)
    description: Optional[str] = Field(default="", max_length=5000)
    open_positions: int = Field(default=1, ge=0, le=10000)


class JobOpeningUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    department: Optional[str] = Field(default=None, max_length=200)
    location: Optional[str] = Field(default=None, max_length=200)
    employment_type: Optional[str] = Field(default=None, max_length=100)
    description: Optional[str] = Field(default=None, max_length=5000)
    open_positions: Optional[int] = Field(default=None, ge=0, le=10000)
    status: Optional[str] = Field(default=None, pattern="^(OPEN|CLOSED)$")


@router.get("", summary="List job openings with application counts (staff)")
async def list_openings(
    current_user: dict = Depends(get_current_active_user),
    service: JobOpeningService = Depends(get_job_service),
):
    _require_staff(current_user)
    data = await service.list_openings()
    return success_response(data=data, message="Job openings retrieved successfully.")


@router.post("", status_code=status.HTTP_201_CREATED, summary="Create a job opening (staff)")
async def create_opening(
    body: JobOpeningCreate,
    current_user: dict = Depends(get_current_active_user),
    service: JobOpeningService = Depends(get_job_service),
):
    _require_staff(current_user)
    data = await service.create_opening(body.model_dump())
    return success_response(data=data, message="Job opening created.", status_code=status.HTTP_201_CREATED)


@router.get("/applications", summary="List applications, optionally for one opening (staff)")
async def list_applications(
    opening_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=200),
    current_user: dict = Depends(get_current_active_user),
    service: JobOpeningService = Depends(get_job_service),
):
    _require_staff(current_user)
    data = await service.list_applications(opening_id, skip=(page - 1) * limit, limit=limit)
    return success_response(data=data, message="Applications retrieved successfully.")


@router.patch("/{opening_id}", summary="Update title, open positions, or status (staff)")
async def update_opening(
    opening_id: str,
    body: JobOpeningUpdate,
    current_user: dict = Depends(get_current_active_user),
    service: JobOpeningService = Depends(get_job_service),
):
    _require_staff(current_user)
    changes: Dict[str, Any] = body.model_dump(exclude_unset=True)
    data = await service.update_opening(opening_id, changes)
    return success_response(data=data, message="Job opening updated.")
