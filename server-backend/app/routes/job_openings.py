"""
Job openings routes.

Public (no login): list open roles, request and confirm an email code, apply with a resume.
Staff (login): manage companies, their openings and open positions, and review applications.

Each company has its own roles and careers page text. The public endpoints take ?company=<slug>;
with no company they show the default company, so careers links shared before companies existed keep working.
"""

import csv
import io
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Request, File, Form, Header, Query, UploadFile, status
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr, Field, StringConstraints
from typing_extensions import Annotated

from app.core.database import get_database
from app.core.dependencies import require_access, get_current_active_user, is_admin_or_staff_user, is_company_admin
from app.core.exceptions import AuthorizationError, BadRequestError, NotFoundError
from app.core.tenant import company_scope, system_scope
from app.services.audit_service import AUDIT_LOGS_COLLECTION, diff as audit_diff, record_audit
from app.models.company import SUPERADMIN_ONLY_FIELDS, with_profile_defaults
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
from app.utils.constants import (
    ERROR_FORBIDDEN,
    INTERVIEWS_COLLECTION,
    JOB_APPLICATIONS_COLLECTION,
    JOB_OPENINGS_COLLECTION,
    RESUMES_COLLECTION,
    USERS_COLLECTION,
)
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
    request: Request,
    company: Optional[str] = CompanyParam,
    service: JobOpeningService = Depends(get_job_service),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    data = await service.list_public_openings(company)
    # The embed script marks its requests: remember which website shows this company's jobs ("Test my integration").
    origin = request.headers.get("origin") or ""
    if request.headers.get("x-careers-embed") and origin.startswith("http"):
        from app.services.career_page_service import record_embed_seen
        from app.core.tenant import current_company_id

        await record_embed_seen(db, current_company_id(), origin)
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


class ApplicationSubmit(BaseModel):
    draft_id: str = Field(..., min_length=8, max_length=64, description="From the resume upload step")
    form: Dict[str, Any] = Field(default_factory=dict, description="personal, education, experience, skills, …")
    consent: bool = Field(False, description="The candidate accepted the privacy policy and confirmed their details")


async def _accepting_opening(service: JobOpeningService, opening_id: str):
    """The job (entering its company's workspace) and its company, if it takes applications."""
    from app.models.company import COMPANY_STATUS_INACTIVE
    from app.services.job_management import is_accepting

    opening = await service._enter_opening_company(opening_id)
    if not opening or not is_accepting(opening):
        raise BadRequestError("This role is no longer accepting applications.")
    company = await service.company_by_id(opening.get("company_id"))
    if company.get("status") == COMPANY_STATUS_INACTIVE or company.get("is_active") is False:
        raise BadRequestError("This role is no longer accepting applications.")
    return opening, company


def get_applications(db: AsyncIOMotorDatabase = Depends(get_database)):
    from app.services.application_service import ApplicationService

    resume_repo = ResumeRepository(db)
    return ApplicationService(db, ResumeService(resume_repo, resume_log_repo=ResumeLogRepository(db)))


