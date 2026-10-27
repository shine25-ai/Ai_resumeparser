"""
Integration API for other projects: upload a resume, check parsing/interview status,
and fetch the parsed candidate profile. Authenticated with the X-API-Key header.
"""

from typing import Any, Dict, Optional
from fastapi.encoders import jsonable_encoder
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Query, Request, UploadFile, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.core.api_key import get_integration_client, get_integration_service
from app.core.database import get_database
from app.core.exceptions import BadRequestError, NotFoundError
from app.repositories.resume_log_repository import ResumeLogRepository
from app.repositories.resume_repository import ResumeRepository
from app.services.candidate_interview_service import CandidateInterviewService
from app.services.integration_service import IntegrationService
from app.services.resume_service import ResumeService
from app.utils.enums import ResumeStatus
from app.utils.response import success_response

router = APIRouter(prefix="/api/v1/integration", tags=["Integration API"])

INTERVIEW_SUMMARY_FIELDS = (
    "id",
    "job_title",
    "interview_type",
    "round_number",
    "status",
    "scheduled_date",
    "scheduled_time",
    "timezone",
    "interviewer_name",
    "rating",
    "recommendation",
    "client_recommendation",
    "ai_recommendation",
    "updated_at",
)


def get_resume_service(db: AsyncIOMotorDatabase = Depends(get_database)) -> ResumeService:
    resume_repo = ResumeRepository(db)
    return ResumeService(resume_repo, resume_log_repo=ResumeLogRepository(db))


def get_candidate_interview_service(db: AsyncIOMotorDatabase = Depends(get_database)) -> CandidateInterviewService:
    return CandidateInterviewService(db)


async def _find_resume(service: ResumeService, email: Optional[str], candidate_id: Optional[str]) -> Dict[str, Any]:
    """Find a candidate profile by candidate ID (e.g. CND0001) or email."""
    if not email and not candidate_id:
        raise BadRequestError("Pass either 'email' or 'candidate_id'.")
    resume = None
    if candidate_id:
        resume = await service.resume_repo.find_one({"candidate_id": candidate_id.strip()})
    elif email:
        resume = await service.resume_repo.find_by_email(email=email.strip())
    if not resume:
        raise NotFoundError("Candidate profile not found.")
    return resume


