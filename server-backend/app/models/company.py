"""
Companies using the resume portal. Each company is a separate workspace (tenant): its users, resumes,
roles, careers page, settings and templates are visible only to it (see app.core.tenant). The super admin
creates companies and their first admin.

email_domains: when set, the company's users must have an email address at one of these domains
(e.g. ["abc.com"]). Left empty, any address is allowed.
"""

import re
from typing import Any, Dict, List, Optional
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
    email_domains: List[str] = Field(default_factory=list)
    # Turns the whole workspace off (its users cannot sign in). `status` only turns the careers page off.
    is_active: bool = True
    created_at: str = Field(default_factory=lambda: utc_now().isoformat())
    updated_at: str = Field(default_factory=lambda: utc_now().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return self.model_dump()


def default_company_doc() -> Dict[str, Any]:
    return CompanyDocument(id=DEFAULT_COMPANY_ID, name=DEFAULT_COMPANY_NAME, slug=DEFAULT_COMPANY_SLUG).to_dict()


def company_ref(company: Dict[str, Any]) -> Dict[str, str]:
    """The company fields copied onto roles, applications and resumes."""
    return {"company_id": company["id"], "company_name": company["name"]}


DOMAIN_PATTERN = re.compile(r"^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")


def clean_domains(values: Optional[List[str]]) -> List[str]:
    """'@ABC.com ' -> 'abc.com'. Raises ValueError for something that is not a domain."""
    cleaned: List[str] = []
    for value in values or []:
        domain = (value or "").strip().lower().lstrip("@")
        if not domain:
            continue
        if not DOMAIN_PATTERN.match(domain):
            raise ValueError(f"'{value}' is not an email domain, e.g. abc.com")
        if domain not in cleaned:
            cleaned.append(domain)
    return cleaned


def email_domain(email: str) -> str:
    return (email or "").strip().lower().rpartition("@")[2]


def email_allowed(company: Optional[Dict[str, Any]], email: str) -> bool:
    """True when the company has no domain list or the email is at one of its domains."""
    domains = (company or {}).get("email_domains") or []
    return not domains or email_domain(email) in domains
