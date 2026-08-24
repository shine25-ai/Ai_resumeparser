"""
Interview routes for scheduling, filtering, updating, feedback submission, and deletion.
"""

from typing import Optional
from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.controllers.interview_controller import InterviewController
from app.core.database import get_database
from app.core.dependencies import get_current_active_user, get_current_active_user_optional
from app.repositories.interview_repository import InterviewRepository
from app.schemas.interview import (
    BulkInterviewFeedbackRequest,
    InterviewBatchCreateRequest,
    InterviewCancelRequest,
    InterviewCheckConflictRequest,
    InterviewCreateRequest,
    InterviewFeedbackRequest,
    InterviewRescheduleRequest,
    InterviewUpdateRequest,
    SendInterviewEmailRequest,
)
from app.services.interview_service import InterviewService
from app.utils.enums import InterviewStatus

router = APIRouter(prefix="/api/v1/interviews", tags=["Interviews"])


def get_interview_controller(db: AsyncIOMotorDatabase = Depends(get_database)) -> InterviewController:
    """Dependency injector for InterviewController."""
    interview_repo = InterviewRepository(db)
    interview_service = InterviewService(interview_repo)
    return InterviewController(interview_service)


@router.post(
    "/check-conflict",
    status_code=status.HTTP_200_OK,
    summary="Check interviewer/client time slot schedule conflict",
    description="Check if any interviewer or client already has an active interview scheduled at the given date and time.",
)
async def check_interview_conflict(
    payload: InterviewCheckConflictRequest,
    current_user: dict = Depends(get_current_active_user_optional),
    controller: InterviewController = Depends(get_interview_controller),
):
    return await controller.check_interview_conflict(payload)


@router.get(
    "/check-conflict",
    status_code=status.HTTP_200_OK,
    summary="Check interviewer/client time slot schedule conflict via query parameters",
    description="Query parameter based endpoint to check if interviewer or client has a time conflict.",
)
async def check_interview_conflict_get(
    scheduled_date: str = Query(..., description="Scheduled date (YYYY-MM-DD)"),
    scheduled_time: str = Query(..., description="Scheduled time (e.g. 10:00)"),
    interviewer_id: Optional[str] = Query(None),
    interviewer_name: Optional[str] = Query(None),
    client_id: Optional[str] = Query(None),
    client_name: Optional[str] = Query(None),
    exclude_interview_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_active_user_optional),
    controller: InterviewController = Depends(get_interview_controller),
):
    payload = InterviewCheckConflictRequest(
        scheduled_date=scheduled_date,
        scheduled_time=scheduled_time,
        interviewer_id=interviewer_id,
        interviewer_name=interviewer_name,
        client_id=client_id,
        client_name=client_name,
        exclude_interview_id=exclude_interview_id,
    )
    return await controller.check_interview_conflict(payload)


@router.post(
    "/upload-document",
    status_code=status.HTTP_201_CREATED,
    summary="Upload interview document to S3",
    description="Upload an interview document attachment directly to AWS S3 bucket and return access URL.",
)
async def upload_interview_document(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_active_user),
    controller: InterviewController = Depends(get_interview_controller),
):
    return await controller.upload_interview_document(file)


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="Schedule a new interview",
    description="Schedule an interview session for a candidate with round number, date, time, interviewer, and meeting details.",
)
async def create_interview(
    payload: InterviewCreateRequest,
    current_user: dict = Depends(get_current_active_user),
    controller: InterviewController = Depends(get_interview_controller),
):
    return await controller.create_interview(payload, user_id=current_user["id"])


@router.post(
    "/batch",
    status_code=status.HTTP_201_CREATED,
    summary="Batch schedule interviews globally",
    description="Assign and schedule interviews for multiple filtered candidates at once.",
)
async def batch_create_interviews(
    payload: InterviewBatchCreateRequest,
    current_user: dict = Depends(get_current_active_user),
    controller: InterviewController = Depends(get_interview_controller),
):
    return await controller.batch_create_interviews(payload, user_id=current_user["id"])


