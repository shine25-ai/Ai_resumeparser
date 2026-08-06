"""
Interview routes for scheduling, filtering, updating, feedback submission, and deletion.
"""

from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.controllers.interview_controller import InterviewController
from app.core.database import get_database
from app.core.dependencies import get_current_active_user, get_current_active_user_optional
from app.repositories.interview_repository import InterviewRepository
from app.schemas.interview import (
    BulkInterviewFeedbackRequest,
    InterviewBatchCreateRequest,
    InterviewCreateRequest,
    InterviewFeedbackRequest,
    InterviewRescheduleRequest,
    InterviewUpdateRequest,
    SendInterviewEmailRequest,
)
from app.services.interview_service import InterviewService
from app.utils.enums import InterviewStatus, InterviewType

router = APIRouter(prefix="/api/v1/interviews", tags=["Interviews"])


def get_interview_controller(db: AsyncIOMotorDatabase = Depends(get_database)) -> InterviewController:
    """Dependency injector for InterviewController."""
    interview_repo = InterviewRepository(db)
    interview_service = InterviewService(interview_repo)
    return InterviewController(interview_service)


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
    status_val: Optional[InterviewStatus] = Query(None, alias="status", description="Filter by Interview Status"),
    interview_type: Optional[InterviewType] = Query(None, description="Filter by Interview Type"),
    job_title: Optional[str] = Query(None, description="Filter by Job Title"),
    date_from: Optional[str] = Query(None, description="Filter scheduled_date >= date_from (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="Filter scheduled_date <= date_to (YYYY-MM-DD)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: dict = Depends(get_current_active_user_optional),
    controller: InterviewController = Depends(get_interview_controller),
):
    return await controller.list_interviews(
        candidate_id=candidate_id,
        interviewer_id=interviewer_id,
        status=status_val,
        interview_type=interview_type,
        job_title=job_title,
        date_from=date_from,
        date_to=date_to,
        skip=skip,
        limit=limit,
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

