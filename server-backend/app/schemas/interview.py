"""
Pydantic schemas for Interview entity operations, scheduling, feedback, and responses.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field
from app.utils.enums import InterviewStatus, InterviewType


class SkillRatingItem(BaseModel):
    """Dynamic skill rating representation (e.g. Java: 4.0, SQL: 5.0, Data Bricks: 2.0)."""

    skill_name: str
    rating: float = Field(0.0, ge=0.0, le=10.0, description="Skill rating out of 5 or 10 stars")
    category: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class CategoryScoreItem(BaseModel):
    """Category-wise weighted evaluation item."""

    category: str
    weightage: float = Field(10.0, ge=0.0, le=100.0)
    rating: float = Field(4.0, ge=0.0, le=10.0)
    score: float = Field(80.0, ge=0.0, le=100.0)
    feedback: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class InterviewerFeedbackItem(BaseModel):
    """Interviewer item detail representation for panel/multi-interviewer rounds."""

    interviewer_id: Optional[str] = None
    interviewer_name: str
    interviewer_email: Optional[str] = None
    rating: Optional[float] = Field(None, ge=0.0, le=10.0, description="Rating score out of 5 or 10")
    feedback: Optional[str] = None
    strengths: List[str] = Field(default_factory=list)
    weaknesses: List[str] = Field(default_factory=list)
    skill_ratings: List[SkillRatingItem] = Field(default_factory=list)
    category_scores: List[CategoryScoreItem] = Field(default_factory=list)
    ai_score: Optional[float] = None
    ai_recommendation: Optional[str] = None
    recommendation: Optional[str] = None
    reason_note: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ClientFeedbackItem(BaseModel):
    """Client evaluator item detail representation for panel/multi-client feedback."""

    client_id: Optional[str] = None
    client_name: str
    client_email: Optional[str] = None
    client_rating: Optional[float] = Field(None, ge=0.0, le=10.0, description="Client Rating score out of 5 or 10")
    client_feedback: Optional[str] = None
    client_strengths: List[str] = Field(default_factory=list)
    client_weaknesses: List[str] = Field(default_factory=list)
    client_recommendation: Optional[str] = None
    client_notes: Optional[str] = None
    client_feedback_date: Optional[str] = None
    reason_note: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class InterviewCreateRequest(BaseModel):
    """Payload for scheduling a new interview."""

    candidate_id: str
    candidate_name: str
    candidate_email: Optional[str] = None
    resume_id: Optional[str] = None

    job_id: Optional[str] = None
    job_title: str
    job_location: Optional[str] = None
    job_type: Optional[str] = None

    interview_type: InterviewType = InterviewType.TECHNICAL
    round_number: int = 1

    scheduled_date: str
    scheduled_time: str
    timezone: str = "Asia/Kolkata"
    duration_minutes: int = 60

    interviewer_id: Optional[str] = None
    interviewer_name: str
    interviewer_email: Optional[str] = None

    meeting_link: Optional[str] = None
    meeting_platform: Optional[str] = "Google Meet"

    location: Optional[str] = None
    interview_location: Optional[str] = None
    hr_call_verification: Optional[str] = "Pending"
    candidate_requested_date_time: Optional[str] = None
    candidate_requested_date: Optional[str] = None
    candidate_requested_time: Optional[str] = None
    candidate_requested_role: Optional[str] = None
    salary_requested: Optional[str] = None
    final_fit_salary: Optional[str] = None
    joining_date: Optional[str] = None
    interview_document_files: List[str] = Field(default_factory=list)
    recommendation: Optional[str] = "Pending"  # Selected / Rejected / Pending / Hold

    # Client Feedback (Optional on creation)
    client_rating: Optional[float] = None
    client_feedback: Optional[str] = None
    client_strengths: List[str] = Field(default_factory=list)
    client_weaknesses: List[str] = Field(default_factory=list)
    client_recommendation: Optional[str] = None
    client_notes: Optional[str] = None
    client_id: Optional[str] = None
    client_name: Optional[str] = None
    client_email: Optional[str] = None
    client_feedback_date: Optional[str] = None

    # Multiple Interviewers & Clients Panel Support
    interviewers: Optional[List[InterviewerFeedbackItem]] = Field(default_factory=list)
    clients: Optional[List[ClientFeedbackItem]] = Field(default_factory=list)

    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class CandidateInterviewItem(BaseModel):
    """Candidate info for batch interview scheduling."""

    candidate_id: str
    candidate_name: str
    candidate_email: Optional[str] = None
    resume_id: Optional[str] = None
    location: Optional[str] = None
    interview_location: Optional[str] = None


class InterviewBatchCreateRequest(BaseModel):
    """Payload for scheduling interviews in batch for multiple candidates."""

    candidates: List[CandidateInterviewItem]
    job_id: Optional[str] = None
    job_title: str
    job_location: Optional[str] = None
    job_type: Optional[str] = None

    interview_type: InterviewType = InterviewType.TECHNICAL
    round_number: int = 1

    scheduled_date: str
    scheduled_time: str
    timezone: str = "Asia/Kolkata"
    duration_minutes: int = 60

    interviewer_id: Optional[str] = None
    interviewer_name: str
    interviewer_email: Optional[str] = None

    meeting_link: Optional[str] = None
    meeting_platform: Optional[str] = "Google Meet"

    location: Optional[str] = None
    interview_location: Optional[str] = None
    hr_call_verification: Optional[str] = "Pending"
    candidate_requested_date_time: Optional[str] = None
    candidate_requested_date: Optional[str] = None
    candidate_requested_time: Optional[str] = None
    candidate_requested_role: Optional[str] = None
    salary_requested: Optional[str] = None
    final_fit_salary: Optional[str] = None
    joining_date: Optional[str] = None
    interview_document_files: List[str] = Field(default_factory=list)
    recommendation: Optional[str] = "Pending"

    # Client Feedback (Optional on batch creation)
    client_rating: Optional[float] = None
    client_feedback: Optional[str] = None
    client_strengths: List[str] = Field(default_factory=list)
    client_weaknesses: List[str] = Field(default_factory=list)
    client_recommendation: Optional[str] = None
    client_notes: Optional[str] = None
    client_id: Optional[str] = None
    client_name: Optional[str] = None
    client_email: Optional[str] = None
    client_feedback_date: Optional[str] = None

    notes: Optional[str] = None

    # Multiple Interviewers & Clients Panel Support
    interviewers: Optional[List[InterviewerFeedbackItem]] = Field(default_factory=list)
    clients: Optional[List[ClientFeedbackItem]] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class InterviewUpdateRequest(BaseModel):
    """Payload for updating existing interview details."""

    candidate_name: Optional[str] = None
    candidate_email: Optional[str] = None
    job_title: Optional[str] = None
    job_location: Optional[str] = None
    job_type: Optional[str] = None
    interview_type: Optional[InterviewType] = None
    round_number: Optional[int] = None

    scheduled_date: Optional[str] = None
    scheduled_time: Optional[str] = None
    timezone: Optional[str] = None
    duration_minutes: Optional[int] = None

    interviewer_id: Optional[str] = None
    interviewer_name: Optional[str] = None
    interviewer_email: Optional[str] = None

    meeting_link: Optional[str] = None
    meeting_platform: Optional[str] = None

    location: Optional[str] = None
    interview_location: Optional[str] = None
    hr_call_verification: Optional[str] = None
    candidate_requested_date_time: Optional[str] = None
    candidate_requested_date: Optional[str] = None
    candidate_requested_time: Optional[str] = None
    candidate_requested_role: Optional[str] = None
    salary_requested: Optional[str] = None
    final_fit_salary: Optional[str] = None
    joining_date: Optional[str] = None
    interview_document_files: Optional[List[str]] = None
    interview_feedback_files: Optional[List[str]] = None
    recommendation: Optional[str] = None

    # Interviewer / Round Feedback
    rating: Optional[float] = None
    feedback: Optional[str] = None
    strengths: Optional[List[str]] = None
    weaknesses: Optional[List[str]] = None

    # Client Feedback
    client_rating: Optional[float] = None
    client_feedback: Optional[str] = None
    client_strengths: Optional[List[str]] = None
    client_weaknesses: Optional[List[str]] = None
    client_recommendation: Optional[str] = None
    client_notes: Optional[str] = None
    client_id: Optional[str] = None
    client_name: Optional[str] = None
    client_email: Optional[str] = None
    client_feedback_date: Optional[str] = None

    # Multiple Interviewers & Clients Panel Support
    interviewers: Optional[List[InterviewerFeedbackItem]] = None
    clients: Optional[List[ClientFeedbackItem]] = None

    status: Optional[InterviewStatus] = None
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class InterviewRescheduleRequest(BaseModel):
    """Payload for rescheduling an interview."""

    scheduled_date: str
    scheduled_time: str
    timezone: Optional[str] = "Asia/Kolkata"
    duration_minutes: Optional[int] = 60
    reason: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class InterviewFeedbackRequest(BaseModel):
    """Payload for submitting interview rating and feedback (Round Interviewer and/or Client)."""

    # Interviewer / Round Feedback
    rating: Optional[float] = Field(None, ge=0.0, le=10.0, description="Rating score out of 5 or 10")
    feedback: Optional[str] = None
    strengths: List[str] = Field(default_factory=list)
    weaknesses: List[str] = Field(default_factory=list)
    recommendation: Optional[str] = None  # Selected / Rejected / Pending / Hold
    notes: Optional[str] = None

    # Client Feedback
    client_rating: Optional[float] = Field(None, ge=0.0, le=10.0, description="Client Rating score out of 5 or 10")
    client_feedback: Optional[str] = None
    client_strengths: List[str] = Field(default_factory=list)
    client_weaknesses: List[str] = Field(default_factory=list)
    client_recommendation: Optional[str] = None  # Selected / Rejected / Pending / Hold
    client_notes: Optional[str] = None
    client_id: Optional[str] = None
    client_name: Optional[str] = None
    client_email: Optional[str] = None
    client_feedback_date: Optional[str] = None

    # Dynamic Skills Ratings & Weighted Category Evaluations & AI Scores
    skill_ratings: List[SkillRatingItem] = Field(default_factory=list)
    category_scores: List[CategoryScoreItem] = Field(default_factory=list)
    ai_score: Optional[float] = None
    ai_recommendation: Optional[str] = None

    # Multiple Interviewers & Clients Panel Support
    interviewers: Optional[List[InterviewerFeedbackItem]] = Field(default_factory=list)
    clients: Optional[List[ClientFeedbackItem]] = Field(default_factory=list)

    # Extensible fields updated during feedback/outcome phase
    candidate_requested_date_time: Optional[str] = None
    candidate_requested_date: Optional[str] = None
    candidate_requested_time: Optional[str] = None
    candidate_requested_role: Optional[str] = None
    salary_requested: Optional[str] = None
    final_fit_salary: Optional[str] = None
    joining_date: Optional[str] = None
    interview_document_files: List[str] = Field(default_factory=list)
    interview_feedback_files: List[str] = Field(default_factory=list)
    hr_call_verification: Optional[str] = None
    location: Optional[str] = None
    interview_location: Optional[str] = None
    meeting_link: Optional[str] = None
    meeting_platform: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class BulkFeedbackItem(InterviewFeedbackRequest):
    """Payload for updating feedback for a single interview within a bulk operation."""

    interview_id: str


class BulkInterviewFeedbackRequest(BaseModel):
    """Payload for submitting feedback for multiple interviews in bulk."""

    items: List[BulkFeedbackItem]

    model_config = ConfigDict(from_attributes=True)



class InterviewResponse(BaseModel):
    """Response schema representing an Interview document."""

    id: str
    candidate_id: str
    candidate_name: str
    candidate_email: Optional[str] = None
    resume_id: Optional[str] = None

    job_id: Optional[str] = None
    job_title: str
    job_location: Optional[str] = None
    job_type: Optional[str] = None

    interview_type: InterviewType
    round_number: int

    scheduled_date: str
    scheduled_time: str
    timezone: str
    duration_minutes: int

    interviewer_id: Optional[str] = None
    interviewer_name: str
    interviewer_email: Optional[str] = None

    meeting_link: Optional[str] = None
    meeting_platform: Optional[str] = None

    location: Optional[str] = None
    interview_location: Optional[str] = None
    hr_call_verification: Optional[str] = "Pending"
    candidate_requested_date_time: Optional[str] = None
    candidate_requested_date: Optional[str] = None
    candidate_requested_time: Optional[str] = None
    candidate_requested_role: Optional[str] = None
    salary_requested: Optional[str] = None
    final_fit_salary: Optional[str] = None
    joining_date: Optional[str] = None
    interview_document_files: List[str] = Field(default_factory=list)
    interview_feedback_files: List[str] = Field(default_factory=list)

    status: InterviewStatus

    # Interviewer / Round Feedback
    rating: Optional[float] = None
    feedback: Optional[str] = None
    strengths: List[str] = Field(default_factory=list)
    weaknesses: List[str] = Field(default_factory=list)

    # Dynamic Skills & Weighted Category Ratings & AI Score
    skill_ratings: List[SkillRatingItem] = Field(default_factory=list)
    category_scores: List[CategoryScoreItem] = Field(default_factory=list)
    ai_score: Optional[float] = None
    ai_recommendation: Optional[str] = None

    # Client Feedback
    client_rating: Optional[float] = None
    client_feedback: Optional[str] = None
    client_strengths: List[str] = Field(default_factory=list)
    client_weaknesses: List[str] = Field(default_factory=list)
    client_recommendation: Optional[str] = None
    client_notes: Optional[str] = None
    client_id: Optional[str] = None
    client_name: Optional[str] = None
    client_email: Optional[str] = None
    client_feedback_date: Optional[str] = None

    # Multiple Interviewers & Clients Panel Support
    interviewers: List[InterviewerFeedbackItem] = Field(default_factory=list)
    clients: List[ClientFeedbackItem] = Field(default_factory=list)

    recommendation: Optional[str] = None
    notes: Optional[str] = None

    reschedule_history: List[Dict[str, Any]] = Field(default_factory=list)

    email_sent_count: Optional[int] = 0
    last_email_sent_at: Optional[str] = None
    email_sent_history: List[Dict[str, Any]] = Field(default_factory=list)

    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    created_at: str
    updated_at: str

    model_config = ConfigDict(from_attributes=True)



class InterviewListResponse(BaseModel):
    """Paginated list of interviews response."""

    total: int
    interviews: List[InterviewResponse]
    page: Optional[int] = 1
    limit: Optional[int] = 10
    total_pages: Optional[int] = 1

    model_config = ConfigDict(from_attributes=True)


class CandidateFullHistoryResponse(BaseModel):
    """Full aggregated candidate interview history across all rounds response."""

    candidate_id: str
    candidate_name: str
    candidate_email: Optional[str] = None
    resume_id: Optional[str] = None
    job_id: Optional[str] = None
    job_title: Optional[str] = None
    job_location: Optional[str] = None
    job_type: Optional[str] = None
    location: Optional[str] = None
    interview_location: Optional[str] = None
    hr_call_verification: Optional[str] = None
    candidate_requested_date: Optional[str] = None
    candidate_requested_time: Optional[str] = None
    candidate_requested_role: Optional[str] = None
    salary_requested: Optional[str] = None
    final_fit_salary: Optional[str] = None
    joining_date: Optional[str] = None
    interview_document_files: List[str] = Field(default_factory=list)
    interview_feedback_files: List[str] = Field(default_factory=list)
    total_rounds: int
    rounds: List[InterviewResponse]

    model_config = ConfigDict(from_attributes=True)


class SendInterviewEmailRequest(BaseModel):
    """Payload for sending interview schedule emails to candidate and interviewer."""

    send_to_candidate: bool = True
    candidate_email: Optional[str] = None
    send_to_interviewer: bool = True
    interviewer_email: Optional[str] = None
    template_id: Optional[str] = None
    custom_notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

