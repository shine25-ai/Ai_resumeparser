"""
Companies using the resume portal. Each company is a separate workspace (tenant): its users, resumes,
roles, careers page, settings and templates are visible only to it (see app.core.tenant). The super admin
creates companies and their first admin.

email_domains: when set, the company's users must have an email address at one of these domains
(e.g. ["abc.com"]). Left empty, any address is allowed.

Lifecycle: `is_active` turns the workspace on or off; `archived_at` archives it (also off, and hidden from
the company list unless asked for). `status` only turns the careers page off.

Plans: for now the super admin sets the plan and its limits by hand (`limits`, 0 = no limit). Online payments
come later and will fill `billing_mode="gateway"` without changing this shape.
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


class CompanyAddress(BaseModel):
    line1: str = ""
    line2: str = ""
    city: str = ""
    state: str = ""
    country: str = ""
    pincode: str = ""


class CompanyContact(BaseModel):
    name: str = ""
    email: str = ""
    phone: str = ""


class CompanyLimits(BaseModel):
    """0 means no limit."""
    users: int = 0
    active_jobs: int = 0
    storage_mb: int = 0
    ai_parses_per_month: int = 0


class CompanyDocument(BaseModel):
    id: str = Field(default_factory=generate_uuid)
    name: str
    slug: str
    status: str = COMPANY_STATUS_ACTIVE
    email_domains: List[str] = Field(default_factory=list)
    # Turns the whole workspace off (its users cannot sign in). `status` only turns the careers page off.
    is_active: bool = True
    archived_at: Optional[str] = None
    # Profile (SRS 3.3)
    logo_url: str = ""
    website: str = ""
    industry: str = ""
    description: str = ""
    company_size: str = ""
    timezone: str = "Asia/Kolkata"
    address: CompanyAddress = Field(default_factory=CompanyAddress)
    contact: CompanyContact = Field(default_factory=CompanyContact)
    # Plan (set by the super admin for now)
    plan: str = ""
    billing_mode: str = "manual"
    limits: CompanyLimits = Field(default_factory=CompanyLimits)
    created_at: str = Field(default_factory=lambda: utc_now().isoformat())
    updated_at: str = Field(default_factory=lambda: utc_now().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return self.model_dump()


def default_company_doc() -> Dict[str, Any]:
    return CompanyDocument(id=DEFAULT_COMPANY_ID, name=DEFAULT_COMPANY_NAME, slug=DEFAULT_COMPANY_SLUG).to_dict()


# Fields a company admin may change on their own company. Everything else is the super admin's.
COMPANY_PROFILE_FIELDS = frozenset({
    "name", "logo_url", "website", "industry", "description", "company_size", "timezone", "address", "contact",
})
SUPERADMIN_ONLY_FIELDS = frozenset({"email_domains", "is_active", "plan", "limits", "billing_mode"})


def with_profile_defaults(company: Dict[str, Any]) -> Dict[str, Any]:
    """Companies saved before the profile fields existed get the defaults, so the API shape is always the same."""
    defaults = CompanyDocument(id=company.get("id") or "x", name=company.get("name") or "", slug=company.get("slug") or "x")
    out = dict(company)
    for key, value in defaults.model_dump().items():
        if key not in out or out[key] is None and value is not None:
            out[key] = value
        elif isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = {**value, **out[key]}
    out["archived_at"] = company.get("archived_at")
    out["is_archived"] = bool(company.get("archived_at"))
    return out


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