@public_router.post("/{opening_id}/resume", summary="Upload the resume (step 1). The AI starts reading it to pre-fill the form.")
async def upload_application_resume(
    opening_id: str,
    file: UploadFile = File(...),
    x_applicant_token: str = Header(..., alias="X-Applicant-Token"),
    service: JobOpeningService = Depends(get_job_service),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    email = service._email_from_token(x_applicant_token)
    opening, _company = await _accepting_opening(service, opening_id)
    data = await get_applications(db).upload_resume(opening, email, file)
    return success_response(data=data, message="Resume uploaded. We're reading it now.")


@public_router.get("/{opening_id}/drafts/{draft_id}", summary="The resume upload: reading status and the details found")
async def get_application_draft(
    opening_id: str,
    draft_id: str,
    x_applicant_token: str = Header(..., alias="X-Applicant-Token"),
    service: JobOpeningService = Depends(get_job_service),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    email = service._email_from_token(x_applicant_token)
    await service._enter_opening_company(opening_id)
    return success_response(data=await get_applications(db).draft(draft_id, email), message="Resume status.")


@public_router.post("/{opening_id}/applications", status_code=status.HTTP_201_CREATED, summary="Submit the application (step 5)")
async def submit_application(
    opening_id: str,
    body: ApplicationSubmit,
    request: Request,
    background_tasks: BackgroundTasks,
    x_applicant_token: str = Header(..., alias="X-Applicant-Token"),
    service: JobOpeningService = Depends(get_job_service),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    email = service._email_from_token(x_applicant_token)
    opening, company = await _accepting_opening(service, opening_id)
    ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "") or "").split(",")[0].strip()
    data = await get_applications(db).submit(opening, company, email, body.model_dump(), background_tasks, ip=ip)
    return success_response(data=data, message="Application submitted.", status_code=status.HTTP_201_CREATED)


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


@router.get("/stats", summary="Summary cards on the job list: jobs per status and applications")
async def job_stats(
    current_user: dict = Depends(get_current_active_user),
    jobs: JobManagementService = Depends(get_jobs),
):
    return success_response(data=await jobs.stats(), message="Job stats retrieved.")


@router.get("/export", summary="Download the jobs as CSV")
async def export_jobs(
    include_archived: bool = Query(False),
    current_user: dict = Depends(get_current_active_user),
    jobs: JobManagementService = Depends(get_jobs),
):
    body = await jobs.export_csv(include_archived=include_archived)
    return Response(content=body, media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="jobs.csv"'})


@router.get("/import/template", summary="An empty CSV with the import columns")
async def import_template(current_user: dict = Depends(get_current_active_user)):
    from app.services.job_management import CSV_COLUMNS
    return Response(content=",".join(f'"{c}"' for c in CSV_COLUMNS) + "\n", media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="jobs-import-template.csv"'})


@router.post("/import", summary="Create draft jobs from a CSV file (at most 200 rows)")
async def import_jobs(
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_active_user),
    jobs: JobManagementService = Depends(get_jobs),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    raw = await file.read(2_000_001)
    if len(raw) > 2_000_000:
        raise BadRequestError("The file is too large (2 MB at most).")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise BadRequestError("Save the file as CSV (UTF-8) and try again.")
    result = await jobs.import_csv(text, current_user)
    if result["created"]:
        await record_audit(db, current_user, "job.imported", "job", "", f"{len(result['created'])} jobs",
                           details=file.filename or "", request=request)
    return success_response(data=result, message=f"{len(result['created'])} draft jobs created, {len(result['errors'])} rows skipped.")


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


class TenantSettingsIn(BaseModel):
    resume_parsing: bool = True
    duplicate_check: bool = True
    multi_department: bool = True
    calendar_scheduling: bool = False
    candidate_registration: bool = False
    data_retention_months: int = Field(default=24, ge=0, le=120)


class CompanyProfileIn(BaseModel):
    """Company details (SRS 3.3). All optional."""
    short_name: Optional[Annotated[str, StringConstraints(max_length=60)]] = None
    company_type: Optional[Annotated[str, StringConstraints(max_length=60)]] = None
    tenant_settings: Optional[TenantSettingsIn] = None
    plan_valid_until: Optional[Annotated[str, StringConstraints(max_length=10)]] = Field(default=None, description="Super admin only; YYYY-MM-DD")
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
    branding: Optional[Dict[str, Any]] = Field(default=None, description="Colours and logo (as PUT /branding); the wizard's Branding step")
    career_headline: Optional[Annotated[str, StringConstraints(max_length=150)]] = Field(default=None, description="The careers page headline")


class CompanyUpdate(CompanyProfileIn):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    slug: Optional[Slug] = None
    status: Optional[str] = Field(default=None, pattern="^(ACTIVE|INACTIVE)$")
    email_domains: Optional[List[str]] = Field(default=None, max_length=20)
    is_active: Optional[bool] = Field(default=None, description="Turn the whole workspace on or off (super admin)")


async def _with_plan_limits(db: AsyncIOMotorDatabase, data: dict) -> dict:
    """Choosing a plan from the catalogue copies its limits, unless limits are given too."""
    if data.get("plan") and "limits" not in data:
        from app.services.plan_service import PlanService
        limits = await PlanService(db).limits_for(data["plan"])
        if limits:
            data = {**data, "limits": limits}
    return data


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


@companies_router.get("/export", summary="Download the company list as CSV (super admin)")
async def export_companies(
    include_archived: bool = Query(False),
    current_user: dict = Depends(get_current_active_user),
    service: JobOpeningService = Depends(get_job_service),
):
    if not current_user.get("is_superadmin"):
        raise AuthorizationError("Only the platform super admin can export companies.")
    rows = await service.list_companies(all_companies=True, include_archived=include_archived)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Name", "Short name", "Slug", "Industry", "Size", "Website", "Contact", "Email", "Phone", "City",
                "Country", "Plan", "Plan valid until", "Workspace", "Jobs", "Open jobs", "Users", "Candidates",
                "Interviews", "Created", "Archived"])
    for c in rows:
        contact, address = c.get("contact") or {}, c.get("address") or {}
        w.writerow([c.get("name"), c.get("short_name"), c.get("slug"), c.get("industry"), c.get("company_size"),
                    c.get("website"), contact.get("name"), contact.get("email"), contact.get("phone"), address.get("city"),
                    address.get("country"), c.get("plan"), c.get("plan_valid_until") or "",
                    "On" if c.get("is_active", True) else "Off", c.get("roles_count", 0), c.get("open_roles_count", 0),
                    c.get("users_count", 0), c.get("resumes_count", 0), c.get("interviews_count", 0),
                    (c.get("created_at") or "")[:10], (c.get("archived_at") or "")[:10]])
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="companies.csv"'})


@companies_router.get("/{company_id}/summary", summary="The company details panel: profile, counts, admins, recent activity")
async def company_summary(
    company_id: str,
    current_user: dict = Depends(get_current_active_user),
    service: JobOpeningService = Depends(get_job_service),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    if not current_user.get("is_superadmin") and not (is_company_admin(current_user) and company_id == current_user.get("company_id")):
        raise AuthorizationError("You can only see your own company.")
    with system_scope():
        company = await service.company_repo.get_by_id(company_id)
        if not company:
            raise NotFoundError("Company not found.")
        scope = {"company_id": company_id}
        jobs = await db[JOB_OPENINGS_COLLECTION].find(scope, {"_id": 0, "status": 1}).to_list(length=None)
        users = await db[USERS_COLLECTION].find(
            {**scope, "is_deleted": {"$ne": True}}, {"_id": 0, "id": 1, "full_name": 1, "email": 1, "role": 1, "is_active": 1, "last_login_at": 1}
        ).to_list(length=None)
        candidates = await db[RESUMES_COLLECTION].count_documents(
            {**scope, "$or": [{"redirect_id": None}, {"redirect_id": {"$exists": False}}]})
        interviews = await db[INTERVIEWS_COLLECTION].count_documents(scope)
        applications = await db[JOB_APPLICATIONS_COLLECTION].count_documents(scope)
        hires = await db[JOB_APPLICATIONS_COLLECTION].count_documents(
            {**scope, "$or": [{"stage_id": "hired"}, {"stage_name": "Hired"}, {"hired_at": {"$ne": None}}]}
        )
        activity = await db[AUDIT_LOGS_COLLECTION].find(scope, {"_id": 0}).sort("created_at", -1).limit(10).to_list(length=10)
    from app.services.domain_service import DomainService
    domains = DomainService(db).view(company)
    careers_url = (f"https://{domains['custom_domain']}" if domains["custom_status"] == "verified"
                   else f"https://{domains['subdomain']}" if domains["subdomain_enabled"] else f"/careers/{company['slug']}")
    return success_response(data={
        "company": with_profile_defaults(company),
        "careers_url": careers_url,
        "counts": {
            "jobs": len([j for j in jobs if j.get("status") != "ARCHIVED"]),
            "open_jobs": len([j for j in jobs if j.get("status") == "OPEN"]),
            "users": len(users),
            "candidates": candidates,
            "applications": applications,
            "interviews": interviews,
            "hires": hires,
        },
        "admins": [u for u in users if u.get("role") in ("admin", "company_admin")],
        "recent_activity": activity,
    }, message="Company summary retrieved.")


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
    payload = await _with_plan_limits(db, body.model_dump(exclude_none=True))
    branding = payload.pop("branding", None)
    headline = payload.pop("career_headline", None)
    if branding:
        from app.models.branding import clean_branding
        clean_branding(branding)  # check before anything is created
    data = await service.create_company(payload)
    if branding:
        from app.services.branding_service import BrandingService
        with system_scope():
            await BrandingService(db).save_company(data["id"], branding)
    if headline:
        from app.services.career_page_service import CareerPageService
        with company_scope(data["id"]):
            await CareerPageService(db).set_headline(data["id"], headline)
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
    changes = await _with_plan_limits(db, changes)
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
