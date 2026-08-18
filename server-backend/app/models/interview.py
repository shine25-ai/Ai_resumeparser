"""
Interview entity model representation for MongoDB document persistence.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from app.utils.enums import InterviewStatus, InterviewType
from app.utils.helpers import generate_uuid, utc_now


class InterviewDocument(BaseModel):
    """MongoDB Interview Document structure."""

    id: str = Field(default_factory=generate_uuid)

    # Candidate Information
    candidate_id: str
    candidate_name: str
    candidate_email: Optional[str] = None
    resume_id: Optional[str] = None

    # Job Information
    job_id: Optional[str] = None
    job_title: str
    job_location: Optional[str] = None
    job_type: Optional[str] = None  # Full Time / Part Time / Contract / Remote / Hybrid

    # Interview Details
    interview_type: str = "TECHNICAL"
    interview_type_id: Optional[str] = None
    round_number: int = 1

    # Schedule
    scheduled_date: str
    scheduled_time: str
    timezone: str = "Asia/Kolkata"
    duration_minutes: int = 60

    # Interviewer Details
    interviewer_id: Optional[str] = None
    interviewer_name: str
    interviewer_email: Optional[str] = None

    # Meeting Details
    meeting_link: Optional[str] = None
    meeting_platform: Optional[str] = None  # Google Meet / Zoom / Teams

    # Location & Verification
    location: Optional[str] = None
    interview_location: Optional[str] = None
    hr_call_verification: Optional[str] = "Pending"

    # Requested & Salary / Joining Details
    candidate_requested_date_time: Optional[str] = None
    candidate_requested_date: Optional[str] = None
    candidate_requested_time: Optional[str] = None
    candidate_requested_role: Optional[str] = None
    salary_requested: Optional[str] = None
    final_fit_salary: Optional[str] = None
    joining_date: Optional[str] = None

    # Documents Attached
    interview_document_files: List[str] = Field(default_factory=list)
    interview_feedback_files: List[str] = Field(default_factory=list)

    # Status
    status: InterviewStatus = InterviewStatus.PENDING

    # Feedback (Interviewer / Round Feedback)
    rating: Optional[float] = None
    feedback: Optional[str] = None
    strengths: List[str] = Field(default_factory=list)
    weaknesses: List[str] = Field(default_factory=list)

    # Dynamic Skills Ratings & Weighted Category Evaluations & AI Score Calculation
    skill_ratings: List[Dict[str, Any]] = Field(default_factory=list)
    category_scores: List[Dict[str, Any]] = Field(default_factory=list)
    ai_score: Optional[float] = None
    ai_recommendation: Optional[str] = None

    # Client Feedback
    client_rating: Optional[float] = None
    client_feedback: Optional[str] = None
    client_strengths: List[str] = Field(default_factory=list)
    client_weaknesses: List[str] = Field(default_factory=list)
    client_recommendation: Optional[str] = None  # Selected / Rejected / Next Round / Hold
    client_notes: Optional[str] = None
    client_id: Optional[str] = None
    client_name: Optional[str] = None
    client_email: Optional[str] = None
    client_feedback_date: Optional[str] = None

    # Multiple Interviewers & Clients Panel Support
    interviewers: List[Dict[str, Any]] = Field(default_factory=list)
    clients: List[Dict[str, Any]] = Field(default_factory=list)

    # Recommendation
    recommendation: Optional[str] = None  # Selected / Rejected / Next Round / Hold

    # Notes
    notes: Optional[str] = None

    # Reschedule History
    reschedule_history: List[Dict[str, Any]] = Field(default_factory=list)

    # Email Dispatch Audit Tracking
    email_sent_count: int = 0
    last_email_sent_at: Optional[str] = None
    email_sent_history: List[Dict[str, Any]] = Field(default_factory=list)

    # Audit Fields
    created_by: Optional[str] = None
    updated_by: Optional[str] = None

    created_at: str = Field(default_factory=lambda: utc_now().isoformat())
    updated_at: str = Field(default_factory=lambda: utc_now().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        """Convert pydantic model to dictionary for MongoDB operations."""
        return self.model_dump()