@router.get(
    "/feedback-questions",
    status_code=status.HTTP_200_OK,
    summary="Get interview feedback observation questions by type",
    description="Retrieve pre-configured observation questions loaded from JSON file based on interview type.",
)
async def get_feedback_questions(
    interview_type: Optional[str] = Query(None, description="Interview type filter (e.g. TECHNICAL, HR, MANAGERIAL, FINAL_ROUND)"),
    controller: InterviewController = Depends(get_interview_controller),
):
    return await controller.get_feedback_questions(interview_type=interview_type)


@router.get(
    "/candidate/{candidate_id}/active-status",
    status_code=status.HTTP_200_OK,
    summary="Check candidate active incomplete interview status from database",
    description="Query MongoDB database to check if candidate has any ongoing/incomplete interview session.",
)
async def check_candidate_active_status(
    candidate_id: str,
    candidate_name: Optional[str] = Query(None, description="Candidate name to check"),
    current_user: dict = Depends(get_current_active_user_optional),
    controller: InterviewController = Depends(get_interview_controller),
):
    return await controller.check_candidate_active_status(candidate_id, candidate_name=candidate_name)


@router.get(
    "/candidate/{candidate_id}/next-round-number",
    status_code=status.HTTP_200_OK,
    summary="Get next round number for candidate by interview type",
    description="Calculate next round number for candidate, filtered per interview_type or interview_type_id if provided.",
)
async def get_next_round_number(
    candidate_id: str,
    interview_type: Optional[str] = Query(None, description="Interview type filter"),
    interview_type_id: Optional[str] = Query(None, description="Interview type ID filter"),
    current_user: dict = Depends(get_current_active_user_optional),
    controller: InterviewController = Depends(get_interview_controller),
):
    return await controller.get_next_round_number(candidate_id, interview_type=interview_type, interview_type_id=interview_type_id)


@router.get(
    "/candidate/{candidate_id}/history",
    status_code=status.HTTP_200_OK,
    summary="Get complete candidate interview history",
    description="Retrieve all interview rounds and aggregated profile details for a candidate.",
)
async def get_candidate_history(
    candidate_id: str,
    current_user: dict = Depends(get_current_active_user_optional),
    controller: InterviewController = Depends(get_interview_controller),
):
    return await controller.get_candidate_history(candidate_id)


