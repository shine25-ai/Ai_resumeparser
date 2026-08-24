"""
Pydantic schemas for Resume entity, upload responses, text extraction, and metadata.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field
from app.utils.enums import ResumeStatus


class HRUpdateSchema(BaseModel):
    """HR Update entry DTO."""

    leadership_score: Optional[float] = None
    team_player: Optional[float] = None
    job_hopping_risk: Optional[float] = None
    recommended_upskilling: Optional[List[str]] = None
    communication: Optional[float] = None
    problem_solving: Optional[float] = None
    skill_weaknesses: Optional[List[str]] = None
    architecture_and_design_capabilities: Optional[float] = None
    resume_red_flags: Optional[List[str]] = None
    interview_focus_areas: Optional[List[str]] = None
    updated_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ResumeUpdateRequest(BaseModel):
    """Resume update payload DTO."""

    parsed_data: Optional[Dict[str, Any]] = None
    status: Optional[ResumeStatus] = None
    hr_update: Optional[HRUpdateSchema] = None

    model_config = ConfigDict(from_attributes=True)


class ResumeResponse(BaseModel):
    """Resume metadata response DTO."""

    id: str
    candidate_id: Optional[str] = None
    user_id: str
    uploaded_by_user_id: Optional[str] = None
    uploaded_by_name: Optional[str] = None
    uploaded_by_email: Optional[str] = None
    filename: str
    original_filename: str
    file_path: str
    extracted_text: Optional[str] = None
    s3_url: Optional[str] = None
    parsed_data: Optional[Dict[str, Any]] = None
    ai_evaluation: Optional[Dict[str, Any]] = None
    hr_updates: Optional[List[Dict[str, Any]]] = None
    other_documents: Optional[List[Dict[str, Any]]] = None
    is_auto_updated: Optional[bool] = False
    previous_upload_date: Optional[str] = None
    resume_source: Optional[str] = None
    resume_source_informer_name: Optional[str] = None
    upload_date: str
    status: ResumeStatus
    interview_assigned: Optional[bool] = False
    interview_status: Optional[str] = "NOT_ASSIGNED"
    last_interview_assigned_date: Optional[str] = None
    latest_interview: Optional[Dict[str, Any]] = None
    interviews: Optional[List[Dict[str, Any]]] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class ResumeExtractResponse(BaseModel):
    """Extracted resume text response ready for AI parsing."""

    id: str
    original_filename: str
    status: ResumeStatus
    extracted_text: str
    text_length: int

    model_config = ConfigDict(from_attributes=True)


class ResumeListResponse(BaseModel):
    """List of user resumes response."""

    total: int
    page: int = 1
    limit: int = 10
    total_pages: int = 1
    resumes: List[ResumeResponse]

    model_config = ConfigDict(from_attributes=True)


class ResumeLogResponse(BaseModel):
    """Resume log snapshot response DTO."""

    id: str
    resume_id: str
    user_id: str
    email: Optional[str] = None
    old_data: Dict[str, Any]
    action: str
    created_at: str

    model_config = ConfigDict(from_attributes=True)


class ResumeLogListResponse(BaseModel):
    """List of resume version logs response."""

    total: int
    logs: List[ResumeLogResponse]

    model_config = ConfigDict(from_attributes=True)

