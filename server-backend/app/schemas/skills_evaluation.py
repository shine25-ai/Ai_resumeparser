"""
Pydantic schemas for SkillsEvaluation entity representations, creation, and updates.
"""

from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class CategoryWeightageSchema(BaseModel):
    category: str = Field(..., min_length=1, max_length=100)
    weightage: int = Field(..., ge=0, le=100)


class SkillsEvaluationCreate(BaseModel):
    """Payload to create or update a skill categories template."""

    skill_name: str = Field(..., min_length=1, max_length=100)
    categories: List[CategoryWeightageSchema] = Field(default_factory=list)

    @field_validator("categories")
    @classmethod
    def validate_unique_categories_per_skill(
        cls, v: List[CategoryWeightageSchema]
    ) -> List[CategoryWeightageSchema]:
        """Ensure categories within the same skill template contain no duplicate category names (case-insensitive)."""
        seen = set()
        unique_list = []
        for cat in v:
            cat_clean = cat.category.strip().lower()
            if cat_clean not in seen:
                seen.add(cat_clean)
                unique_list.append(cat)
        return unique_list


class SkillsEvaluationResponse(BaseModel):
    """Response DTO for skill categories template."""

    id: str
    skill_name: str
    categories: Optional[List[CategoryWeightageSchema]] = None
    created_at: str
    updated_at: str

    model_config = ConfigDict(from_attributes=True)
