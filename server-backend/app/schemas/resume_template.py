from typing import Optional
from pydantic import BaseModel, Field

class ResumeTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    type: str = "html" # "html" or "docx"
    content: Optional[str] = None # Used for HTML

class ResumeTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    type: Optional[str] = None
    content: Optional[str] = None

class ResumeTemplateResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    type: str
    content: Optional[str] = None
    file_path: Optional[str] = None
    created_at: str
    updated_at: str
