"""
Permission matrix: what each role may do, by module and action (SRS 4.17).

A permission is "<module>:<action>", e.g. "jobs:publish". Roles store a list of them.

Roles saved before the matrix existed hold page names ("database", "interviews", ...). They keep working:
`expand_permissions` turns each page name into the module permissions it always allowed, and adds the page
names back for every module permission, so the screens (which still check page names) and the API agree.

Enforcement (`require_access`) runs in one of two modes, set by PERMISSIONS_MODE:
  - "warn":    a missing permission is logged, the request goes through (safe roll-out on existing data);
  - "enforce": a missing permission is refused with 403.
Company admins and the super admin are never refused.
"""

from typing import Dict, Iterable, List, Optional, Set

# ── Catalogue ──────────────────────────────────────────────────────────────────

MODULES: Dict[str, Dict[str, object]] = {
    "dashboard":   {"label": "Dashboard",            "actions": ["view"]},
    "jobs":        {"label": "Jobs & Openings",      "actions": ["view", "create", "edit", "delete", "publish", "approve"]},
    "candidates":  {"label": "Candidates",           "actions": ["view", "create", "edit", "delete", "export"]},
    "pipeline":    {"label": "Recruitment Pipeline", "actions": ["view", "edit"]},
    "interviews":  {"label": "Interviews",           "actions": ["view", "create", "edit", "delete"]},
    "evaluations": {"label": "Evaluation & Scores",  "actions": ["view", "create", "edit"]},
    "skills":      {"label": "Skills",               "actions": ["view", "create", "edit", "delete"]},
    "career_page": {"label": "Career Page",          "actions": ["view", "edit", "publish"]},
    "reports":     {"label": "Reports & Analytics",  "actions": ["view", "export"]},
    "users":       {"label": "Company Users",        "actions": ["view", "create", "edit", "delete"]},
    "roles":       {"label": "Roles & Permissions",  "actions": ["view", "create", "edit", "delete"]},
    "settings":    {"label": "Settings",             "actions": ["view", "edit"]},
    "masters":     {"label": "Master Data",          "actions": ["view", "create", "edit", "delete"]},
    "audit_logs":  {"label": "Audit Logs",           "actions": ["view", "export"]},
}

ACTION_LABELS = {
    "view": "View", "create": "Create", "edit": "Edit", "delete": "Delete",
    "publish": "Publish", "approve": "Approve", "export": "Export",
}


def perm(module: str, action: str) -> str:
    return f"{module}:{action}"


ALL_PERMISSIONS: List[str] = [perm(m, a) for m, spec in MODULES.items() for a in spec["actions"]]  # type: ignore[union-attr]
_VALID = frozenset(ALL_PERMISSIONS)


def _all(module: str) -> List[str]:
    return [perm(module, a) for a in MODULES[module]["actions"]]  # type: ignore[union-attr]


def _views(*modules: str) -> List[str]:
    return [perm(m, "view") for m in modules]


# ── Old page permissions → module permissions ──────────────────────────────────

LEGACY_PAGES: Dict[str, List[str]] = {
    "dashboard": ["dashboard:view"],
    "upload": ["candidates:view", "candidates:create"],
    # Before the matrix, anyone who could open the candidate database also managed openings and the pipeline.
    "database": [
        "candidates:view", "candidates:edit", "candidates:delete", "candidates:export",
        "pipeline:view", "pipeline:edit",
        "jobs:view", "jobs:create", "jobs:edit", "jobs:publish",
        "career_page:view", "career_page:edit",
    ],
    "evaluation": [*_all("evaluations"), "candidates:view", "interviews:view"],
    "jd-match": ["candidates:view", "skills:view", "jobs:view"],
    "interviews": [*_all("interviews"), *_all("evaluations"), "candidates:view", "settings:view"],
    "interview-dashboard": [*_all("interviews"), *_all("evaluations"), "candidates:view", "settings:view"],
    "client-feedback": [*_all("interviews"), *_all("evaluations"), "candidates:view", "settings:view"],
    "analytics": ["reports:view", "reports:export"],
    "settings": [*_all("settings"), *_all("skills"), *_all("masters"), *_all("career_page")],
    "role-management": [*_all("users"), *_all("roles"), "audit_logs:view"],
    "companies": [],
}

