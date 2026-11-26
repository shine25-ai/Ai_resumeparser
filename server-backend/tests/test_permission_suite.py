"""
Phase 12: permissions, for EVERY API route (read from the app). With PERMISSIONS_MODE=enforce, each default
role (SRS Screen 19) calls each route in its own company:

- a route its permissions don't allow answers 403, a route they allow never answers 403;
- every route is classified: it checks a permission in its dependencies, or it is listed below as public,
  as open to every signed-in staff member, or as checking inside its handler. A new route that is none of
  these fails here until someone decides who may use it;
- public routes work without signing in; every other route answers 401 without a token.
"""

import inspect
from typing import Any, Callable, Dict, List, Optional, Tuple

import pytest

from app.core import dependencies as deps
from app.core.config import settings
from app.core.permissions import DEFAULT_ROLE_PERMISSIONS, expand_permissions
from tests.phase12_harness import CO_A, Workspace, api_routes, dependency_calls, fill, path_params

V1 = "/api/v1"

# No sign-in by design: sign-in steps, the careers site, invitation links, signed file links, public
# branding, and the integration API (which checks its own API key).
PUBLIC = {
    ("POST", f"{V1}/auth/login"), ("POST", f"{V1}/auth/refresh"), ("POST", f"{V1}/auth/register"),
    ("POST", f"{V1}/auth/mfa/verify"), ("POST", f"{V1}/auth/mfa/setup/start"), ("POST", f"{V1}/auth/mfa/setup/confirm"),
    ("GET", f"{V1}/files/{{token}}"),
    ("GET", f"{V1}/public/branding"), ("GET", f"{V1}/public/branding/assets/{{asset_id}}"),
    ("GET", f"{V1}/public/career-page"), ("GET", f"{V1}/public/career-page/embed.js"),
    ("GET", f"{V1}/public/career-page/resolve-host"), ("GET", f"{V1}/public/career-page/tls-allowed"),
    ("GET", f"{V1}/public/invitations/{{token}}"), ("POST", f"{V1}/public/invitations/{{token}}/accept"),
    ("GET", f"{V1}/public/jobs"), ("GET", f"{V1}/public/jobs/page"),
    ("POST", f"{V1}/public/jobs/verification/request"), ("POST", f"{V1}/public/jobs/verification/confirm"),
    ("POST", f"{V1}/public/jobs/{{opening_id}}/applications"), ("POST", f"{V1}/public/jobs/{{opening_id}}/apply"),
    ("GET", f"{V1}/public/jobs/{{opening_id}}/drafts/{{draft_id}}"), ("POST", f"{V1}/public/jobs/{{opening_id}}/resume"),
    ("GET", f"{V1}/public/track/{{token}}"),
    ("POST", f"{V1}/integration/resumes"), ("GET", f"{V1}/integration/resumes/lookup"),
    ("GET", f"{V1}/integration/interviews/lookup"), ("GET", f"{V1}/integration/resumes/{{resume_id}}"),
    ("GET", f"{V1}/integration/resumes/{{resume_id}}/status"), ("GET", f"{V1}/integration/resumes/{{resume_id}}/interviews"),
    ("GET", f"{V1}/integration/resumes/{{resume_id}}/interviews/{{interview_id}}"),
}

# Every signed-in staff member, whatever their role: their own account and notifications, the company's
# look and app settings, role names, and the staff directory (pickers for interviewers, hiring managers,
# panels). The directory never includes passwords, MFA secrets or tokens (see test_isolation_suite).
SELF_SERVICE = {
    ("POST", f"{V1}/auth/logout"), ("POST", f"{V1}/auth/change-password"), ("POST", f"{V1}/auth/switch-company"),
    ("POST", f"{V1}/auth/mfa/enrol/start"), ("POST", f"{V1}/auth/mfa/enrol/confirm"), ("POST", f"{V1}/auth/mfa/disable"),
    ("GET", f"{V1}/users/me"), ("PUT", f"{V1}/users/me"),
    ("GET", f"{V1}/users"), ("GET", f"{V1}/users/stats"), ("GET", f"{V1}/users/{{user_id}}"),
    ("GET", f"{V1}/notifications"), ("POST", f"{V1}/notifications/read-all"),
    ("PATCH", f"{V1}/notifications/{{notification_id}}/read"),
    ("GET", f"{V1}/branding"), ("GET", f"{V1}/settings/app"),
    ("GET", f"{V1}/roles"), ("GET", f"{V1}/roles/permission-matrix"), ("GET", f"{V1}/roles/{{role_id}}"),
}


def _platform_only(user: Dict[str, Any]) -> bool:
    return deps.is_superadmin(user)


