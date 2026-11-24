"""
Request payloads for interview panels, evaluation forms and interviewer evaluations.
"""

from typing import Dict, List, Optional
from pydantic import BaseModel, Field, model_validator


class PanelMemberIn(BaseModel):
    user_id: str
    name: str
    email: Optional[str] = None
    role: str = Field(default="member", pattern="^(lead|member)$")


class AvailabilityWindow(BaseModel):
    weekday: int = Field(..., ge=0, le=6)  # Monday = 0
    start: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    end: str = Field(..., pattern=r"^\d{2}:\d{2}$")

    @model_validator(mode="after")
    def _ordered(self):
        if self.start >= self.end:
            raise ValueError("A window must end after it starts")
        return self


class InterviewPanelCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    code: Optional[str] = Field(default=None, max_length=30)
    description: Optional[str] = Field(default="", max_length=1000)
    status: str = Field(default="ACTIVE", pattern="^(ACTIVE|INACTIVE)$")
    availability: str = Field(default="INDIVIDUAL", pattern="^(INDIVIDUAL|COMMON|ON_REQUEST)$")
    weekly_availability: List[AvailabilityWindow] = Field(default_factory=list)
    members: List[PanelMemberIn] = Field(..., min_length=1)
    expertise_tags: List[str] = Field(default_factory=list)
    job_ids: List[str] = Field(default_factory=list)
    rounds: List[int] = Field(default_factory=list)


class EvaluationCriterionIn(BaseModel):
    id: str = Field(..., min_length=1, max_length=40)
    label: str = Field(..., min_length=1, max_length=200)
    weight: float = Field(default=1.0, ge=0)


class EvaluationFormCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    job_id: Optional[str] = None
    round_number: Optional[int] = Field(default=None, ge=1)
    scale_max: int = Field(default=5, ge=2, le=10)
    criteria: List[EvaluationCriterionIn] = Field(..., min_length=1)


class InterviewEvaluationSave(BaseModel):
    """Save a draft (submit=False) or submit a locked evaluation (submit=True)."""

    ratings: Dict[str, float] = Field(default_factory=dict)
    comments: Optional[str] = Field(default=None, max_length=5000)
    recommendation: Optional[str] = Field(default=None, pattern="^(NEXT_ROUND|SELECT|HOLD|REJECT)$")
    submit: bool = False


class EvaluationReopenRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)
