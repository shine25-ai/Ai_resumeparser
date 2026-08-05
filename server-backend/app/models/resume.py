"""
Resume entity model representation for MongoDB document persistence.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from app.utils.enums import ResumeStatus
from app.utils.helpers import generate_uuid, utc_now


class ResumeDocument(BaseModel):
    """MongoDB Resume Document structure representation."""

    id: str = Field(default_factory=generate_uuid)
    user_id: str
    filename: str
    original_filename: str
    file_path: str
    extracted_text: Optional[str] = None
    s3_url: Optional[str] = None
    file_hash: Optional[str] = None
    parsed_data: Optional[Dict[str, Any]] = None
    ai_evaluation: Optional[Dict[str, Any]] = None
    hr_updates: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    other_documents: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    email_conflict: bool = False
    existing_resume_id: Optional[str] = None
    redirect_id: Optional[str] = None
    is_auto_updated: bool = False
    previous_upload_date: Optional[str] = None
    resume_source: Optional[str] = None
    upload_date: str = Field(default_factory=lambda: utc_now().isoformat())
    status: ResumeStatus = ResumeStatus.PENDING

    def to_dict(self) -> Dict[str, Any]:
        """Convert pydantic model to dictionary for MongoDB operations."""
        return self.model_dump()