def _own_company_admin(user: Dict[str, Any]) -> bool:
    return deps.is_superadmin(user) or deps.is_company_admin(user)


# Routes that decide inside the handler (companies are managed by the super admin; a company admin may
# see and edit their own company's panel).
HANDLER_CHECKED: Dict[Tuple[str, str], Callable[[Dict[str, Any]], bool]] = {
    ("GET", f"{V1}/companies"): lambda u: True,                       # the super admin sees all, others their own
    ("POST", f"{V1}/companies"): _platform_only,
    ("GET", f"{V1}/companies/export"): _platform_only,
    ("POST", f"{V1}/companies/{{company_id}}/archive"): _platform_only,
    ("POST", f"{V1}/companies/{{company_id}}/restore"): _platform_only,
    ("PATCH", f"{V1}/companies/{{company_id}}"): _own_company_admin,
    ("GET", f"{V1}/companies/{{company_id}}/summary"): _own_company_admin,
    ("GET", f"{V1}/companies/{{company_id}}/usage"): _own_company_admin,
    ("GET", f"{V1}/operations/health"): _platform_only,
    ("GET", f"{V1}/operations/platform-settings"): _platform_only,
    ("PATCH", f"{V1}/operations/platform-settings"): _platform_only,
}


# Allowed by the role, then decided per record in the handler: a 403 here means "not for this record".
RECORD_RULES = {
    ("PUT", f"{V1}/interviews/{{interview_id}}/evaluations/me"),   # only an interviewer assigned to that interview
}


def _settings_admin(user: Dict[str, Any]) -> bool:
    role = str(user.get("role", "")).lower()
    return role in ("admin", "superadmin") or "settings" in (user.get("permissions") or [])


def checks_for(route: Any, method: str, path: str) -> List[Callable[[Dict[str, Any]], bool]]:
    """The permission checks a route's dependencies make, as functions of the user."""
    out: List[Callable[[Dict[str, Any]], bool]] = []
    for call in dependency_calls(route.dependant):
        name = getattr(call, "__qualname__", "")
        if name == "require_access.<locals>.access_checker":
            v = inspect.getclosurevars(call).nonlocals
            perm = v["overrides"].get((method, path)) or f"{v['module']}:{deps._METHOD_ACTION.get(method, 'view')}"
            out.append(lambda u, p=perm: deps.can(u, p))
        elif name == "require_can.<locals>.checker":
            perm = inspect.getclosurevars(call).nonlocals["permission"]
            out.append(lambda u, p=perm: deps.can(u, p))
        elif name == "require_permission.<locals>.permission_checker":
            perm = inspect.getclosurevars(call).nonlocals["required_perm"]
            out.append(lambda u, p=perm: deps.has_permission(u, p))
        elif call is deps.require_company_admin:
            out.append(deps.is_company_admin)
        elif call is deps.require_superadmin:
            out.append(deps.is_superadmin)
        elif name == "require_settings_admin":
            out.append(_settings_admin)
    return out


def expected(route: Any, method: str, path: str, user: Dict[str, Any]) -> Optional[bool]:
    """True/False when the route allows/denies the user; None for public routes."""
    if (method, path) in PUBLIC:
        return None
    if (method, path) in HANDLER_CHECKED:
        return HANDLER_CHECKED[(method, path)](user)
    return all(check(user) for check in checks_for(route, method, path))


def _values(path: str) -> Dict[str, str]:
    """The caller's own company's IDs for path parameters, so a 'yes' can really succeed."""
    from tests.phase12_harness import PARAM_COLLECTION
    out = {}
    for p in path_params(path):
        if p == "company_id":
            out[p] = CO_A
        else:
            out[p] = f"{CO_A}-{(PARAM_COLLECTION.get(p) or ['users'])[0]}"
    return out


ROLES = sorted(DEFAULT_ROLE_PERMISSIONS)


@pytest.fixture
def enforce(monkeypatch):
    monkeypatch.setattr(settings, "PERMISSIONS_MODE", "enforce")


@pytest.mark.asyncio
async def test_every_route_is_classified():
    async with Workspace() as ws:
        routes = api_routes(ws.app)
    names = {(m, p) for m, p, _ in routes}
    unclassified = [f"{m} {p}" for m, p, r in routes
                    if not checks_for(r, m, p) and (m, p) not in PUBLIC | SELF_SERVICE | set(HANDLER_CHECKED)]
    stale = sorted(f"{m} {p}" for m, p in PUBLIC | SELF_SERVICE | set(HANDLER_CHECKED) | RECORD_RULES if (m, p) not in names)
    assert unclassified == [], "new routes must check a permission or be listed as public / self-service"
    assert stale == [], "listed routes that no longer exist"


