"""
Pydantic schemas for Role entity representations, creation, and updates.
"""

from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


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

    model_config = ConfigDict(from_attributes=True)


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
