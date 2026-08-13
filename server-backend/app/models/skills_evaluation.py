"""
SkillsEvaluation entity model representation for MongoDB document persistence.
"""

from typing import Any, Dict, List
from pydantic import BaseModel, Field
from app.utils.helpers import generate_uuid, utc_now


class CategoryWeightage(BaseModel):
    category: str
    weightage: int


class SkillsEvaluationDocument(BaseModel):
    """MongoDB Skills Evaluation Template structure."""

    id: str = Field(default_factory=generate_uuid)
    skill_name: str
    categories: List[CategoryWeightage] = Field(default_factory=list)
    created_at: str = Field(default_factory=lambda: utc_now().isoformat())
    updated_at: str = Field(default_factory=lambda: utc_now().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        """Convert pydantic model to dictionary for MongoDB operations."""
        return self.model_dump()