@pytest.mark.asyncio
async def test_sign_in_is_required_except_on_public_routes():
    wrong: List[str] = []
    async with Workspace() as ws:
        for method, path, _ in api_routes(ws.app):
            resp = await ws.client.request(method, fill(path, _values(path)), json={} if method in ("POST", "PUT", "PATCH") else None)
            public = (method, path) in PUBLIC
            if public and resp.status_code == 401 and "integration" not in path:
                wrong.append(f"{method} {path}: public but asks for sign-in")
            if not public and resp.status_code != 401:
                wrong.append(f"{method} {path}: {resp.status_code} without a token")
    assert wrong == []


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ROLES)
async def test_each_role_gets_exactly_what_the_matrix_allows(enforce, role):
    user = {"role": role, "permissions": expand_permissions(DEFAULT_ROLE_PERMISSIONS[role])}
    wrong: List[str] = []
    async with Workspace() as ws:
        ws.add_user(f"u-{role}", role)
        headers = ws.token(f"u-{role}")
        for method, path, route in api_routes(ws.app):
            allow = expected(route, method, path, user)
            if allow is None:
                continue
            resp = await ws.client.request(method, fill(path, _values(path)), headers=headers,
                                           json={} if method in ("POST", "PUT", "PATCH") else None)
            if allow and resp.status_code == 403 and (method, path) not in RECORD_RULES:
                wrong.append(f"{method} {path}: allowed by the matrix but 403")
            if not allow and (method, path) in HANDLER_CHECKED and 200 <= resp.status_code < 300:
                wrong.append(f"{method} {path}: denied by the matrix but {resp.status_code}")
            if not allow and (method, path) not in HANDLER_CHECKED and resp.status_code != 403:
                wrong.append(f"{method} {path}: denied by the matrix but {resp.status_code}")
    assert wrong == []


# ── Reviewed snapshot: who may use each route ───────────────────────────────

SNAPSHOT = __import__("pathlib").Path(__file__).parent / "snapshots" / "route_permissions.json"


def describe(route: Any, method: str, path: str) -> str:
    """What a route requires, in words: 'public', 'signed in', a permission, 'company admin', 'super admin'..."""
    if (method, path) in PUBLIC:
        return "public"
    if (method, path) in HANDLER_CHECKED:
        rule = HANDLER_CHECKED[(method, path)]
        return {"_platform_only": "super admin (in handler)", "_own_company_admin": "company admin (in handler)"}.get(
            getattr(rule, "__name__", ""), "signed in (handler filters)")
    parts: List[str] = []
    for call in dependency_calls(route.dependant):
        name = getattr(call, "__qualname__", "")
        if name == "require_access.<locals>.access_checker":
            v = inspect.getclosurevars(call).nonlocals
            parts.append(v["overrides"].get((method, path)) or f"{v['module']}:{deps._METHOD_ACTION.get(method, 'view')}")
        elif name == "require_can.<locals>.checker":
            parts.append(inspect.getclosurevars(call).nonlocals["permission"])
        elif name == "require_permission.<locals>.permission_checker":
            parts.append(inspect.getclosurevars(call).nonlocals["required_perm"])
        elif call is deps.require_company_admin:
            parts.append("company admin")
        elif call is deps.require_superadmin:
            parts.append("super admin")
        elif name == "require_settings_admin":
            parts.append("settings admin")
    text = " + ".join(dict.fromkeys(parts)) or "signed in"
    return text + (" (per record)" if (method, path) in RECORD_RULES else "")


@pytest.mark.asyncio
async def test_route_permissions_match_the_reviewed_snapshot():
    """
    tests/snapshots/route_permissions.json lists who may use every route. A change in who may use a route
    (or a new route) shows as a diff in the pull request. After reviewing it, regenerate with:
        UPDATE_PERMISSION_SNAPSHOT=1 pytest tests/test_permission_suite.py
    """
    import json, os
    async with Workspace() as ws:
        current = {f"{m} {p}": describe(r, m, p) for m, p, r in api_routes(ws.app)}
    if os.environ.get("UPDATE_PERMISSION_SNAPSHOT"):
        SNAPSHOT.parent.mkdir(exist_ok=True)
        SNAPSHOT.write_text(json.dumps(current, indent=1, sort_keys=True) + "\n")
    reviewed = json.loads(SNAPSHOT.read_text())
    changed = {k: (reviewed.get(k), v) for k, v in current.items() if reviewed.get(k) != v}
    removed = sorted(set(reviewed) - set(current))
    assert changed == {} and removed == [], "route permissions changed: review, then regenerate the snapshot"
