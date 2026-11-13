"""
Job openings routes.

Public (no login): list open roles, request and confirm an email code, apply with a resume.
Staff (login): manage companies, their openings and open positions, and review applications.

Each company has its own roles and careers page text. The public endpoints take ?company=<slug>;
with no company they show the default company, so careers links shared before companies existed keep working.
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Header, Query, UploadFile, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field, StringConstraints
from typing_extensions import Annotated

from app.core.database import get_database
from app.core.dependencies import get_current_active_user, is_admin_or_staff_user
from app.core.exceptions import AuthorizationError
from app.repositories.company_repository import CompanyRepository
from app.repositories.job_repository import (
    ApplicantVerificationRepository,
    CareersPageSettingsRepository,
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
companies_router = APIRouter(prefix="/api/v1/companies", tags=["Companies"])

CompanyParam = Query(None, max_length=60, description="Company page address (slug). Leave out for the default company.")


def get_job_service(db: AsyncIOMotorDatabase = Depends(get_database)) -> JobOpeningService:
    resume_repo = ResumeRepository(db)
    resume_service = ResumeService(resume_repo, resume_log_repo=ResumeLogRepository(db))
    return JobOpeningService(
        opening_repo=JobOpeningRepository(db),
        application_repo=JobApplicationRepository(db),
        verification_repo=ApplicantVerificationRepository(db),
        resume_repo=resume_repo,
        resume_service=resume_service,
        page_settings_repo=CareersPageSettingsRepository(db),
        company_repo=CompanyRepository(db),
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


@public_router.get("", summary="List a company's open roles with open positions")
async def list_public_openings(
    company: Optional[str] = CompanyParam,
    service: JobOpeningService = Depends(get_job_service),
):
    data = await service.list_public_openings(company)
    return success_response(data=data, message="Open roles retrieved successfully.")


@public_router.get("/page", summary="Text for a company's public careers page, with the company name")
async def get_public_page_settings(
    company: Optional[str] = CompanyParam,
    service: JobOpeningService = Depends(get_job_service),
):
    data = await service.get_public_page(company)
    return success_response(data=data, message="Careers page settings retrieved successfully.")


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
    description=(
        "Send the resume file with the applicant token from the verification step in the X-Applicant-Token header. "
        "heard_from (how they found the role) and note (anything else they want to tell us) are optional form fields."
    ),
)
async def apply_for_role(
    opening_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    heard_from: Optional[str] = Form(None, max_length=100),
    note: Optional[str] = Form(None, max_length=1000),
    x_applicant_token: str = Header(..., alias="X-Applicant-Token"),
    service: JobOpeningService = Depends(get_job_service),
):
    data = await service.apply(
        opening_id, x_applicant_token, file, background_tasks, heard_from=heard_from, note=note
    )
    return success_response(
        data=data,
        message="Application submitted successfully. Your resume is being processed.",
        status_code=status.HTTP_201_CREATED,
    )


# ── Staff ─────────────────────────────────────────────────────────────────────

# One line in a role section (a responsibility, a skill, a qualification).
DetailLine = Annotated[str, StringConstraints(max_length=300)]


class JobOpeningCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    company_id: Optional[str] = Field(default=None, max_length=64, description="Leave out for the default company")
    department: Optional[str] = Field(default="", max_length=200)
    location: Optional[str] = Field(default="", max_length=200)
    employment_type: Optional[str] = Field(default="", max_length=100)
    experience: Optional[str] = Field(default="", max_length=100)
    description: Optional[str] = Field(default="", max_length=5000)
    responsibilities: List[DetailLine] = Field(default_factory=list, max_length=30)
    required_skills: List[DetailLine] = Field(default_factory=list, max_length=30)
    qualifications: List[DetailLine] = Field(default_factory=list, max_length=30)
    preferred_skills: List[DetailLine] = Field(default_factory=list, max_length=30)
    open_positions: int = Field(default=1, ge=0, le=10000)


class JobOpeningUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    company_id: Optional[str] = Field(default=None, min_length=1, max_length=64)
    department: Optional[str] = Field(default=None, max_length=200)
    location: Optional[str] = Field(default=None, max_length=200)
    employment_type: Optional[str] = Field(default=None, max_length=100)
    experience: Optional[str] = Field(default=None, max_length=100)
    description: Optional[str] = Field(default=None, max_length=5000)
    responsibilities: Optional[List[DetailLine]] = Field(default=None, max_length=30)
    required_skills: Optional[List[DetailLine]] = Field(default=None, max_length=30)
    qualifications: Optional[List[DetailLine]] = Field(default=None, max_length=30)
    preferred_skills: Optional[List[DetailLine]] = Field(default=None, max_length=30)
    open_positions: Optional[int] = Field(default=None, ge=0, le=10000)
    status: Optional[str] = Field(default=None, pattern="^(OPEN|CLOSED)$")


@router.get("", summary="List job openings with application counts, optionally for one company (staff)")
async def list_openings(
    company_id: Optional[str] = Query(None, max_length=64),
    current_user: dict = Depends(get_current_active_user),
    service: JobOpeningService = Depends(get_job_service),
):
    _require_staff(current_user)
    data = await service.list_openings(company_id)
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


class CareersPageSettingsUpdate(BaseModel):
    hero_eyebrow: Optional[str] = Field(default=None, max_length=100)
    hero_title: Optional[str] = Field(default=None, max_length=150)
    hero_subtitle: Optional[str] = Field(default=None, max_length=300)
    search_placeholder: Optional[str] = Field(default=None, max_length=100)
    listing_title: Optional[str] = Field(default=None, max_length=150)
    listing_subtitle: Optional[str] = Field(default=None, max_length=300)
    empty_message: Optional[str] = Field(default=None, max_length=300)
    success_title: Optional[str] = Field(default=None, max_length=150)
    success_message: Optional[str] = Field(default=None, max_length=300)


@router.get("/page-settings", summary="A company's careers page text (staff)")
async def get_page_settings(
    company_id: Optional[str] = Query(None, max_length=64),
    current_user: dict = Depends(get_current_active_user),
    service: JobOpeningService = Depends(get_job_service),
):
    _require_staff(current_user)
    company = await service.company_by_id(company_id)
    data = await service.get_page_settings(company)
    return success_response(data=data, message="Careers page settings retrieved successfully.")


@router.put("/page-settings", summary="Change careers page text (staff); a blank value restores the default")
async def update_page_settings(
    body: CareersPageSettingsUpdate,
    company_id: Optional[str] = Query(None, max_length=64),
    current_user: dict = Depends(get_current_active_user),
    service: JobOpeningService = Depends(get_job_service),
):
    _require_staff(current_user)
    company = await service.company_by_id(company_id)
    data = await service.update_page_settings(body.model_dump(exclude_unset=True), company)
    return success_response(data=data, message="Careers page updated.")


@router.get("/applications", summary="List applications, optionally for one opening (staff)")
async def list_applications(
    opening_id: Optional[str] = Query(None),
    company_id: Optional[str] = Query(None, max_length=64),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=200),
    current_user: dict = Depends(get_current_active_user),
    service: JobOpeningService = Depends(get_job_service),
):
    _require_staff(current_user)
    data = await service.list_applications(
        opening_id, skip=(page - 1) * limit, limit=limit, company_id=company_id
    )
    return success_response(data=data, message="Applications retrieved successfully.")


@router.patch("/{opening_id}", summary="Update role details, open positions, or status (staff)")
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


# ── Companies (staff) ─────────────────────────────────────────────────────────

Slug = Annotated[str, StringConstraints(max_length=60)]


class CompanyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    slug: Optional[Slug] = Field(default=None, description="Careers page address; made from the name when left out")


class CompanyUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    slug: Optional[Slug] = None
    status: Optional[str] = Field(default=None, pattern="^(ACTIVE|INACTIVE)$")


@companies_router.get("", summary="List companies with role counts (staff)")
async def list_companies(
    current_user: dict = Depends(get_current_active_user),
    service: JobOpeningService = Depends(get_job_service),
):
    _require_staff(current_user)
    data = await service.list_companies()
    return success_response(data=data, message="Companies retrieved successfully.")


@companies_router.post("", status_code=status.HTTP_201_CREATED, summary="Add a company (staff)")
async def create_company(
    body: CompanyCreate,
    current_user: dict = Depends(get_current_active_user),
    service: JobOpeningService = Depends(get_job_service),
):
    _require_staff(current_user)
    data = await service.create_company(body.model_dump())
    return success_response(data=data, message="Company added.", status_code=status.HTTP_201_CREATED)


@companies_router.patch("/{company_id}", summary="Rename a company, change its page address, or turn its page off (staff)")
async def update_company(
    company_id: str,
    body: CompanyUpdate,
    current_user: dict = Depends(get_current_active_user),
    service: JobOpeningService = Depends(get_job_service),
):
    _require_staff(current_user)
    data = await service.update_company(company_id, body.model_dump(exclude_unset=True))
    return success_response(data=data, message="Company updated.")