def _interview_summary(interview: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not interview:
        return None
    return {field: interview.get(field) for field in INTERVIEW_SUMMARY_FIELDS}


def _status_payload(resume: Dict[str, Any], requested_id: str) -> Dict[str, Any]:
    raw_status = resume.get("status") or ResumeStatus.PENDING
    parsing_status = ResumeStatus(raw_status).value
    return {
        "resume_id": resume.get("id"),
        "requested_resume_id": requested_id,
        # True when the upload matched an existing candidate (same email) and was merged into it.
        "merged_into_existing_profile": resume.get("id") != requested_id,
        "candidate_id": resume.get("candidate_id"),
        "parsing_status": parsing_status,
        "is_parsed": parsing_status == "PARSED",
        "is_failed": parsing_status == "FAILED",
        "interview_assigned": bool(resume.get("interview_assigned")),
        "interview_status": resume.get("interview_status") or "NOT_ASSIGNED",
        "latest_interview": _interview_summary(resume.get("latest_interview")),
        "upload_date": resume.get("upload_date"),
    }



def _profile_payload(resume: Dict[str, Any], requested_id: str, include_text: bool = False) -> Dict[str, Any]:
    payload = _status_payload(resume, requested_id)
    payload.update(
        {
            "original_filename": resume.get("original_filename"),
            "resume_url": resume.get("s3_url"),
            "profile_picture_url": resume.get("profile_picture_url"),
            "resume_source": resume.get("resume_source"),
            "resume_source_informer_name": resume.get("resume_source_informer_name"),
            "uploaded_by_name": resume.get("uploaded_by_name"),
            "is_auto_updated": bool(resume.get("is_auto_updated")),
            "parsed_data": resume.get("parsed_data") or {},
            "ai_evaluation": resume.get("ai_evaluation") or {},
            "hr_updates": resume.get("hr_updates") or [],
            "interviews": [_interview_summary(i) for i in (resume.get("interviews") or []) if i],
        }
    )
    if include_text:
        payload["extracted_text"] = resume.get("extracted_text") or ""
    return jsonable_encoder(payload)


async def _load_resume(service: ResumeService, resume_id: str) -> Dict[str, Any]:
    """Fetch a resume (following merges into existing profiles) with interview info attached."""
    resume = await service.resume_repo.get_by_id(resume_id)
    if not resume:
        raise NotFoundError("Resume not found.")
    enriched = await service.enrich_resumes_with_interviews([resume])
    return enriched[0]


@router.post(
    "/resumes",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload a resume for parsing",
    description=(
        "Upload a PDF, DOC or DOCX resume (max 10 MB). Parsing runs in the background: "
        "poll GET /api/v1/integration/resumes/{resume_id}/status until parsing_status is PARSED or FAILED."
    ),
)
async def upload_resume(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="Resume file (pdf, doc, docx)"),
    resume_source: Optional[str] = Form(None, description="Where the resume came from (e.g. LinkedIn, Naukri, Referral)"),
    resume_source_informer_name: Optional[str] = Form(None, description="Name of the person who referred or sourced the candidate"),
    client: dict = Depends(get_integration_client),
    service: ResumeService = Depends(get_resume_service),
):
    created = await service.upload_and_process_resume(
        client["id"],
        file,
        background_tasks,
        resume_source=resume_source,
        resume_source_informer_name=resume_source_informer_name,
        uploaded_by_name=client["full_name"],
        uploaded_by_email=client["email"],
    )
    resume = created.model_dump()
    resume_id = resume["id"]
    request.state.integration_resume_id = resume_id
    base = str(request.base_url).rstrip("/")
    data = {
        "resume_id": resume_id,
        "candidate_id": resume.get("candidate_id"),
        "parsing_status": ResumeStatus(resume["status"]).value,
        "original_filename": resume.get("original_filename"),
        "status_url": f"{base}/api/v1/integration/resumes/{resume_id}/status",
        "profile_url": f"{base}/api/v1/integration/resumes/{resume_id}",
    }
    return success_response(data=data, message="Resume accepted. Parsing has started.", status_code=status.HTTP_202_ACCEPTED)


@router.get(
    "/resumes/lookup",
    summary="Find a candidate profile by email or candidate ID",
)
async def lookup_resume(
    request: Request,
    email: Optional[str] = Query(None, description="Candidate email"),
    candidate_id: Optional[str] = Query(None, description="Candidate ID, e.g. CND0001"),
    include_text: bool = Query(False, description="Include the raw extracted resume text"),
    client: dict = Depends(get_integration_client),
    service: ResumeService = Depends(get_resume_service),
):
    resume = await _find_resume(service, email, candidate_id)
    request.state.integration_resume_id = resume["id"]
    enriched = (await service.enrich_resumes_with_interviews([resume]))[0]
    return success_response(
        data=_profile_payload(enriched, enriched["id"], include_text=include_text),
        message="Candidate profile retrieved successfully.",
    )


@router.get(
    "/resumes/{resume_id}/status",
    summary="Get parsing and interview status",
    description="Lightweight status check. parsing_status is PENDING, PARSED or FAILED.",
)
async def get_resume_status(
    request: Request,
    resume_id: str,
    client: dict = Depends(get_integration_client),
    service: ResumeService = Depends(get_resume_service),
):
    resume = await _load_resume(service, resume_id)
    request.state.integration_resume_id = resume_id
    return success_response(data=jsonable_encoder(_status_payload(resume, resume_id)), message="Resume status retrieved successfully.")


