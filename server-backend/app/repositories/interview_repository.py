"""
Interview repository for MongoDB database queries regarding Interview entities.
"""

from typing import Any, Dict, List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.repositories.base_repository import BaseRepository
from app.utils.constants import INTERVIEWS_COLLECTION
from app.utils.enums import InterviewStatus, InterviewType
from app.utils.helpers import utc_now


class InterviewRepository(BaseRepository):
    """Repository handling database operations for interviews collection."""

    def __init__(self, db: AsyncIOMotorDatabase):
        super().__init__(db, INTERVIEWS_COLLECTION)

    async def get_by_candidate_id(self, candidate_id: str, skip: int = 0, limit: int = 100) -> List[Dict[str, Any]]:
        """Fetch list of interviews for specific candidate."""
        return await self.find_many(
            query={"candidate_id": candidate_id},
            skip=skip,
            limit=limit,
            sort_by="created_at",
            descending=True,
        )

    async def filter_interviews(
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
    ) -> List[Dict[str, Any]]:
        """Filter interviews based on query parameters."""
        import re

        and_conditions: List[Dict[str, Any]] = []

        if candidate_id:
            and_conditions.append({"candidate_id": candidate_id})

        if interviewer_id:
            and_conditions.append({"interviewer_id": interviewer_id})

        if status:
            and_conditions.append({"status": status.value if hasattr(status, "value") else status})

        if interview_type:
            and_conditions.append({"interview_type": interview_type.value if hasattr(interview_type, "value") else interview_type})

        if job_title and job_title.strip():
            jt_regex = re.compile(re.escape(job_title.strip()), re.IGNORECASE)
            and_conditions.append({"job_title": {"$regex": jt_regex}})

        if date_from or date_to:
            date_cond: Dict[str, Any] = {}
            if date_from:
                date_cond["$gte"] = date_from
            if date_to:
                date_cond["$lte"] = date_to
            and_conditions.append({"scheduled_date": date_cond})

        query = {"$and": and_conditions} if and_conditions else {}

        return await self.find_many(
            query=query,
            skip=skip,
            limit=limit,
            sort_by="scheduled_date",
            descending=False,
        )

    async def count_interviews(
        self,
        candidate_id: Optional[str] = None,
        interviewer_id: Optional[str] = None,
        status: Optional[InterviewStatus] = None,
    ) -> int:
        """Count total interviews matching criteria."""
        and_conditions: List[Dict[str, Any]] = []
        if candidate_id:
            and_conditions.append({"candidate_id": candidate_id})
        if interviewer_id:
            and_conditions.append({"interviewer_id": interviewer_id})
        if status:
            and_conditions.append({"status": status.value if hasattr(status, "value") else status})

        query = {"$and": and_conditions} if and_conditions else {}
        return await self.count(query=query)

    async def reschedule_interview(
        self,
        interview_id: str,
        new_date: str,
        new_time: str,
        timezone: str,
        duration_minutes: int,
        history_entry: Dict[str, Any],
        updated_by: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Update scheduled time/date and append entry to reschedule_history."""
        update_data = {
            "scheduled_date": new_date,
            "scheduled_time": new_time,
            "timezone": timezone,
            "duration_minutes": duration_minutes,
            "status": InterviewStatus.RESCHEDULED.value,
            "updated_by": updated_by,
            "updated_at": utc_now().isoformat(),
        }

        mongo_update = {
            "$set": update_data,
            "$push": {"reschedule_history": history_entry},
        }

        await self.collection.update_one({"id": interview_id}, mongo_update)
        return await self.get_by_id(interview_id)

    async def submit_feedback(
        self,
        interview_id: str,
        rating: Optional[float] = None,
        feedback: Optional[str] = None,
        strengths: Optional[List[str]] = None,
        weaknesses: Optional[List[str]] = None,
        recommendation: Optional[str] = None,
        notes: Optional[str] = None,
        client_rating: Optional[float] = None,
        client_feedback: Optional[str] = None,
        client_strengths: Optional[List[str]] = None,
        client_weaknesses: Optional[List[str]] = None,
        client_recommendation: Optional[str] = None,
        client_notes: Optional[str] = None,
        client_name: Optional[str] = None,
        client_feedback_date: Optional[str] = None,
        updated_by: Optional[str] = None,
        candidate_requested_date: Optional[str] = None,
        candidate_requested_time: Optional[str] = None,
        candidate_requested_role: Optional[str] = None,
        salary_requested: Optional[str] = None,
        final_fit_salary: Optional[str] = None,
        joining_date: Optional[str] = None,
        interview_document_files: Optional[List[str]] = None,
        interviewers: Optional[List[Dict[str, Any]]] = None,
        clients: Optional[List[Dict[str, Any]]] = None,
    ) -> Optional[Dict[str, Any]]:
        """Update feedback (interviewer round and/or client feedback) for an interview document."""
        update_data: Dict[str, Any] = {
            "status": InterviewStatus.COMPLETED.value,
            "updated_by": updated_by,
            "updated_at": utc_now().isoformat(),
        }

        if interviewers is not None:
            update_data["interviewers"] = interviewers
        if clients is not None:
            update_data["clients"] = clients

        if rating is not None:
            update_data["rating"] = rating
        if feedback is not None:
            update_data["feedback"] = feedback
        if strengths is not None:
            update_data["strengths"] = strengths
        if weaknesses is not None:
            update_data["weaknesses"] = weaknesses
        if recommendation is not None:
            update_data["recommendation"] = recommendation
        if notes is not None:
            update_data["notes"] = notes

        # Client Feedback fields
        if client_rating is not None:
            update_data["client_rating"] = client_rating
        if client_feedback is not None:
            update_data["client_feedback"] = client_feedback
        if client_strengths is not None:
            update_data["client_strengths"] = client_strengths
        if client_weaknesses is not None:
            update_data["client_weaknesses"] = client_weaknesses
        if client_recommendation is not None:
            update_data["client_recommendation"] = client_recommendation
        if client_notes is not None:
            update_data["client_notes"] = client_notes
        if client_name is not None:
            update_data["client_name"] = client_name
        if client_feedback_date is not None:
            update_data["client_feedback_date"] = client_feedback_date

        if candidate_requested_date is not None:
            update_data["candidate_requested_date"] = candidate_requested_date
        if candidate_requested_time is not None:
            update_data["candidate_requested_time"] = candidate_requested_time
        if candidate_requested_role is not None:
            update_data["candidate_requested_role"] = candidate_requested_role
        if salary_requested is not None:
            update_data["salary_requested"] = salary_requested
        if final_fit_salary is not None:
            update_data["final_fit_salary"] = final_fit_salary
        if joining_date is not None:
            update_data["joining_date"] = joining_date
        if interview_document_files is not None:
            update_data["interview_document_files"] = interview_document_files

        # Calculate a combined candidate_requested_date_time if provided or updated
        combined_dt = None
        if candidate_requested_date:
            combined_dt = f"{candidate_requested_date} {candidate_requested_time or ''}".strip()
        if combined_dt:
            update_data["candidate_requested_date_time"] = combined_dt

        return await self.update(interview_id, update_data)

