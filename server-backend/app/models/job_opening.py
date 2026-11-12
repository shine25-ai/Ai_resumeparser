"""
Job opening, public job application, and applicant email verification models for MongoDB persistence.
"""

from typing import Any, Dict, Optional
from pydantic import BaseModel, Field
from app.utils.helpers import generate_uuid, utc_now

JOB_STATUS_OPEN = "OPEN"
JOB_STATUS_CLOSED = "CLOSED"


class JobOpeningDocument(BaseModel):
    """A role the company is hiring for. Applications are counted from job_applications."""

    id: str = Field(default_factory=generate_uuid)
    title: str
    department: Optional[str] = ""
    location: Optional[str] = ""
    employment_type: Optional[str] = ""
    description: Optional[str] = ""
    open_positions: int = 1
    status: str = JOB_STATUS_OPEN
    created_at: str = Field(default_factory=lambda: utc_now().isoformat())
    updated_at: str = Field(default_factory=lambda: utc_now().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return self.model_dump()


class JobApplicationDocument(BaseModel):
    """One applicant's application for one opening. The resume lives in the resumes collection."""

    id: str = Field(default_factory=generate_uuid)
    opening_id: str
    opening_title: str
    applicant_email: str
    resume_id: str
    submitted_at: str = Field(default_factory=lambda: utc_now().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return self.model_dump()


class ApplicantVerificationDocument(BaseModel):
    """A pending email code. The document id is the normalized email. Only a hash of the code is stored."""

    id: str
    code_hash: str
    attempts: int = 0
    created_at: str = Field(default_factory=lambda: utc_now().isoformat())
    expires_at: str

    def to_dict(self) -> Dict[str, Any]:
        return self.model_dump()