@router.get(
    "",
    status_code=status.HTTP_200_OK,
    summary="List and filter interviews",
    description="Retrieve paginated and filtered list of interviews.",
)
async def list_interviews(
    candidate_id: Optional[str] = Query(None, description="Filter by Candidate ID"),
    interviewer_id: Optional[str] = Query(None, description="Filter by Interviewer ID"),
    client_id: Optional[str] = Query(None, description="Filter by Client ID"),
    status_val: Optional[str] = Query(None, alias="status", description="Filter by Interview Status"),
    interview_type: Optional[str] = Query(None, description="Filter by Interview Type"),
    interview_type_id: Optional[str] = Query(None, description="Filter by Interview Type ID"),
    job_title: Optional[str] = Query(None, description="Filter by Job Title"),
    name: Optional[str] = Query(None, description="Filter by Candidate Name"),
    email: Optional[str] = Query(None, description="Filter by Candidate Email"),
    scheduled_date: Optional[str] = Query(None, description="Filter by Scheduled Date (YYYY-MM-DD)"),
    search: Optional[str] = Query(None, description="Global search query"),
    date_from: Optional[str] = Query(None, description="Filter scheduled_date >= date_from (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="Filter scheduled_date <= date_to (YYYY-MM-DD)"),
    recommendation: Optional[str] = Query(None, description="Filter by Recommendation"),
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    limit: int = Query(10, ge=1, le=500, description="Items per page"),
    skip: Optional[int] = Query(None, ge=0),
    current_user: dict = Depends(get_current_active_user_optional),
    controller: InterviewController = Depends(get_interview_controller),
):
    if current_user and isinstance(current_user, dict):
        user_role = str(current_user.get("role", "")).lower()
        if user_role in ["client", "client_guest"] and not client_id and not interviewer_id:
            client_id = current_user.get("id") or current_user.get("email") or current_user.get("full_name")
        elif user_role in ["external_interviewer", "candidate_interviewer"] and not interviewer_id and not client_id:
            interviewer_id = current_user.get("id") or current_user.get("email") or current_user.get("full_name")

    return await controller.list_interviews(
        candidate_id=candidate_id,
        interviewer_id=interviewer_id,
        client_id=client_id,
        status=status_val,
        interview_type=interview_type,
        interview_type_id=interview_type_id,
        job_title=job_title,
        name=name,
        email=email,
        scheduled_date=scheduled_date,
        search=search,
        date_from=date_from,
        date_to=date_to,
        recommendation=recommendation,
        page=page,
        limit=limit,
        skip=skip,
    )


@router.get(
    "/{interview_id}",
    status_code=status.HTTP_200_OK,
    summary="Get interview details",
    description="Retrieve specific interview details by ID.",
)
async def get_interview(
    interview_id: str,
    current_user: dict = Depends(get_current_active_user_optional),
    controller: InterviewController = Depends(get_interview_controller),
):
    return await controller.get_interview(interview_id)


@router.put(
    "/bulk-feedback",
    status_code=status.HTTP_200_OK,
    summary="Bulk submit candidate interview feedback",
    description="Update interviewer and/or client feedback for multiple candidates in a single bulk PUT request.",
)
async def bulk_submit_feedback(
    payload: BulkInterviewFeedbackRequest,
    current_user: dict = Depends(get_current_active_user),
    controller: InterviewController = Depends(get_interview_controller),
):
    return await controller.bulk_submit_feedback(payload, user_id=current_user["id"])


@router.put(
    "/{interview_id}",
    status_code=status.HTTP_200_OK,
    summary="Update interview details",
    description="Update fields of an existing interview.",
)
async def update_interview(
    interview_id: str,
    payload: InterviewUpdateRequest,
    current_user: dict = Depends(get_current_active_user),
    controller: InterviewController = Depends(get_interview_controller),
):
    return await controller.update_interview(interview_id, payload, user_id=current_user["id"])


@router.post(
    "/{interview_id}/reschedule",
    status_code=status.HTTP_200_OK,
    summary="Reschedule interview",
    description="Reschedule an existing interview session to a new date/time.",
)
async def reschedule_interview(
    interview_id: str,
    payload: InterviewRescheduleRequest,
    current_user: dict = Depends(get_current_active_user),
    controller: InterviewController = Depends(get_interview_controller),
):
    return await controller.reschedule_interview(interview_id, payload, user_id=current_user["id"])


@router.post(
    "/{interview_id}/feedback",
    status_code=status.HTTP_200_OK,
    summary="Submit interview feedback and rating",
    description="Submit rating score, feedback, strengths, weaknesses, and hiring recommendation.",
)
async def submit_feedback(
    interview_id: str,
    payload: InterviewFeedbackRequest,
    current_user: dict = Depends(get_current_active_user),
    controller: InterviewController = Depends(get_interview_controller),
):
    return await controller.submit_feedback(interview_id, payload, user_id=current_user["id"])




@router.delete(
    "/{interview_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete/cancel interview",
    description="Remove interview record from the database.",
)
async def delete_interview(
    interview_id: str,
    current_user: dict = Depends(get_current_active_user),
    controller: InterviewController = Depends(get_interview_controller),
):
    return await controller.delete_interview(interview_id)


@router.post(
    "/{interview_id}/send-mail",
    status_code=status.HTTP_200_OK,
    summary="Send interview schedule notification email",
    description="Dispatch email notification with template variable interpolation to candidate and/or interviewer.",
)
async def send_interview_mail(
    interview_id: str,
    payload: SendInterviewEmailRequest,
    current_user: dict = Depends(get_current_active_user_optional),
    controller: InterviewController = Depends(get_interview_controller),
):
    return await controller.send_interview_email(interview_id, payload)


@router.post(
    "/{interview_id}/cancel",
    status_code=status.HTTP_200_OK,
    summary="Cancel interview session",
    description="Update interview status to CANCELLED with optional cancellation reason and email notification.",
)
async def cancel_interview(
    interview_id: str,
    payload: InterviewCancelRequest,
    current_user: dict = Depends(get_current_active_user_optional),
    controller: InterviewController = Depends(get_interview_controller),
):
    user_id = current_user.get("id") if current_user and isinstance(current_user, dict) else None
    return await controller.cancel_interview(interview_id, payload, user_id=user_id)


