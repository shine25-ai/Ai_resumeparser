"""
Resume Template entity model representation for MongoDB document persistence.
"""

from typing import Any, Dict, Optional
from pydantic import BaseModel, Field
from app.utils.helpers import generate_uuid, utc_now


class ResumeTemplateDocument(BaseModel):
    """MongoDB Resume Template Document structure representation."""

    id: str = Field(default_factory=generate_uuid)
    name: str
    description: Optional[str] = None
    type: str = "html" # "html" or "docx"
    content: Optional[str] = None # For HTML templates
    file_path: Optional[str] = None # For DOCX templates
    created_by_user_id: Optional[str] = None
    created_at: str = Field(default_factory=lambda: utc_now().isoformat())
    updated_at: str = Field(default_factory=lambda: utc_now().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        """Convert pydantic model to dictionary for MongoDB operations."""
        return self.model_dump()
