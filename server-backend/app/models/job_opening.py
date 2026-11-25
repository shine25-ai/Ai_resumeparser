"""
Job opening, public job application, and applicant email verification models for MongoDB persistence.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from app.utils.helpers import generate_uuid, utc_now

# Job statuses (SRS 4.4): Draft -> (Pending approval) -> Published -> Closed -> Archived.
# "OPEN" is the stored value for Published, kept from before so dashboards and the careers page keep working.
JOB_STATUS_DRAFT = "DRAFT"
JOB_STATUS_PENDING = "PENDING_APPROVAL"
JOB_STATUS_OPEN = "OPEN"
JOB_STATUS_CLOSED = "CLOSED"
JOB_STATUS_ARCHIVED = "ARCHIVED"
JOB_STATUSES = (JOB_STATUS_DRAFT, JOB_STATUS_PENDING, JOB_STATUS_OPEN, JOB_STATUS_CLOSED, JOB_STATUS_ARCHIVED)
JOB_STATUS_LABELS = {
    JOB_STATUS_DRAFT: "Draft",
    JOB_STATUS_PENDING: "Pending approval",
    JOB_STATUS_OPEN: "Published",
    JOB_STATUS_CLOSED: "Closed",
    JOB_STATUS_ARCHIVED: "Archived",
}
WORK_MODES = ("Onsite", "Hybrid", "Remote")
SALARY_PERIODS = ("year", "month", "hour")


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
    open_positions: int = 1  # "Vacancies"
    status: str = JOB_STATUS_OPEN
    created_at: str = Field(default_factory=lambda: utc_now().isoformat())
    updated_at: str = Field(default_factory=lambda: utc_now().isoformat())

    # ── Phase 3 (SRS Screens 5 and 6) ──
    code: str = ""                      # JOB-0001, per company
    category: str = ""
    work_mode: str = ""                 # Onsite / Hybrid / Remote
    experience_min: Optional[float] = None
    experience_max: Optional[float] = None
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    salary_currency: str = "INR"
    salary_period: str = "year"         # "Per annum" in the mockups
    show_salary: bool = False
    notice_period: str = ""
    certifications: List[str] = Field(default_factory=list)
    # Primary skills are the job's required skills, secondary its preferred ones (kept in step).
    primary_skills: List[str] = Field(default_factory=list)
    secondary_skills: List[str] = Field(default_factory=list)
    what_we_offer: List[str] = Field(default_factory=list)
    # Job page (Screen 17): one line under the title, the "Requirements" and "Good to have" bullet lists.
    tagline: str = ""
    requirements: List[str] = Field(default_factory=list)
    nice_to_have: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    additional_requirements: str = ""
    rounds: List[Dict[str, Any]] = Field(default_factory=list)  # [{order, name, interview_type, duration_minutes}]
    closing_date: Optional[str] = None  # YYYY-MM-DD; no new applications after it
    hiring_manager: Optional[Dict[str, Any]] = None  # {id, name}
    notify_emails: List[str] = Field(default_factory=list)  # told about new applications
    send_candidate_confirmation: bool = True
    accept_applications: bool = True
    status_history: List[Dict[str, Any]] = Field(default_factory=list)  # [{from, to, at, by, note}]
    created_by: Optional[Dict[str, Any]] = None
    published_at: Optional[str] = None
    closed_at: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return self.model_dump()


def with_job_defaults(job: Dict[str, Any]) -> Dict[str, Any]:
    """Jobs saved before Phase 3 get the new fields, so the API shape is always the same."""
    base = JobOpeningDocument(title=job.get("title") or "").model_dump()
    out = {**base, **{k: v for k, v in job.items() if k != "_id"}}
    if not out.get("primary_skills") and out.get("required_skills"):
        out["primary_skills"] = list(out["required_skills"])
    if not out.get("secondary_skills") and out.get("preferred_skills"):
        out["secondary_skills"] = list(out["preferred_skills"])
    out["status_label"] = JOB_STATUS_LABELS.get(out.get("status"), out.get("status"))
    return out


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


APPLICATION_STAGE_APPLIED = "APPLIED"
REVIEW_PENDING = "pending"
REVIEW_DONE = "reviewed"


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
    # ── Phase 5 (SRS 4.8, Screen 18): the 5-step application ──
    stage: str = APPLICATION_STAGE_APPLIED     # the pipeline (Phase 7) moves it on
    stage_id: Optional[str] = "applied"
    stage_updated_at: Optional[str] = None
    hired_at: Optional[str] = None             # set once when moving to Hired
    rejection_reason: Optional[str] = None
    rejection_comment: Optional[str] = None
    source: str = "Careers page"
    form: Dict[str, Any] = Field(default_factory=dict)        # what the candidate entered (app.services.application_service)
    extracted: Dict[str, Any] = Field(default_factory=dict)   # what the AI read from the resume, in the same shape
    confidence: Dict[str, Any] = Field(default_factory=dict)  # {score, level, fields: {name: bool}}
    consent: Dict[str, Any] = Field(default_factory=dict)     # {accepted, text, version, at, ip}
    review: Dict[str, Any] = Field(default_factory=lambda: {"status": REVIEW_PENDING})
    history: List[Dict[str, Any]] = Field(default_factory=list)  # [{at, action, by, note}]
    linked_existing_profile: bool = False   # the same resume was already on file; no new profile was made

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