# Which page each module permission opens (the screens still check these names).
PAGE_FOR: Dict[str, str] = {
    "dashboard:view": "dashboard",
    "candidates:create": "upload",
    "candidates:view": "database",
    "evaluations:view": "evaluation",
    "skills:view": "jd-match",
    "interviews:view": "interviews",
    "reports:view": "analytics",
    "settings:edit": "settings",
    "users:view": "role-management",
    "roles:view": "role-management",
}


def expand_permissions(stored: Optional[Iterable[str]]) -> List[str]:
    """Module permissions plus page names, from a role's stored list (new, old or mixed)."""
    out: Set[str] = set()
    for p in stored or []:
        p = str(p).strip()
        if not p:
            continue
        if p in _VALID:
            out.add(p)
        elif p in LEGACY_PAGES:
            out.add(p)
            out.update(LEGACY_PAGES[p])
    for p in list(out):
        page = PAGE_FOR.get(p)
        if page:
            out.add(page)
    return sorted(out)


def clean_permissions(values: Optional[Iterable[str]]) -> List[str]:
    """For saving a role: keep known module permissions and page names, drop everything else."""
    keep = {str(v).strip() for v in values or []}
    return sorted(p for p in keep if p in _VALID or p in LEGACY_PAGES)


def is_matrix_role(stored: Optional[Iterable[str]]) -> bool:
    return any(":" in str(p) for p in stored or [])


# ── Default roles (SRS Screen 19) ──────────────────────────────────────────────

_EVERYTHING = list(ALL_PERMISSIONS)

DEFAULT_ROLE_PERMISSIONS: Dict[str, List[str]] = {
    "admin": _EVERYTHING,
    "hr_admin": [p for p in _EVERYTHING if p not in ("roles:create", "roles:edit", "roles:delete")],
    "recruiter": [
        "dashboard:view",
        "jobs:view", "jobs:create", "jobs:edit", "jobs:publish",
        "candidates:view", "candidates:create", "candidates:edit", "candidates:export",
        *_all("pipeline"), *_all("interviews"),
        "evaluations:view", "skills:view", "career_page:view", "reports:view", "settings:view", "masters:view",
    ],
    "hiring_manager": [
        "dashboard:view", "jobs:view", "jobs:approve", "candidates:view", *_all("pipeline"),
        "interviews:view", *_all("evaluations"), "skills:view", "reports:view", "masters:view",
    ],
    "interviewer": [
        "dashboard:view", "candidates:view", "interviews:view", *_all("evaluations"), "skills:view", "masters:view",
    ],
    "hr_user": [
        "dashboard:view", "jobs:view", "candidates:view", "candidates:create", "candidates:edit", "pipeline:view",
        "interviews:view", "interviews:create", "interviews:edit", "evaluations:view", "skills:view",
        "settings:view", "masters:view",
    ],
    "viewer": _views("dashboard", "jobs", "candidates", "pipeline", "interviews", "evaluations", "skills",
                     "career_page", "reports", "masters"),
}

DEFAULT_ROLES_INFO = [
    ("admin", "Company Admin", "Full access to the company workspace."),
    ("hr_admin", "HR Admin", "HR, recruitment and user management."),
    ("recruiter", "Recruiter", "Jobs, candidates, the recruitment pipeline and interviews."),
    ("hiring_manager", "Hiring Manager", "Reviews candidates, gives feedback and approves hiring decisions."),
    ("interviewer", "Interviewer", "Sees interviews and submits evaluations."),
    ("hr_user", "HR User", "Limited HR operational access."),
    ("viewer", "Viewer", "Read-only access."),
]


def matrix_payload() -> Dict[str, object]:
    """For the role editor: modules with their actions and labels, and the default roles."""
    return {
        "modules": [
            {"id": m, "label": spec["label"], "actions": spec["actions"]} for m, spec in MODULES.items()
        ],
        "action_labels": ACTION_LABELS,
        "default_roles": [
            {"slug": slug, "name": name, "description": desc, "permissions": DEFAULT_ROLE_PERMISSIONS[slug]}
            for slug, name, desc in DEFAULT_ROLES_INFO
        ],
    }
