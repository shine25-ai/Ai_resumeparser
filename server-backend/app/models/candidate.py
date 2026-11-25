"""
Candidate and Candidate Document models for Phase 6 (SRS 4.10).
"""

import re
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from app.utils.helpers import generate_uuid, utc_now


def normalize_email(email: Optional[str]) -> str:
    """Normalize email address to lowercase and trimmed."""
    if not email:
        return ""
    return email.strip().lower()


def normalize_phone(phone: Optional[str]) -> str:
    """Normalize phone number to last 10 digits."""
    if not phone:
        return ""
    digits = re.sub(r"\D", "", phone)
    return digits[-10:] if len(digits) >= 10 else digits


def with_candidate_defaults(doc: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Ensure candidate documents have default values when read."""
    if not doc:
        return {}
    d = dict(doc)
    d.setdefault("tags", [])
    d.setdefault("skills", [])
    d.setdefault("email", "")
    d.setdefault("phone", "")
    d.setdefault("emails", [d["email"]] if d.get("email") else [])
    d.setdefault("phones", [d["phone"]] if d.get("phone") else [])
    d.setdefault("status", "active")
    d.setdefault("source", "Direct")
    d.setdefault("merged_into", None)
    d.setdefault("owner_id", None)
    d.setdefault("owner_name", None)
    d.setdefault("location", "")
    d.setdefault("linkedin", "")
    d.setdefault("portfolio", "")
    d.setdefault("current_role", "")
    d.setdefault("total_experience_years", None)
    d.setdefault("created_at", utc_now().isoformat())
    d.setdefault("updated_at", d.get("created_at") or utc_now().isoformat())
    return d


class CandidateDocument(BaseModel):
    """The person entity in the recruitment platform."""

    id: str = Field(default_factory=generate_uuid)
    company_id: str = "default"
    full_name: str
    email: str
    normalized_email: str
    emails: List[str] = Field(default_factory=list)
    phone: str = ""
    normalized_phone: str = ""
    phones: List[str] = Field(default_factory=list)
    location: str = ""
    linkedin: str = ""
    portfolio: str = ""
    total_experience_years: Optional[float] = None
    current_role: str = ""
    skills: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    owner_id: Optional[str] = None
    owner_name: Optional[str] = None
    status: str = "active"  # active, archived, merged
    source: str = "Direct"
    merged_into: Optional[str] = None
    candidate_id_display: Optional[str] = None
    created_at: str = Field(default_factory=lambda: utc_now().isoformat())
    updated_at: str = Field(default_factory=lambda: utc_now().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        data = self.model_dump()
        data["normalized_email"] = normalize_email(data.get("email"))
        data["normalized_phone"] = normalize_phone(data.get("phone"))
        if data.get("email") and data["email"] not in data["emails"]:
            data["emails"].insert(0, data["email"])
        if data.get("phone") and data["phone"] not in data["phones"]:
            data["phones"].insert(0, data["phone"])
        return data


class CandidateFileDocument(BaseModel):
    """Resume files and AI parse results for a candidate."""

    id: str = Field(default_factory=generate_uuid)
    company_id: str = "default"
    candidate_id: str
    original_filename: str
    filename: str
    file_path: str = ""
    s3_url: Optional[str] = None
    file_hash: Optional[str] = None
    extracted_text: Optional[str] = None
    parsed_data: Dict[str, Any] = Field(default_factory=dict)
    ai_evaluation: Dict[str, Any] = Field(default_factory=dict)
    confidence: Dict[str, Any] = Field(default_factory=dict)
    status: str = "PENDING"  # PENDING, PARSED, FAILED
    uploaded_by: Optional[str] = None
    upload_date: str = Field(default_factory=lambda: utc_now().isoformat())
    created_at: str = Field(default_factory=lambda: utc_now().isoformat())
    updated_at: str = Field(default_factory=lambda: utc_now().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return self.model_dump()

