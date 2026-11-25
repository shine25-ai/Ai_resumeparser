"""
Shared harness for the Phase 12 suites (company isolation, permissions).

- `api_routes(app)` lists every API route of the running app (method, path, route), so the suites
  cover a new endpoint automatically and fail until it is classified.
- `Workspace` runs the real app on the in-memory FakeDatabase with two companies, A and B, signed-in
  users with real tokens, and one document per company in every tenant collection. Each B document
  carries the marker "ZZLEAKB", so any response that shows B's data to A can be detected.
"""

import copy
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple

from fastapi.routing import APIRoute
from httpx import ASGITransport, AsyncClient

from app.core.database import db_manager
from app.core.permissions import DEFAULT_ROLE_PERMISSIONS
from app.core.security import create_access_token
from app.core.tenant import TENANT_COLLECTIONS
from tests.fake_mongo import FakeDatabase

CO_A, CO_B = "co-a", "co-b"
MARK_A, MARK_B = "ZZLEAKA", "ZZLEAKB"
NOW = "2026-11-20T10:00:00+00:00"


# ── Route inventory ──────────────────────────────────────────────────────────


def api_routes(app) -> List[Tuple[str, str, Any]]:
    """Every (METHOD, path, route) under /api, read from the app itself (included routers unwrapped)."""
    seen = set()
    out = []
    for r in app.routes:
        if isinstance(r, APIRoute):
            candidates: Iterable[Any] = [r]
        elif hasattr(r, "effective_candidates"):
            candidates = r.effective_candidates()
        else:
            continue
        for c in candidates:
            if not hasattr(c, "dependant") or not getattr(c, "methods", None):
                continue
            if not str(c.path).startswith("/api/"):
                continue
            for m in sorted(set(c.methods) - {"HEAD", "OPTIONS"}):
                if (m, c.path) not in seen:
                    seen.add((m, c.path))
                    out.append((m, c.path, c))
    return sorted(out, key=lambda x: (x[1], x[0]))


def dependency_calls(dependant) -> Iterable[Any]:
    """Every dependency function of a route, at any depth."""
    for dep in dependant.dependencies:
        yield dep.call
        yield from dependency_calls(dep)


PARAM = re.compile(r"{([^}:]+)(?::[^}]+)?}")


def path_params(path: str) -> List[str]:
    return PARAM.findall(path)


def fill(path: str, values: Dict[str, str]) -> str:
    return PARAM.sub(lambda m: values.get(m.group(1), "x"), path)


# ── Seed data ────────────────────────────────────────────────────────────────

# Which collection a path parameter points at; anything else is tried against every B document.
PARAM_COLLECTION = {
    "candidate_id": ["candidates", "resumes"], "resume_id": ["resumes"], "document_id": ["candidate_documents"],
    "job_id": ["job_openings"], "opening_id": ["job_openings"], "application_id": ["job_applications"],
    "interview_id": ["interviews"], "user_id": ["users"], "role_id": ["roles"], "workflow_id": ["workflows"],
    "notification_id": ["notifications"], "panel_id": ["interview_panels"], "form_id": ["evaluation_forms"],
    "evaluation_id": ["interview_evaluations"], "invitation_id": ["user_invitations"], "key_id": ["integration_api_keys"],
    "template_id": ["job_templates", "mail_templates", "resume_templates", "ats_automation_templates"],
    "master_id": ["masters"], "type_id": ["interview_types"], "offer_id": ["ats_offers"],
    "scorecard_id": ["ats_scorecards"], "draft_id": ["application_drafts"], "page_id": ["career_pages"],
}


