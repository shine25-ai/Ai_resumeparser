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
    """Enrich user object with permissions resolved from ROLES_COLLECTION or standard role defaults."""
    if not user:
        return user

    role_identifier = user.get("role", "user")
    permissions = user.get("permissions")

    if permissions is None or len(permissions) == 0:
        permissions_list = []
        if role_identifier:
            role_slug = str(role_identifier).strip().lower()
            role_doc = await db[ROLES_COLLECTION].find_one({"slug": role_slug})
            if not role_doc:
                role_doc = await db[ROLES_COLLECTION].find_one({"$or": [{"id": role_identifier}, {"name": role_identifier}]})

            if role_doc and role_doc.get("permissions"):
                permissions_list = role_doc.get("permissions", [])
            elif role_slug in ["admin", "superadmin", "hr_manager", "interviewer", "recruiter", "hr"]:
                permissions_list = [
                    "dashboard", "upload", "database", "evaluation",
                    "jd-match", "interviews", "interview-dashboard",
                    "client-feedback", "analytics", "settings", "role-management"
                ]

        user["permissions"] = permissions_list

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


def require_role(allowed_roles: List[str]) -> Callable:
    """
    Dependency factory to enforce Role-Based Access Control (RBAC).
    """

    async def role_checker(current_user: dict = Depends(get_current_active_user)) -> dict:
        user_role = current_user.get("role")
        if user_role not in allowed_roles:
            raise AuthorizationError(f"Action requires one of the following roles: {', '.join(allowed_roles)}")
        return current_user

    return role_checker
