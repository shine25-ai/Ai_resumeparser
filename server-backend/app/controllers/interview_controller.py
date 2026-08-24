"""
Interview controller handling HTTP requests for interview scheduling, filtering, updating, feedback, and deletion.
"""

from typing import Any, Dict, Optional
from fastapi import UploadFile, status
from fastapi.responses import JSONResponse

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
from app.utils.response import success_response


class InterviewController:
    """Controller orchestrating Interview API operations."""

    def __init__(self, interview_service: InterviewService):
        self.interview_service = interview_service

    async def check_interview_conflict(self, payload: InterviewCheckConflictRequest) -> JSONResponse:
        """Check if any interviewer or client has a time conflict."""
        res = await self.interview_service.check_interview_conflict(payload)
        return success_response(
            data=res.model_dump(),
            message="Schedule conflict check completed.",
        )

    async def upload_interview_document(self, file: UploadFile) -> JSONResponse:
        """Upload interview document file to AWS S3."""
        res = await self.interview_service.upload_interview_document(file)
        return success_response(
            data=res,
            message="Document uploaded to S3 successfully.",
            status_code=status.HTTP_201_CREATED,
        )

    async def create_interview(self, payload: InterviewCreateRequest, user_id: str) -> JSONResponse:
        """Schedule a new interview."""
        res = await self.interview_service.create_interview(payload, created_by=user_id)
        return success_response(
            data=res.model_dump(),
            message="Interview scheduled successfully.",
            status_code=status.HTTP_201_CREATED,
        )

    async def batch_create_interviews(self, payload: InterviewBatchCreateRequest, user_id: str) -> JSONResponse:
        """Schedule interviews for multiple candidates in batch."""
        res = await self.interview_service.batch_create_interviews(payload, created_by=user_id)
        return success_response(
            data=[r.model_dump() for r in res],
            message=f"Successfully scheduled {len(res)} interviews.",
            status_code=status.HTTP_201_CREATED,
        )

    async def get_interview(self, interview_id: str) -> JSONResponse:
        """Get details for single interview."""
        res = await self.interview_service.get_interview_by_id(interview_id)
        return success_response(
            data=res.model_dump(),
            message="Interview details retrieved successfully.",
        )

    async def list_interviews(
        self,
        candidate_id: Optional[str] = None,
        interviewer_id: Optional[str] = None,
        client_id: Optional[str] = None,
        status: Optional[Any] = None,
        interview_type: Optional[Any] = None,
        interview_type_id: Optional[str] = None,
        job_title: Optional[str] = None,
        name: Optional[str] = None,
        email: Optional[str] = None,
        scheduled_date: Optional[str] = None,
        search: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        recommendation: Optional[str] = None,
        page: int = 1,
        limit: int = 10,
        skip: Optional[int] = None,
    ) -> JSONResponse:
        """List and filter interviews."""
        res = await self.interview_service.filter_interviews(
            candidate_id=candidate_id,
            interviewer_id=interviewer_id,
            client_id=client_id,
            status=status,
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
        return success_response(
            data=res.model_dump(),
            message="Interviews retrieved successfully.",
        )

    async def update_interview(
        self,
        interview_id: str,
        payload: InterviewUpdateRequest,
        user_id: str,
    ) -> JSONResponse:
        """Update interview fields."""
        res = await self.interview_service.update_interview(interview_id, payload, updated_by=user_id)
        return success_response(
            data=res.model_dump(),
            message="Interview updated successfully.",
        )

    async def reschedule_interview(
        self,
        interview_id: str,
        payload: InterviewRescheduleRequest,
        user_id: str,
    ) -> JSONResponse:
        """Reschedule interview."""
        res = await self.interview_service.reschedule_interview(interview_id, payload, updated_by=user_id)
        return success_response(
            data=res.model_dump(),
            message="Interview rescheduled successfully.",
        )

    async def submit_feedback(
        self,
        interview_id: str,
        payload: InterviewFeedbackRequest,
        user_id: str,
        user_info: Optional[Dict[str, Any]] = None,
    ) -> JSONResponse:
        """Submit feedback, rating, dynamic skills, and category scores with evaluator user metadata."""
        if user_info and isinstance(user_info, dict):
            if not payload.evaluator_user_id:
                payload.evaluator_user_id = user_info.get("id") or user_id
            if not payload.evaluator_name:
                payload.evaluator_name = user_info.get("full_name") or user_info.get("name")
            if not payload.evaluator_email:
                payload.evaluator_email = user_info.get("email")
            if not payload.evaluator_role:
                payload.evaluator_role = user_info.get("role")

        res = await self.interview_service.submit_feedback(interview_id, payload, updated_by=user_id)
        return success_response(
            data=res.model_dump(),
            message="Interview feedback submitted successfully.",
        )

    async def bulk_submit_feedback(
        self,
        payload: BulkInterviewFeedbackRequest,
        user_id: str,
    ) -> JSONResponse:
        """Submit bulk candidate interview feedback."""
        res = await self.interview_service.bulk_submit_feedback(payload, updated_by=user_id)
        return success_response(
            data=[r.model_dump() for r in res],
            message=f"Successfully submitted bulk feedback for {len(res)} candidates.",
        )


    async def delete_interview(self, interview_id: str) -> JSONResponse:
        """Cancel/delete interview."""
        await self.interview_service.delete_interview(interview_id)
        return success_response(
            data={},
            message="Interview deleted successfully.",
        )

    async def get_candidate_history(self, candidate_id: str) -> JSONResponse:
        """Retrieve complete candidate profile and all interview rounds history."""
        res = await self.interview_service.get_candidate_history(candidate_id)
        return success_response(
            data=res.model_dump(),
            message="Candidate complete interview history retrieved successfully.",
        )

    async def send_interview_email(
        self,
        interview_id: str,
        payload: SendInterviewEmailRequest,
    ) -> JSONResponse:
        """Send notification email to candidate and/or interviewer."""
        res = await self.interview_service.send_interview_email(interview_id, payload)
        return success_response(
            data=res,
            message=res.get("message", "Interview email sent successfully."),
        )

    async def get_feedback_questions(self, interview_type: Optional[str] = None) -> JSONResponse:
        """Get feedback observation questions structured by interview type."""
        res = await self.interview_service.get_feedback_questions(interview_type=interview_type)
        return success_response(
            data=res,
            message="Feedback questions retrieved successfully.",
        )

    async def get_next_round_number(
        self, candidate_id: str, interview_type: Optional[str] = None, interview_type_id: Optional[str] = None
    ) -> JSONResponse:
        """Get calculated next round number for a candidate."""
        res = await self.interview_service.get_next_round_number(
            candidate_id, interview_type=interview_type, interview_type_id=interview_type_id
        )
        return success_response(
            data=res,
            message="Next round number calculated successfully.",
        )

    async def check_candidate_active_status(self, candidate_id: str, candidate_name: Optional[str] = None) -> JSONResponse:
        """Check candidate active incomplete interview status from database."""
        res = await self.interview_service.check_candidate_active_status(candidate_id, candidate_name=candidate_name)
        return success_response(
            data=res,
            message="Candidate active status checked successfully.",
        )

    async def cancel_interview(
        self,
        interview_id: str,
        payload: InterviewCancelRequest,
        user_id: Optional[str] = None,
    ) -> JSONResponse:
        """Cancel an interview session with optional cancellation reason and email dispatch."""
        res = await self.interview_service.cancel_interview(interview_id, payload, updated_by=user_id)
        return success_response(
            data=res.model_dump(),
            message="Interview cancelled successfully.",
        )


