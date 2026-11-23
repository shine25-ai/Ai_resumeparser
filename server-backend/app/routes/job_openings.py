"""
Job openings routes.

Public (no login): list open roles, request and confirm an email code, apply with a resume.
Staff (login): manage companies, their openings and open positions, and review applications.

Each company has its own roles and careers page text. The public endpoints take ?company=<slug>;
with no company they show the default company, so careers links shared before companies existed keep working.
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Request, File, Form, Header, Query, UploadFile, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr, Field, StringConstraints
from typing_extensions import Annotated

from app.core.database import get_database
from app.core.dependencies import require_access, get_current_active_user, is_admin_or_staff_user, is_company_admin
from app.core.exceptions import AuthorizationError
from app.core.tenant import system_scope
from app.services.audit_service import diff as audit_diff, record_audit
from app.models.company import SUPERADMIN_ONLY_FIELDS
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
from app.services.job_management import JobManagementService
from app.services.resume_service import ResumeService
from app.utils.constants import ERROR_FORBIDDEN
from app.utils.response import success_response

public_router = APIRouter(prefix="/api/v1/public/jobs", tags=["Public Jobs"])

_JOBS_ACCESS = require_access("jobs", {
    # The service checks the permission each action needs (publish / approve / delete).
    ("POST", "/api/v1/job-openings/{opening_id}/actions/{action}"): "jobs:view",
    ("POST", "/api/v1/job-openings/{opening_id}/duplicate"): "jobs:create",
    ("PUT", "/api/v1/job-openings/settings"): "settings:edit",
    ("DELETE", "/api/v1/job-openings/templates/{template_id}"): "jobs:delete",
    ("GET", "/api/v1/job-openings/page-settings"): "career_page:view",
    ("PUT", "/api/v1/job-openings/page-settings"): "career_page:edit",
    ("GET", "/api/v1/job-openings/applications"): "candidates:view",
})
router = APIRouter(prefix="/api/v1/job-openings", tags=["Job Openings"], dependencies=[Depends(_JOBS_ACCESS)])
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
    opening_id: Optional[str] = Field(default=None, max_length=64, description="The role being applied for; decides the company")
    company: Optional[str] = Field(default=None, max_length=60, description="Careers page address (slug), when no role is given")


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
    data = await service.request_code(body.email, body.company, opening_id=body.opening_id)
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


def get_jobs(db: AsyncIOMotorDatabase = Depends(get_database)) -> JobManagementService:
    return JobManagementService(db)


class JobAction(BaseModel):
    note: str = Field(default="", max_length=500, description="Required when sending a job back")


class JobSettingsIn(BaseModel):
    require_approval: bool


class TemplateIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    from_job_id: Optional[str] = Field(default=None, max_length=64, description="Save this job as the template")
    job: Optional[Dict[str, Any]] = Field(default=None, description="Or the job form fields")


@router.get("", summary="Job openings with hiring progress (archived ones only when asked)")
async def list_openings(
    include_archived: bool = Query(False),
    company_id: Optional[str] = Query(None, max_length=64, description="Ignored: always the signed-in company"),
    current_user: dict = Depends(get_current_active_user),
    jobs: JobManagementService = Depends(get_jobs),
):
    data = await jobs.list(include_archived=include_archived)
    return success_response(data=data, message="Job openings retrieved successfully.")


@router.post("", status_code=status.HTTP_201_CREATED, summary="Create a job (a draft; publish: true also publishes)")
async def create_opening(
    body: Dict[str, Any],
    request: Request,
    current_user: dict = Depends(get_current_active_user),
    jobs: JobManagementService = Depends(get_jobs),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    data = await jobs.create(body, current_user)
    await record_audit(db, current_user, "job.created", "job", data["id"], f"{data['code']} {data['title']}", request=request)
    return success_response(data=data, message="Job created.", status_code=status.HTTP_201_CREATED)


@router.get("/settings", summary="Job settings: whether publishing needs approval")
async def get_job_settings(current_user: dict = Depends(get_current_active_user), jobs: JobManagementService = Depends(get_jobs)):
    return success_response(data=await jobs.settings(), message="Job settings retrieved.")


@router.put("/settings", summary="Turn job approval on or off")
async def save_job_settings(
    body: JobSettingsIn,
    request: Request,
    current_user: dict = Depends(get_current_active_user),
    jobs: JobManagementService = Depends(get_jobs),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    data = await jobs.save_settings(body.require_approval)
    await record_audit(db, current_user, "job.settings_updated", "job", "", "Job approval",
                       {"require_approval": {"to": body.require_approval}}, request=request)
    return success_response(data=data, message="Job settings saved.")


@router.get("/templates", summary="Job templates")
async def list_templates(current_user: dict = Depends(get_current_active_user), jobs: JobManagementService = Depends(get_jobs)):
    return success_response(data=await jobs.list_templates(), message="Job templates retrieved.")


@router.post("/templates", status_code=status.HTTP_201_CREATED, summary="Save a job template")
async def save_template(
    body: TemplateIn,
    request: Request,
    current_user: dict = Depends(get_current_active_user),
    jobs: JobManagementService = Depends(get_jobs),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    data = await jobs.save_template(body.name, body.job or {}, current_user, from_job=body.from_job_id)
    await record_audit(db, current_user, "job.template_saved", "job_template", data["id"], data["name"], request=request)
    return success_response(data=data, message="Template saved.", status_code=status.HTTP_201_CREATED)


@router.delete("/templates/{template_id}", summary="Delete a job template")
async def delete_template(
    template_id: str,
    request: Request,
    current_user: dict = Depends(get_current_active_user),
    jobs: JobManagementService = Depends(get_jobs),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    await jobs.delete_template(template_id)
    await record_audit(db, current_user, "job.template_deleted", "job_template", template_id, request=request)
    return success_response(data=None, message="Template deleted.")


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


@router.get("/{opening_id}", summary="One job with its hiring progress and history")
async def get_opening(opening_id: str, current_user: dict = Depends(get_current_active_user), jobs: JobManagementService = Depends(get_jobs)):
    return success_response(data=await jobs.get(opening_id), message="Job retrieved.")


@router.patch("/{opening_id}", summary="Edit a job (status changes go through the job actions)")
async def update_opening(
    opening_id: str,
    body: Dict[str, Any],
    request: Request,
    current_user: dict = Depends(get_current_active_user),
    jobs: JobManagementService = Depends(get_jobs),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    data = await jobs.update(opening_id, body, current_user)
    await record_audit(db, current_user, "job.updated", "job", opening_id, f"{data['code']} {data['title']}",
                       {k: {"to": v} for k, v in body.items() if k not in ("description",)}, request=request)
    return success_response(data=data, message="Job updated.")


@router.post("/{opening_id}/actions/{action}", summary="Submit, publish, approve, reject, close, reopen, archive or restore")
async def job_action(
    opening_id: str,
    action: str,
    request: Request,
    body: Optional[JobAction] = None,
    current_user: dict = Depends(get_current_active_user),
    jobs: JobManagementService = Depends(get_jobs),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    data = await jobs.act(opening_id, action, current_user, (body.note if body else ""))
    last = (data.get("status_history") or [{}])[-1]
    await record_audit(db, current_user, f"job.{last.get('action', action)}", "job", opening_id, f"{data['code']} {data['title']}",
                       {"status": {"from": last.get("from"), "to": last.get("to")}}, details=last.get("note", ""), request=request)
    return success_response(data=data, message=f"Job {data['status_label'].lower()}.")


@router.post("/{opening_id}/duplicate", status_code=status.HTTP_201_CREATED, summary="Copy a job as a new draft")
async def duplicate_opening(
    opening_id: str,
    request: Request,
    current_user: dict = Depends(get_current_active_user),
    jobs: JobManagementService = Depends(get_jobs),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    data = await jobs.duplicate(opening_id, current_user)
    await record_audit(db, current_user, "job.duplicated", "job", data["id"], f"{data['code']} {data['title']}",
                       details=f"Copied from {opening_id}", request=request)
    return success_response(data=data, message="Job copied as a draft.", status_code=status.HTTP_201_CREATED)


# ── Companies (staff) ─────────────────────────────────────────────────────────

Slug = Annotated[str, StringConstraints(max_length=60)]


class CompanyAdmin(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6)


Short = Annotated[str, StringConstraints(max_length=120)]


class CompanyAddressIn(BaseModel):
    line1: Short = ""
    line2: Short = ""
    city: Short = ""
    state: Short = ""
    country: Short = ""
    pincode: Annotated[str, StringConstraints(max_length=12)] = ""


class CompanyContactIn(BaseModel):
    name: Short = ""
    email: Short = ""
    phone: Annotated[str, StringConstraints(max_length=30)] = ""


class CompanyLimitsIn(BaseModel):
    users: int = Field(default=0, ge=0)
    active_jobs: int = Field(default=0, ge=0)
    storage_mb: int = Field(default=0, ge=0)
    ai_parses_per_month: int = Field(default=0, ge=0)


class CompanyProfileIn(BaseModel):
    """Company details (SRS 3.3). All optional."""
    logo_url: Optional[Annotated[str, StringConstraints(max_length=500)]] = None
    website: Optional[Annotated[str, StringConstraints(max_length=200)]] = None
    industry: Optional[Short] = None
    description: Optional[Annotated[str, StringConstraints(max_length=4000)]] = None
    company_size: Optional[Annotated[str, StringConstraints(max_length=40)]] = None
    timezone: Optional[Annotated[str, StringConstraints(max_length=60)]] = None
    address: Optional[CompanyAddressIn] = None
    contact: Optional[CompanyContactIn] = None
    plan: Optional[Annotated[str, StringConstraints(max_length=60)]] = Field(default=None, description="Super admin only")
    limits: Optional[CompanyLimitsIn] = Field(default=None, description="Super admin only; 0 = no limit")


class CompanyCreate(CompanyProfileIn):
    name: str = Field(..., min_length=1, max_length=120)
    slug: Optional[Slug] = Field(default=None, description="Careers page address; made from the name when left out")
    email_domains: List[str] = Field(default_factory=list, max_length=20, description="e.g. ['abc.com']; empty allows any email")
    admin: Optional[CompanyAdmin] = Field(default=None, description="The company's first administrator")


class CompanyUpdate(CompanyProfileIn):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    slug: Optional[Slug] = None
    status: Optional[str] = Field(default=None, pattern="^(ACTIVE|INACTIVE)$")
    email_domains: Optional[List[str]] = Field(default=None, max_length=20)
    is_active: Optional[bool] = Field(default=None, description="Turn the whole workspace on or off (super admin)")


@companies_router.get("", summary="List companies with role counts (staff)")
async def list_companies(
    all: bool = Query(False, description="Super admin: every company, with user and resume counts"),
    include_archived: bool = Query(False, description="Super admin: also list archived companies"),
    current_user: dict = Depends(get_current_active_user),
    service: JobOpeningService = Depends(get_job_service),
):
    _require_staff(current_user)
    data = await service.list_companies(
        all_companies=bool(current_user.get("is_superadmin")) and all, include_archived=include_archived
    )
    return success_response(data=data, message="Companies retrieved successfully.")


@companies_router.post("", status_code=status.HTTP_201_CREATED, summary="Add a company (staff)")
async def create_company(
    body: CompanyCreate,
    request: Request,
    current_user: dict = Depends(get_current_active_user),
    service: JobOpeningService = Depends(get_job_service),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    if not current_user.get("is_superadmin"):
        raise AuthorizationError("Only the platform super admin can add companies.")
    data = await service.create_company(body.model_dump(exclude_none=True))
    details = f"Admin: {data['admin']['email']}" if data.get("admin") else ""
    for platform in (True, False):
        await record_audit(db, current_user, "company.created", "company", data["id"], data["name"], details=details,
                           request=request, platform=platform, target_company_id=data["id"])
    return success_response(data=data, message="Company added.", status_code=status.HTTP_201_CREATED)


@companies_router.patch("/{company_id}", summary="Rename a company, change its page address, or turn its page off (staff)")
async def update_company(
    company_id: str,
    body: CompanyUpdate,
    request: Request,
    current_user: dict = Depends(get_current_active_user),
    service: JobOpeningService = Depends(get_job_service),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    changes = body.model_dump(exclude_unset=True)
    if not current_user.get("is_superadmin"):
        # A company admin may rename their own company and change its careers page, nothing else.
        if not is_company_admin(current_user) or company_id != current_user.get("company_id"):
            raise AuthorizationError("You can only change your own company.")
        if SUPERADMIN_ONLY_FIELDS & set(changes):
            raise AuthorizationError("Only the platform super admin can change email domains, plans or limits, or turn a workspace off.")
    before = await service.company_repo.get_by_id(company_id)
    data = await service.update_company(company_id, changes)
    changed = audit_diff(before, data, sorted(changes))
    if changed:
        for platform in (True, False):
            await record_audit(db, current_user, "company.updated", "company", company_id, data.get("name", ""),
                               changes=changed, request=request, platform=platform, target_company_id=company_id)
    return success_response(data=data, message="Company updated.")


@companies_router.post("/{company_id}/archive", summary="Archive a company (super admin)")
async def archive_company(
    company_id: str,
    request: Request,
    current_user: dict = Depends(get_current_active_user),
    service: JobOpeningService = Depends(get_job_service),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    if not current_user.get("is_superadmin"):
        raise AuthorizationError("Only the platform super admin can archive companies.")
    with system_scope():
        data = await service.set_archived(company_id, True)
    for platform in (True, False):
        await record_audit(db, current_user, "company.archived", "company", company_id, data.get("name", ""),
                           request=request, platform=platform, target_company_id=company_id)
    return success_response(data=data, message="Company archived. Its users can no longer sign in and its careers page is off.")


@companies_router.post("/{company_id}/restore", summary="Restore an archived company (super admin)")
async def restore_company(
    company_id: str,
    request: Request,
    current_user: dict = Depends(get_current_active_user),
    service: JobOpeningService = Depends(get_job_service),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    if not current_user.get("is_superadmin"):
        raise AuthorizationError("Only the platform super admin can restore companies.")
    with system_scope():
        data = await service.set_archived(company_id, False)
    for platform in (True, False):
        await record_audit(db, current_user, "company.restored", "company", company_id, data.get("name", ""),
                           request=request, platform=platform, target_company_id=company_id)
    return success_response(data=data, message="Company restored. Turn the workspace on when it should be used again.")
