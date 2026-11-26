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
    # The company (workspace) this user belongs to. Stamped by the database layer when left out.
    company_id: Optional[str] = None
    is_active: bool = True
    is_deleted: bool = False
    department: str = ""
    phone: str = ""
    avatar_url: str = ""
    last_login_at: Optional[str] = None
    # The user's own light/dark choice, used when the company lets users choose ("" = not chosen).
    ui_theme: str = ""
    created_at: str = Field(default_factory=lambda: utc_now().isoformat())
    updated_at: str = Field(default_factory=lambda: utc_now().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        """Convert pydantic model to dictionary for MongoDB operations."""
        return self.model_dump()
