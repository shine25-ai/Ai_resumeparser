"""
Pydantic schemas for SkillsEvaluation entity representations, creation, and updates.
"""

from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class CategoryWeightageSchema(BaseModel):
    category: str = Field(..., min_length=1, max_length=100)
    weightage: int = Field(..., ge=0, le=100)


class SkillsEvaluationCreate(BaseModel):
    """Payload to create or update a skill categories template."""

    skill_name: str = Field(..., min_length=1, max_length=100)
    categories: List[CategoryWeightageSchema] = Field(default_factory=list)


class SkillsEvaluationResponse(BaseModel):
    """Response DTO for skill categories template."""

    id: str
    skill_name: str
    categories: List[CategoryWeightageSchema] = Field(default_factory=list)
    created_at: str
    updated_at: str

    model_config = ConfigDict(from_attributes=True)
