"""
User entity model representation for MongoDB document persistence.
"""

from typing import Any, Dict, Optional
from pydantic import BaseModel, Field
from app.utils.enums import UserRole
from app.utils.helpers import generate_uuid, utc_now


class UserDocument(BaseModel):
    """MongoDB User Document structure representation."""

    id: str = Field(default_factory=generate_uuid)
    full_name: str
    email: str
    password: str
    role: str = "user"
    is_active: bool = True
    is_deleted: bool = False
    created_at: str = Field(default_factory=lambda: utc_now().isoformat())
    updated_at: str = Field(default_factory=lambda: utc_now().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        """Convert pydantic model to dictionary for MongoDB operations."""
        return self.model_dump()
