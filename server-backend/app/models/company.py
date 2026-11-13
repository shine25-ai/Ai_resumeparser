"""
Companies that hire through the resume portal. Each company has its own roles, careers page text
and careers page address (?company=<slug>). Applicants' resumes record the company and role they applied for.
"""

import re
from typing import Any, Dict
from pydantic import BaseModel, Field
from app.utils.helpers import generate_uuid, utc_now

COMPANY_STATUS_ACTIVE = "ACTIVE"
COMPANY_STATUS_INACTIVE = "INACTIVE"

# Roles and careers page text from before companies existed belong to this company. A careers page
# address with no company shows it, so links shared earlier keep working.
DEFAULT_COMPANY_ID = "default"
DEFAULT_COMPANY_NAME = "Shinelogics"
DEFAULT_COMPANY_SLUG = "shinelogics"

SLUG_PATTERN = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"


def slugify(value: str) -> str:
    """'Acme Tech Pvt. Ltd' -> 'acme-tech-pvt-ltd'."""
    return re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")[:60].strip("-")


class CompanyDocument(BaseModel):
    id: str = Field(default_factory=generate_uuid)
    name: str
    slug: str
    status: str = COMPANY_STATUS_ACTIVE
    created_at: str = Field(default_factory=lambda: utc_now().isoformat())
    updated_at: str = Field(default_factory=lambda: utc_now().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return self.model_dump()


def default_company_doc() -> Dict[str, Any]:
    return CompanyDocument(id=DEFAULT_COMPANY_ID, name=DEFAULT_COMPANY_NAME, slug=DEFAULT_COMPANY_SLUG).to_dict()


def company_ref(company: Dict[str, Any]) -> Dict[str, str]:
    """The company fields copied onto roles, applications and resumes."""
    return {"company_id": company["id"], "company_name": company["name"]}
