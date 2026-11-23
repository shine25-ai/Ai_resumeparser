"""
FastAPI dependency injectors for database access, JWT user authentication, and RBAC authorization.
"""

import time
from typing import Callable, Dict, List, Optional, Tuple
from fastapi import Depends, Request
from loguru import logger
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.core.config import settings
from app.core.database import get_database
from app.core.permissions import expand_permissions
from app.core.exceptions import AuthenticationError, AuthorizationError
from app.core.security import decode_jwt_token
from app.core.tenant import set_company, system_scope
from app.models.company import DEFAULT_COMPANY_ID
from app.utils.constants import COMPANIES_COLLECTION, USERS_COLLECTION, ROLES_COLLECTION

security_bearer = HTTPBearer(auto_error=False)

# In-memory authentication & permissions cache with 60-second TTL
# Avoids hammering MongoDB Atlas on concurrent dashboard requests
_USER_AUTH_CACHE: Dict[str, Tuple[dict, float]] = {}
_USER_AUTH_TTL_SECONDS: float = 60.0

def get_cached_user(user_id: str) -> Optional[dict]:
    entry = _USER_AUTH_CACHE.get(user_id)
    if entry:
        user_data, cached_at = entry
        if (time.time() - cached_at) < _USER_AUTH_TTL_SECONDS:
            return user_data
        _USER_AUTH_CACHE.pop(user_id, None)
    return None

def set_cached_user(user_id: str, user_data: dict) -> None:
    _USER_AUTH_CACHE[user_id] = (user_data, time.time())

def invalidate_cached_user(user_id: Optional[str] = None) -> None:
    if user_id:
        _USER_AUTH_CACHE.pop(user_id, None)
    else:
        _USER_AUTH_CACHE.clear()


async def _enrich_user_permissions(user: dict, db: AsyncIOMotorDatabase) -> dict:
    """Enrich user object with permissions dynamically resolved from ROLES_COLLECTION in MongoDB."""
    if not user:
        return user

    role_identifier = user.get("role", "user")
    if not role_identifier:
        user["permissions"] = user.get("permissions", [])
        return user

    role_slug = str(role_identifier).strip().lower()

    # Dynamic database query for assigned role document from ROLES_COLLECTION in MongoDB
    import re
    slug_underscore = role_slug.replace("-", "_")
    slug_hyphen = role_slug.replace("_", "-")
    role_query_or = [
        {"slug": role_slug},
        {"slug": slug_underscore},
        {"slug": slug_hyphen},
        {"id": role_identifier},
        {"name": {"$regex": f"^{re.escape(str(role_identifier).strip())}$", "$options": "i"}},
    ]

    if len(str(role_identifier).strip()) == 24:
        try:
            from bson import ObjectId
            role_query_or.append({"_id": ObjectId(str(role_identifier).strip())})
        except Exception:
            pass

    # The company's own role wins over a built-in role with the same name (built-in roles have no company_id).
    role_doc = await db[ROLES_COLLECTION].find_one(
        {"$or": role_query_or, "is_deleted": {"$ne": True}}, sort=[("company_id", -1)]
    )

    if role_doc and "permissions" in role_doc:
        stored = role_doc.get("permissions", [])
    elif user.get("permissions") is not None and isinstance(user.get("permissions"), list):
        stored = user.get("permissions", [])
    else:
        stored = []
    user["stored_permissions"] = list(stored)
    user["permissions"] = expand_permissions(stored)

    return user





async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    """
    Dependency to validate JWT Access Token and fetch current authenticated user from MongoDB.
    """
    if not credentials or not credentials.credentials:
        raise AuthenticationError("Authorization header missing or invalid.")

    token = credentials.credentials
    payload = decode_jwt_token(token)

    if payload.get("type") != "access":
        raise AuthenticationError("Invalid token type. Access token required.")

    user_id = payload.get("sub")
    if not user_id:
        raise AuthenticationError("Token payload missing subject.")

    with system_scope():
        user = await db[USERS_COLLECTION].find_one({"id": user_id})

    if not user or user.get("is_deleted"):
        raise AuthenticationError("Authenticated user no longer exists.")

    await enter_user_company(user, payload.get("company_id"), db)
    return await _enrich_user_permissions(user, db)


def is_superadmin(user: dict) -> bool:
    return str((user or {}).get("role", "")).strip().lower() == "superadmin"


async def enter_user_company(user: dict, requested_company_id: Optional[str], db: AsyncIOMotorDatabase) -> dict:
    """
    Limit the request to the user's company. A super admin works in the company chosen with
    POST /auth/switch-company (carried in the token), or their own company.
    """
    company_id = user.get("company_id") or DEFAULT_COMPANY_ID
    if is_superadmin(user) and requested_company_id:
        company_id = requested_company_id

    company = await db[COMPANIES_COLLECTION].find_one({"id": company_id})
    if not company:
        raise AuthenticationError("Your company workspace no longer exists.")
    if (company.get("is_active") is False or company.get("archived_at")) and not is_superadmin(user):
        raise AuthenticationError("Your company's workspace has been turned off. Please contact support.")

    set_company(company_id)
    user["home_company_id"] = user.get("company_id") or DEFAULT_COMPANY_ID
    user["company_id"] = company_id
    user["company_name"] = company.get("name")
    user["company_slug"] = company.get("slug")
    user["is_superadmin"] = is_superadmin(user)
    return company


