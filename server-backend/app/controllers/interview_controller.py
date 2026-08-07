"""
Interview controller handling HTTP requests for interview scheduling, filtering, updating, feedback, and deletion.
"""

from typing import Optional
from fastapi import status
from fastapi.responses import JSONResponse

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
from app.utils.response import success_response


class InterviewController:
    """Controller orchestrating Interview API operations."""

    def __init__(self, interview_service: InterviewService):
        self.interview_service = interview_service

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
        status: Optional[InterviewStatus] = None,
        interview_type: Optional[InterviewType] = None,
        job_title: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> JSONResponse:
        """List and filter interviews."""
        res = await self.interview_service.filter_interviews(
            candidate_id=candidate_id,
            interviewer_id=interviewer_id,
            status=status,
            interview_type=interview_type,
            job_title=job_title,
            date_from=date_from,
            date_to=date_to,
            skip=skip,
            limit=limit,
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
    ) -> JSONResponse:
        """Submit feedback and rating."""
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

    async def get_next_round_number(self, candidate_id: str, interview_type: Optional[str] = None) -> JSONResponse:
        """Get calculated next round number for a candidate."""
        res = await self.interview_service.get_next_round_number(candidate_id, interview_type=interview_type)
        return success_response(
            data=res,
            message="Next round number calculated successfully.",
        )

