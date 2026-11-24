"""
Interview panels, evaluation forms and per-interviewer evaluations (Phase 8) for MongoDB persistence.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from app.utils.helpers import generate_uuid, utc_now

EVALUATION_DRAFT = "DRAFT"
EVALUATION_SUBMITTED = "SUBMITTED"

# The four interview recommendations from Screen 12: move on, select for hire, hold, or reject.
RECOMMENDATIONS = ("NEXT_ROUND", "SELECT", "HOLD", "REJECT")


class PanelMemberDocument(BaseModel):
    user_id: str
    name: str
    email: Optional[str] = None
    role: str = "member"  # lead | member


class InterviewPanelDocument(BaseModel):
    """A reusable group of interviewers offered when scheduling a round."""

    id: str = Field(default_factory=generate_uuid)
    name: str
    code: Optional[str] = None  # e.g. PANEL-001
    description: Optional[str] = ""
    status: str = "ACTIVE"  # ACTIVE | INACTIVE
    availability: str = "INDIVIDUAL"  # INDIVIDUAL (each member's own calendar) | COMMON | ON_REQUEST
    # Weekly windows for COMMON availability: [{"weekday": 0-6 (Mon=0), "start": "HH:MM", "end": "HH:MM"}]
    weekly_availability: List[Dict[str, Any]] = Field(default_factory=list)
    members: List[PanelMemberDocument] = Field(default_factory=list)
    expertise_tags: List[str] = Field(default_factory=list)
    job_ids: List[str] = Field(default_factory=list)
    rounds: List[int] = Field(default_factory=list)
    created_by: Optional[str] = None
    created_at: str = Field(default_factory=lambda: utc_now().isoformat())
    updated_at: str = Field(default_factory=lambda: utc_now().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return self.model_dump()


class EvaluationCriterion(BaseModel):
    id: str
    label: str
    weight: float = 1.0


class EvaluationFormDocument(BaseModel):
    """
    Criteria and rating scale. Resolution order when an interview is evaluated:
    job + round, then job, then the company default (job_id and round_number both None).
    """

    id: str = Field(default_factory=generate_uuid)
    name: str
    job_id: Optional[str] = None
    round_number: Optional[int] = None
    scale_max: int = 5
    criteria: List[EvaluationCriterion]
    created_by: Optional[str] = None
    created_at: str = Field(default_factory=lambda: utc_now().isoformat())
    updated_at: str = Field(default_factory=lambda: utc_now().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return self.model_dump()


class InterviewEvaluationDocument(BaseModel):
    """
    One interviewer's evaluation of one interview. The form's criteria are copied in at first save,
    so editing the form later does not change scores already given.
    """

    id: str = Field(default_factory=generate_uuid)
    interview_id: str
    interviewer_user_id: str
    interviewer_name: str
    form_id: str
    scale_max: int
    criteria: List[Dict[str, Any]] = Field(default_factory=list)
    ratings: Dict[str, float] = Field(default_factory=dict)
    comments: Optional[str] = None
    recommendation: Optional[str] = None
    score: Optional[float] = None
    status: str = EVALUATION_DRAFT
    submitted_at: Optional[str] = None
    audit: List[Dict[str, Any]] = Field(default_factory=list)
    created_at: str = Field(default_factory=lambda: utc_now().isoformat())
    updated_at: str = Field(default_factory=lambda: utc_now().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return self.model_dump()