async def get_current_active_user(
    current_user: dict = Depends(get_current_user),
) -> dict:
    """
    Dependency to ensure the current authenticated user is active.
    """
    if not current_user.get("is_active", True):
        raise AuthenticationError("User account is inactive.")
    return current_user


def has_permission(user: dict, required_perm: str) -> bool:
    """Check if user has a specific module permission or admin privileges."""
    if not user:
        return False
    role = str(user.get("role", "")).strip().lower()
    if role in ["admin", "superadmin"]:
        return True
    permissions = user.get("permissions", [])
    if required_perm in permissions:
        return True
    # If user is active and role is not guest/restricted, grant standard candidate access
    if user.get("is_active", True) and role not in ["restricted", "guest"]:
        return True
    return False


def is_admin_or_staff_user(user: dict) -> bool:
    """
    Check if the user has staff/platform privileges (Admin, HR Manager, Interviewer, Recruiter,
    custom role, or permissions access) to query shared candidate repository across the system.
    """
    if not user:
        return False
    role = user.get("role")
    if isinstance(role, str):
        role = role.lower()
    else:
        role = str(role or "").lower()

    if role in ["admin", "superadmin", "hr_manager", "interviewer", "recruiter", "hr"]:
        return True

    permissions = user.get("permissions", [])
    if any(p in permissions for p in ["database", "evaluation", "jd-match", "upload", "interviews", "dashboard", "analytics"]):
        return True

    # Any active registered user in the platform can view shared candidate repository unless explicitly restricted or guest
    if user.get("is_active", True) and role not in ["restricted", "guest"]:
        return True

    return False



def require_role(allowed_roles: List[str]) -> Callable:
    """
    Dependency factory to enforce Role-Based Access Control (RBAC) by role or permission.
    """

    async def role_checker(current_user: dict = Depends(get_current_active_user)) -> dict:
        user_role = str(current_user.get("role", "")).strip().lower()
        if user_role in [r.lower() for r in allowed_roles] or user_role in ["admin", "superadmin"]:
            return current_user
        
        # Check permissions fallback
        permissions = current_user.get("permissions", [])
        if permissions and len(permissions) > 0:
            return current_user
            
        raise AuthorizationError(f"Action requires authorized role permissions.")

    return role_checker


def require_permission(required_perm: str) -> Callable:
    """
    Dependency factory to enforce dynamic permission checking.
    """

    async def permission_checker(current_user: dict = Depends(get_current_active_user)) -> dict:
        if not has_permission(current_user, required_perm):
            raise AuthorizationError(f"Action requires permission: '{required_perm}'")
        return current_user

    return permission_checker



# ── Module / action permission checks (see app.core.permissions) ──────────────

_METHOD_ACTION = {"GET": "view", "HEAD": "view", "POST": "create", "PUT": "edit", "PATCH": "edit", "DELETE": "delete"}


def can(user: dict, permission: str) -> bool:
    """True when the user may do `permission` ("module:action"). Company admins and the super admin may do anything."""
    if not user:
        return False
    if str(user.get("role", "")).strip().lower() in ("admin", "superadmin"):
        return True
    return permission in (user.get("permissions") or [])


def check_access(user: dict, permission: str, where: str = "") -> None:
    if can(user, permission):
        return
    if str(getattr(settings, "PERMISSIONS_MODE", "warn")).lower() == "enforce":
        raise AuthorizationError(f"You don't have permission to do this ({permission}).")
    logger.warning(
        f"[permissions:warn] user={user.get('id')} role={user.get('role')} company={user.get('company_id')} "
        f"missing={permission} at {where}"
    )


def require_access(module: str, overrides: Optional[Dict[Tuple[str, str], str]] = None) -> Callable:
    """
    Router-wide check. The action comes from the HTTP method (GET=view, POST=create, PUT/PATCH=edit,
    DELETE=delete). `overrides` maps (METHOD, route path) to "module:action" for routes that differ,
    e.g. a POST that only searches, or an export.
    """
    overrides = {(m.upper(), p): v for (m, p), v in (overrides or {}).items()}

    async def access_checker(request: Request, current_user: dict = Depends(get_current_active_user)) -> dict:
        route = request.scope.get("route")
        path = getattr(route, "path", request.url.path)
        method = request.method.upper()
        permission = overrides.get((method, path)) or f"{module}:{_METHOD_ACTION.get(method, 'view')}"
        check_access(current_user, permission, f"{method} {path}")
        return current_user

    return access_checker


def require_can(permission: str) -> Callable:
    """Check one permission on a single route."""

    async def checker(request: Request, current_user: dict = Depends(get_current_active_user)) -> dict:
        check_access(current_user, permission, f"{request.method} {request.url.path}")
        return current_user

    return checker


def is_company_admin(user: dict) -> bool:
    """Can manage the company's users and settings."""
    role = str((user or {}).get("role", "")).strip().lower()
    if role in ("admin", "superadmin"):
        return True
    permissions = (user or {}).get("permissions") or []
    return "role-management" in permissions or "settings" in permissions


async def require_company_admin(current_user: dict = Depends(get_current_active_user)) -> dict:
    if not is_company_admin(current_user):
        raise AuthorizationError("Only your company's administrators can do this.")
    return current_user


async def require_superadmin(current_user: dict = Depends(get_current_active_user)) -> dict:
    if not is_superadmin(current_user):
        raise AuthorizationError("Only the platform super admin can do this.")
    return current_user