@router.get(
    "/resumes/{resume_id}",
    summary="Get parsed candidate profile",
    description="Full parsed profile, AI evaluation, HR updates and interview status for a resume.",
)
async def get_resume_profile(
    request: Request,
    resume_id: str,
    include_text: bool = Query(False, description="Include the raw extracted resume text"),
    client: dict = Depends(get_integration_client),
    service: ResumeService = Depends(get_resume_service),
):
    resume = await _load_resume(service, resume_id)
    request.state.integration_resume_id = resume_id
    return success_response(
        data=_profile_payload(resume, resume_id, include_text=include_text),
        message="Candidate profile retrieved successfully.",
    )


# ── Candidate interviews ──────────────────────────────────────────────────────
INTERVIEWS_DESCRIPTION = (
    "Candidate-facing interview schedule and status: date, time, joining link, round, status, "
    "and a plain result (e.g. Selected, Moved to next round, Not selected) when result sharing is on in "
    "Settings → API Integration. Internal feedback, ratings, salary and interviewer emails are never included."
)


async def _candidate_interviews(
    resume: Dict[str, Any],
    interviews: CandidateInterviewService,
    integration: IntegrationService,
) -> Dict[str, Any]:
    share = await integration.repo.shares_interview_results()
    return jsonable_encoder(await interviews.interviews_for_resume(resume, share_results=share))


@router.get(
    "/interviews/lookup",
    summary="Get a candidate's interviews by email or candidate ID",
    description=INTERVIEWS_DESCRIPTION,
)
async def lookup_candidate_interviews(
    request: Request,
    email: Optional[str] = Query(None, description="Candidate email"),
    candidate_id: Optional[str] = Query(None, description="Candidate ID, e.g. CND0001"),
    client: dict = Depends(get_integration_client),
    service: ResumeService = Depends(get_resume_service),
    interviews: CandidateInterviewService = Depends(get_candidate_interview_service),
    integration: IntegrationService = Depends(get_integration_service),
):
    resume = await _find_resume(service, email, candidate_id)
    request.state.integration_resume_id = resume["id"]
    data = await _candidate_interviews(resume, interviews, integration)
    return success_response(data=data, message="Interviews retrieved successfully.")


@router.get(
    "/resumes/{resume_id}/interviews",
    summary="Get a candidate's interview schedule, status and results",
    description=INTERVIEWS_DESCRIPTION,
)
async def get_candidate_interviews(
    request: Request,
    resume_id: str,
    client: dict = Depends(get_integration_client),
    service: ResumeService = Depends(get_resume_service),
    interviews: CandidateInterviewService = Depends(get_candidate_interview_service),
    integration: IntegrationService = Depends(get_integration_service),
):
    resume = await service.resume_repo.get_by_id(resume_id)
    if not resume:
        raise NotFoundError("Resume not found.")
    request.state.integration_resume_id = resume_id
    data = await _candidate_interviews(resume, interviews, integration)
    return success_response(data=data, message="Interviews retrieved successfully.")


@router.get(
    "/resumes/{resume_id}/interviews/{interview_id}",
    summary="Get one interview round for a candidate",
    description=INTERVIEWS_DESCRIPTION,
)
async def get_candidate_interview(
    request: Request,
    resume_id: str,
    interview_id: str,
    client: dict = Depends(get_integration_client),
    service: ResumeService = Depends(get_resume_service),
    interviews: CandidateInterviewService = Depends(get_candidate_interview_service),
    integration: IntegrationService = Depends(get_integration_service),
):
    resume = await service.resume_repo.get_by_id(resume_id)
    if not resume:
        raise NotFoundError("Resume not found.")
    request.state.integration_resume_id = resume_id
    data = await _candidate_interviews(resume, interviews, integration)
    match = next((r for r in data["interviews"] if r["interview_id"] == interview_id), None)
    if not match:
        raise NotFoundError("Interview not found for this candidate.")
    return success_response(
        data={**{k: data[k] for k in ("resume_id", "candidate_id", "candidate_name", "results_shared")}, "interview": match},
        message="Interview retrieved successfully.",
    )
