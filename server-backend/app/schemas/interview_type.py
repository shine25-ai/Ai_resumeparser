"""
Pydantic schemas for Interview Type entity representations, creation, and updates.
"""

from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class InterviewTypeResponse(BaseModel):
    """Interview Type response DTO."""

    id: str
    name: str
    code: str
    description: Optional[str] = ""
    color: Optional[str] = "#4F46E5"
    is_active: bool = True
    is_system: bool = False
    created_at: str
    updated_at: str

    model_config = ConfigDict(from_attributes=True)


class InterviewTypeCreate(BaseModel):
    """Interview Type creation payload schema."""

    name: str = Field(..., min_length=2, max_length=100)
    code: Optional[str] = None
    description: Optional[str] = ""
    color: Optional[str] = "#4F46E5"
    is_active: bool = True


class InterviewTypeUpdate(BaseModel):
    """Interview Type update payload schema."""

    name: Optional[str] = Field(None, min_length=2, max_length=100)
    code: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    is_active: Optional[bool] = None
