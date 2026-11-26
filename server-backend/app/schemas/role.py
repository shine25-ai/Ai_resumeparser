"""
Pydantic schemas for Role entity representations, creation, and updates.
"""

from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator


class RoleResponse(BaseModel):
    """Role response DTO."""

    id: str
    name: str
    slug: str
    description: Optional[str] = ""
    permissions: List[str] = Field(default_factory=list)
    is_system: bool = False
    created_at: str
    updated_at: str
    # Module permissions this role really has (old page names expanded), for the role editor.
    effective_permissions: List[str] = Field(default_factory=list)
    # How many of the company's users have this role (role list).
    users_count: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="after")
    def _effective(self) -> "RoleResponse":
        from app.core.permissions import expand_permissions

        self.effective_permissions = [p for p in expand_permissions(self.permissions) if ":" in p]
        return self


class RoleCreate(BaseModel):
    """Role creation payload schema."""

    name: str = Field(..., min_length=2, max_length=50)
    slug: Optional[str] = None
    description: Optional[str] = ""
    permissions: List[str] = Field(default_factory=list)


class RoleUpdate(BaseModel):
    """Role update payload schema."""

    name: Optional[str] = Field(None, min_length=2, max_length=50)
    description: Optional[str] = None
    permissions: Optional[List[str]] = None
