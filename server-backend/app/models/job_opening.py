"""
Job opening, public job application, and applicant email verification models for MongoDB persistence.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from app.utils.helpers import generate_uuid, utc_now

JOB_STATUS_OPEN = "OPEN"
JOB_STATUS_CLOSED = "CLOSED"


class JobOpeningDocument(BaseModel):
    """A role the company is hiring for. Applications are counted from job_applications."""

    id: str = Field(default_factory=generate_uuid)
    title: str
    company_id: str = "default"
    company_name: Optional[str] = None
    department: Optional[str] = ""
    location: Optional[str] = ""
    employment_type: Optional[str] = ""
    experience: Optional[str] = ""  # e.g. "2-4 years"
    description: Optional[str] = ""  # "About the role"
    responsibilities: List[str] = Field(default_factory=list)
    required_skills: List[str] = Field(default_factory=list)
    qualifications: List[str] = Field(default_factory=list)
    preferred_skills: List[str] = Field(default_factory=list)
    open_positions: int = 1
    status: str = JOB_STATUS_OPEN
    created_at: str = Field(default_factory=lambda: utc_now().isoformat())
    updated_at: str = Field(default_factory=lambda: utc_now().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return self.model_dump()


# Text on the public careers page that staff can change. The header and footer are fixed.
CAREERS_PAGE_DEFAULTS: Dict[str, str] = {
    "hero_eyebrow": "Careers at Shinelogics",
    "hero_title": "Find work that moves you forward.",
    "hero_subtitle": "Explore opportunities, build your skills and make an impact with us.",
    "search_placeholder": "Search by job title or keyword...",
    "listing_title": "Explore Open Positions",
    "listing_subtitle": "Find the right opportunity to grow your career with us.",
    "empty_message": "There are no open roles right now. Please check back later.",
    "success_title": "Thank you! Your resume has been submitted successfully.",
    "success_message": "We have received your details and resume. You will receive updates about relevant job opportunities through your registered email address.",
}


class JobApplicationDocument(BaseModel):
    """One applicant's application for one opening. The resume lives in the resumes collection."""

    id: str = Field(default_factory=generate_uuid)
    opening_id: str
    opening_title: str
    company_id: str = "default"
    company_name: Optional[str] = None
    applicant_email: str
    resume_id: str
    heard_from: Optional[str] = None
    note: Optional[str] = None
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
