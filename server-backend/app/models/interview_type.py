"""
InterviewType entity model representation for MongoDB document persistence.
"""

from typing import Any, Dict, Optional
from pydantic import BaseModel, Field
from app.utils.helpers import generate_uuid, utc_now


class InterviewTypeDocument(BaseModel):
    """MongoDB Interview Type Document structure representation."""

    id: str = Field(default_factory=generate_uuid)
    name: str
    code: str
    description: Optional[str] = ""
    color: Optional[str] = "#4F46E5"
    is_active: bool = True
    is_system: bool = False
    is_deleted: bool = False
    created_at: str = Field(default_factory=lambda: utc_now().isoformat())
    updated_at: str = Field(default_factory=lambda: utc_now().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        """Convert pydantic model to dictionary for MongoDB operations."""
        return self.model_dump()
