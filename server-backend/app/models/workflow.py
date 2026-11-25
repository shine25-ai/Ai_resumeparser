"""
Workflow and recruitment pipeline models (SRS 4.11, Screen 14).

A workflow defines the ordered stages through which candidate applications progress,
including stage types (active, hired, rejected, withdrawn), colours, and allowed transitions.
Every company has one default workflow; individual job openings can optionally override it.
"""

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field

from app.utils.helpers import generate_uuid, utc_now

StageType = Literal["active", "hired", "rejected", "withdrawn"]


class WorkflowStage(BaseModel):
    """One stage in a hiring workflow."""

    id: str                                  # slug / identifier, e.g. "applied", "screening"
    name: str                                # display name, e.g. "Applied", "Screening"
    colour: str                              # hex colour, e.g. "#6366f1"
    type: StageType = "active"
    order: int                               # 1-indexed order in pipeline
    requires_reason: bool = False            # True for rejection / withdrawal
    allowed_transitions: List[str] = Field(default_factory=list)  # Target stage IDs allowed from here

    def to_dict(self) -> Dict[str, Any]:
        return self.model_dump()


def default_workflow_stages() -> List[WorkflowStage]:
    """
    Standard 8-stage company default workflow:
    Applied -> Screening -> Shortlisted -> Interview -> Selected -> Hired
    with Rejected and Withdrawn terminal/re-opening stages.
    """
    return [
        WorkflowStage(
            id="applied",
            name="Applied",
            colour="#6366f1",
            type="active",
            order=1,
            requires_reason=False,
            allowed_transitions=["screening", "rejected", "withdrawn"],
        ),
        WorkflowStage(
            id="screening",
            name="Screening",
            colour="#a855f7",
            type="active",
            order=2,
            requires_reason=False,
            allowed_transitions=["shortlisted", "interview", "rejected", "withdrawn"],
        ),
        WorkflowStage(
            id="shortlisted",
            name="Shortlisted",
            colour="#eab308",
            type="active",
            order=3,
            requires_reason=False,
            allowed_transitions=["interview", "rejected", "withdrawn"],
        ),
        WorkflowStage(
            id="interview",
            name="Interviewing",
            colour="#0ea5e9",
            type="active",
            order=4,
            requires_reason=False,
            allowed_transitions=["selected", "rejected", "withdrawn"],
        ),
        WorkflowStage(
            id="selected",
            name="Selected",
            colour="#10b981",
            type="active",
            order=5,
            requires_reason=False,
            allowed_transitions=["hired", "rejected", "withdrawn"],
        ),
        WorkflowStage(
            id="hired",
            name="Hired",
            colour="#059669",
            type="hired",
            order=6,
            requires_reason=False,
            allowed_transitions=["withdrawn"],
        ),
        WorkflowStage(
            id="rejected",
            name="Rejected",
            colour="#ef4444",
            type="rejected",
            order=7,
            requires_reason=True,
            allowed_transitions=["screening"],
        ),
        WorkflowStage(
            id="withdrawn",
            name="Withdrawn",
            colour="#64748b",
            type="withdrawn",
            order=8,
            requires_reason=True,
            allowed_transitions=["screening"],
        ),
    ]


class WorkflowDocument(BaseModel):
    """A company or job-specific hiring workflow."""

    id: str = Field(default_factory=generate_uuid)
    company_id: str
    job_id: Optional[str] = None             # None = company default; set for per-job override
    name: str = "Standard Recruitment Workflow"
    is_default: bool = False
    stages: List[WorkflowStage] = Field(default_factory=default_workflow_stages)
    created_at: str = Field(default_factory=lambda: utc_now().isoformat())
    updated_at: str = Field(default_factory=lambda: utc_now().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return self.model_dump()


class ApplicationHistoryDocument(BaseModel):
    """Immutable audit entry for every stage change on an application."""

    id: str = Field(default_factory=generate_uuid)
    company_id: str
    application_id: str
    job_id: str
    from_stage: str
    to_stage: str
    action: str = "stage_moved"
    by: str
    at: str = Field(default_factory=lambda: utc_now().isoformat())
    reason: Optional[str] = None
    comment: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return self.model_dump()
