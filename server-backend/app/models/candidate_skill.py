"""
Candidate Skill Intelligence Models (Phase 9 - SRS 4.16, Screen 13).
Tenant collection: `candidate_skills`
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from app.utils.helpers import generate_uuid, utc_now

SKILL_SOURCE_RESUME = "resume"
SKILL_SOURCE_INTERVIEW = "interview"
SKILL_SOURCE_HR = "HR"
SKILL_SOURCES = (SKILL_SOURCE_RESUME, SKILL_SOURCE_INTERVIEW, SKILL_SOURCE_HR)

SKILL_CLASS_PRIMARY = "primary"
SKILL_CLASS_SECONDARY = "secondary"
SKILL_CLASSES = (SKILL_CLASS_PRIMARY, SKILL_CLASS_SECONDARY)


class CandidateSkillDocument(BaseModel):
    """
    Skill possessed by a candidate with weighted proficiency, verification status,
    evidence trace, and classification (primary / secondary).
    """
    id: str = Field(default_factory=generate_uuid)
    company_id: Optional[str] = None
    candidate_id: str
    skill_name: str           # Master normalized name (e.g. "React")
    raw_name: str = ""        # Exact spelling found (e.g. "React.js")
    proficiency: float = 3.0  # 1.0 to 5.0
    sources: List[str] = Field(default_factory=lambda: [SKILL_SOURCE_RESUME])
    years_experience: Optional[float] = None
    last_used: Optional[str] = None       # e.g. "2024" or ISO date
    verified: bool = False                # verified by interview evaluation or HR edit
    confidence: float = 0.85              # 0.0 to 1.0 confidence score
    skill_class: str = SKILL_CLASS_SECONDARY  # "primary" or "secondary"
    explanation: str = ""                 # e.g. "Primary: Java — resume 6 yrs, interview 4/5"
    created_at: str = Field(default_factory=lambda: utc_now().isoformat())
    updated_at: str = Field(default_factory=lambda: utc_now().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        data = self.model_dump()
        if not data.get("company_id"):
            # The tenant layer stamps the request's company; a None here would be refused as a company change.
            data.pop("company_id", None)
        return data


def with_candidate_skill_defaults(doc: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not doc:
        return {}
    d = dict(doc)
    d.setdefault("sources", [SKILL_SOURCE_RESUME])
    d.setdefault("verified", False)
    d.setdefault("skill_class", SKILL_CLASS_SECONDARY)
    d.setdefault("proficiency", 3.0)
    d.setdefault("confidence", 0.85)
    return d