def _doc(coll: str, co: str, mark: str) -> Dict[str, Any]:
    """A document that looks enough like the real thing for lists, with the company's marker in its text."""
    ident = f"{co}-{coll}"
    email = f"{mark.lower()}.{coll}@example.com"
    base: Dict[str, Any] = {
        "_id": f"oid-{ident}", "id": ident, "company_id": co, "name": f"{mark} {coll}", "title": f"{mark} {coll}",
        "full_name": f"{mark} Person", "email": email, "description": mark, "notes": mark, "message": mark,
        "status": "OPEN", "created_at": NOW, "updated_at": NOW, "is_active": True,
    }
    extra: Dict[str, Dict[str, Any]] = {
        "job_openings": {"code": f"JOB-{mark}", "primary_skills": ["Java"], "secondary_skills": [], "department": mark,
                         "location": mark, "open_positions": 1, "status_history": [], "published_at": NOW},
        "candidates": {"normalized_email": email, "candidate_id_display": f"CND-{mark}", "tags": [mark], "notes": [],
                       "phones": [], "emails": [email], "current_role": mark, "source": "Careers page"},
        "resumes": {"candidate_id": f"CND-{mark}", "candidate_ref": f"{co}-candidates", "original_filename": f"{mark}.pdf",
                    "filename": f"{mark}.pdf", "status": "PARSED", "upload_date": NOW, "uploaded_by_email": email,
                    "parsed_data": {"full_name": f"{mark} Person", "email": email, "primary_skills": ["Java"]},
                    "file_path": f"/tmp/{mark}.pdf", "user_id": f"{co}-admin"},
        "job_applications": {"opening_id": f"{co}-job_openings", "opening_title": f"{mark} job", "applicant_email": email,
                             "resume_id": f"{co}-resumes", "candidate_id": f"{co}-candidates", "submitted_at": NOW,
                             "stage": "APPLIED", "stage_id": "applied", "form": {"personal": {"full_name": f"{mark} Person"}},
                             "review": {"status": "pending"}, "history": [], "consent": {}, "extracted": {}, "confidence": {}},
        "interviews": {"candidate_name": f"{mark} Person", "candidate_email": email, "candidate_id": f"{co}-candidates",
                       "resume_id": f"{co}-resumes", "job_id": f"{co}-job_openings", "job_title": f"{mark} job",
                       "scheduled_date": "2026-12-01", "scheduled_time": "10:00", "timezone": "Asia/Kolkata",
                       "duration_minutes": 60, "status": "SCHEDULED", "round_number": 1, "interviewers": [],
                       "interviewer_name": f"{mark} Interviewer", "interviewer_id": f"{co}-admin"},
        "users": {"role": "recruiter", "hashed_password": "x", "is_deleted": False},
        "interview_types": {"code": f"T{mark}", "label": mark},
        "mail_templates": {"subject": mark, "body": mark, "variables": []},
        "roles": {"slug": f"{co}-custom", "permissions": ["dashboard:view"]},
        "integration_api_logs": {"created_at": datetime(2026, 11, 20, tzinfo=timezone.utc), "endpoint": mark, "status_code": 200},
        "notifications": {"user_id": f"{co}-admin", "type": "info", "is_read": False, "link": ""},
        "candidate_skills": {"candidate_id": f"{co}-candidates", "skill_name": mark, "proficiency": 3.0},
        "workflows": {"is_default": True, "job_id": None, "stages": [{"id": "applied", "name": mark, "order": 1,
                                                                       "type": "active", "allowed_transitions": []}]},
        "masters": {"type": "skill", "value": mark, "label": mark},
        "audit_logs": {"action": mark, "entity_type": "x", "entity_id": ident, "actor": {"name": mark}},
    }
    base.update(extra.get(coll, {}))
    return base


def seed(raw: FakeDatabase) -> None:
    for co, mark in ((CO_A, MARK_A), (CO_B, MARK_B)):
        raw["companies"].docs.append({"id": co, "name": f"{mark} Company", "slug": co, "is_active": True,
                                      "plan": "enterprise", "created_at": NOW})
        for coll in sorted(TENANT_COLLECTIONS):
            raw[coll].docs.append(_doc(coll, co, mark))
        raw["users"].docs.append({"id": f"{co}-admin", "company_id": co, "email": f"admin@{co}.example.com",
                                  "full_name": f"{mark} Admin", "role": "admin", "is_active": True, "is_deleted": False,
                                  "hashed_password": "x", "created_at": NOW, "updated_at": NOW})
    # Built-in roles (no company): readable by every company
    for slug, perms in DEFAULT_ROLE_PERMISSIONS.items():
        raw["roles"].docs.append({"id": f"builtin-{slug}", "slug": slug, "name": slug, "permissions": list(perms),
                                  "is_system": True, "created_at": NOW, "updated_at": NOW})
    raw["users"].docs.append({"id": "super", "company_id": "default", "email": "super@example.com", "full_name": "Super",
                              "role": "superadmin", "is_active": True, "is_deleted": False, "hashed_password": "x"})
    raw["companies"].docs.append({"id": "default", "name": "Platform", "slug": "platform", "is_active": True})


def b_documents(raw: FakeDatabase) -> Dict[str, List[Dict[str, Any]]]:
    """Deep copy of everything that belongs to company B, to prove nothing of B's was changed."""
    snap = {name: copy.deepcopy([d for d in coll.docs if d.get("company_id") == CO_B])
            for name, coll in raw.collections.items()}
    return {k: v for k, v in snap.items() if v}


def b_ids_for(param: str) -> List[str]:
    colls = PARAM_COLLECTION.get(param)
    if colls:
        return [f"{CO_B}-{c}" for c in colls]
    return [f"{CO_B}-{c}" for c in sorted(TENANT_COLLECTIONS)]


class Workspace:
    """The real app on a seeded FakeDatabase. Use as `async with Workspace() as ws:`."""

    def __init__(self) -> None:
        self.raw = FakeDatabase()
        seed(self.raw)
        self._saved: Optional[Any] = None

    def token(self, user_id: str, company_id: Optional[str] = None) -> Dict[str, str]:
        claims = {"company_id": company_id} if company_id else None
        return {"Authorization": f"Bearer {create_access_token(user_id, timedelta(minutes=30), claims)}"}

    def add_user(self, user_id: str, role: str, company: str = CO_A) -> None:
        self.raw["users"].docs.append({"id": user_id, "company_id": company, "email": f"{user_id}@example.com",
                                       "full_name": user_id, "role": role, "is_active": True, "is_deleted": False,
                                       "hashed_password": "x", "created_at": NOW, "updated_at": NOW})

    async def __aenter__(self) -> "Workspace":
        from app.main import app

        self._saved = db_manager.db
        db_manager.db = self.raw
        self.app = app
        # A server error comes back as a 500 response instead of being raised into the test
        self.client = AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://testserver")
        return self

    async def __aexit__(self, *exc: Any) -> None:
        await self.client.aclose()
        db_manager.db = self._saved
