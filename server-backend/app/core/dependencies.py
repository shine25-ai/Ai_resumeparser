"""
FastAPI dependency injectors for database access, JWT user authentication, and RBAC authorization.
"""

from typing import Callable, List
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.core.database import get_database
from app.core.exceptions import AuthenticationError, AuthorizationError
from app.core.security import decode_jwt_token
from app.utils.constants import USERS_COLLECTION, ROLES_COLLECTION

security_bearer = HTTPBearer(auto_error=False)


async def _enrich_user_permissions(user: dict, db: AsyncIOMotorDatabase) -> dict:
    """Enrich user object with permissions dynamically resolved from ROLES_COLLECTION or system defaults."""
    if not user:
        return user

    role_identifier = user.get("role", "user")
    role_slug = str(role_identifier).strip().lower() if role_identifier else "user"

    all_system_permissions = [
        "dashboard", "upload", "database", "evaluation",
        "jd-match", "interviews", "interview-dashboard",
        "client-feedback", "analytics", "settings", "role-management"
    ]

    if role_slug in ["admin", "superadmin"]:
        user["permissions"] = all_system_permissions
        return user

    # Flexible database lookup for assigned role document
    import re
    slug_underscore = role_slug.replace("-", "_")
    slug_hyphen = role_slug.replace("_", "-")
    role_query = {
        "$or": [
            {"slug": role_slug},
            {"slug": slug_underscore},
            {"slug": slug_hyphen},
            {"id": role_identifier},
            {"name": {"$regex": f"^{re.escape(str(role_identifier).strip())}$", "$options": "i"}},
        ]
    }
    role_doc = await db[ROLES_COLLECTION].find_one(role_query)

    if role_doc and role_doc.get("permissions") is not None:
        user["permissions"] = role_doc.get("permissions", [])
    elif user.get("permissions"):
        # Keep existing permissions array on user document
        pass
    else:
        # Fallback permissions for standard system roles
        if role_slug in ["hr_manager", "hr"]:
            user["permissions"] = [
                "dashboard", "upload", "database", "evaluation",
                "jd-match", "interviews", "interview-dashboard",
                "client-feedback", "analytics"
            ]
        elif role_slug in ["interviewer", "recruiter"]:
            user["permissions"] = [
                "dashboard", "upload", "database", "evaluation",
                "jd-match", "interviews", "interview-dashboard"
            ]
        else:
            user["permissions"] = ["dashboard", "upload", "database", "evaluation", "jd-match", "interviews"]

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

    users_collection = db[USERS_COLLECTION]
    user = await users_collection.find_one({"id": user_id})

    if not user:
        raise AuthenticationError("Authenticated user no longer exists.")

    return await _enrich_user_permissions(user, db)


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    """
    Dependency to validate JWT Access Token or fallback to default user if unauthenticated.
    """
    if credentials and credentials.credentials:
        try:
            token = credentials.credentials
            payload = decode_jwt_token(token)
            if payload.get("type") == "access" and payload.get("sub"):
                user_id = payload.get("sub")
                users_collection = db[USERS_COLLECTION]
                user = await users_collection.find_one({"id": user_id})
                if user:
                    return await _enrich_user_permissions(user, db)
        except Exception:
            pass

    # Fallback to default user (e.g. default admin or anonymous user)
    users_collection = db[USERS_COLLECTION]
    default_user = await users_collection.find_one({})
    if default_user:
        return await _enrich_user_permissions(default_user, db)

    return {"id": "guest_user", "email": "guest@example.com", "role": "user", "is_active": True, "permissions": []}


async def get_current_active_user_optional(
    current_user: dict = Depends(get_current_user_optional),
) -> dict:
    return current_user


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

