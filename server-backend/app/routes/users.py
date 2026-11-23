"""
User management routes for accessing profile details, creating users, updating profiles/roles, deleting users, and user listings.
"""

from fastapi import APIRouter, Depends, Request, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.controllers.user_controller import UserController
from app.core.database import get_database
from app.services.audit_service import record_audit
from app.core.dependencies import get_current_active_user, require_company_admin
from app.repositories.role_repository import RoleRepository
from app.repositories.user_repository import UserRepository
from app.schemas.user import UserCreate, UserRoleUpdate, UserUpdate
from app.services.user_service import UserService

router = APIRouter(prefix="/api/v1/users", tags=["Users"])


def get_user_controller(db: AsyncIOMotorDatabase = Depends(get_database)) -> UserController:
    """Dependency injector for UserController with RoleRepository integration."""
    user_repo = UserRepository(db)
    role_repo = RoleRepository(db)
    user_service = UserService(user_repo, role_repo)
    return UserController(user_service)


@router.get(
    "/me",
    status_code=status.HTTP_200_OK,
    summary="Get current user profile",
    description="Retrieve profile information and permissions of currently authenticated user.",
)
async def get_me(
    current_user: dict = Depends(get_current_active_user),
    controller: UserController = Depends(get_user_controller),
):
    return await controller.get_me(current_user)


@router.put(
    "/me",
    status_code=status.HTTP_200_OK,
    summary="Update current user profile",
    description="Update profile details for currently authenticated user.",
)
async def update_me(
    payload: UserUpdate,
    current_user: dict = Depends(get_current_active_user),
    controller: UserController = Depends(get_user_controller),
):
    return await controller.update_me(current_user, payload)


@router.get("/stats", status_code=status.HTTP_200_OK, summary="User summary cards: totals, pending invitations, users per role and department")
async def user_stats(
    current_user: dict = Depends(get_current_active_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    from app.services.invitation_service import INVITATIONS_COLLECTION
    from app.utils.helpers import utc_now
    from app.utils.response import success_response

    users = await db["users"].find({"is_deleted": {"$ne": True}}, {"_id": 0, "role": 1, "is_active": 1, "department": 1}).to_list(length=None)
    roles = await RoleRepository(db).find_active_roles(skip=0, limit=500)
    names = {r["slug"]: r["name"] for r in roles}
    by_role: dict = {}
    by_department: dict = {}
    for u in users:
        by_role[u.get("role") or "user"] = by_role.get(u.get("role") or "user", 0) + 1
        dept = u.get("department") or ""
        by_department[dept] = by_department.get(dept, 0) + 1
    pending = await db[INVITATIONS_COLLECTION].count_documents({"status": "pending", "expires_at": {"$gt": utc_now().isoformat()}})
    active = sum(1 for u in users if u.get("is_active", True))
    return success_response(data={
        "total": len(users),
        "active": active,
        "inactive": len(users) - active,
        "pending_invites": pending,
        "by_role": sorted(({"role": k, "label": names.get(k, k.replace("_", " ").title()), "count": v} for k, v in by_role.items()),
                          key=lambda r: -r["count"]),
        "by_department": sorted(({"department": k or "No department", "count": v} for k, v in by_department.items()),
                                key=lambda r: -r["count"]),
    }, message="User stats retrieved.")


@router.get(
    "",
    status_code=status.HTTP_200_OK,
    summary="List all users",
    description="Retrieve paginated list of registered users.",
)
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: dict = Depends(get_current_active_user),
    controller: UserController = Depends(get_user_controller),
):
    return await controller.list_users(skip=skip, limit=limit)


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="Create user account (Admin)",
    description="Create a new user account with specified details and role.",
)
async def create_user(
    request: Request,
    payload: UserCreate,
    admin_user: dict = Depends(require_company_admin),
    controller: UserController = Depends(get_user_controller),
    audit_db: AsyncIOMotorDatabase = Depends(get_database),
):
    result = await controller.create_user(payload, admin_user)
    await record_audit(audit_db, admin_user, "user.created", "user", "", payload.email, {"role": {"from": None, "to": payload.role}}, request=request)
    return result


@router.get(
    "/{user_id}",
    status_code=status.HTTP_200_OK,
    summary="Get user profile by ID",
    description="Retrieve profile details for a specific user ID.",
)
async def get_user_by_id(
    user_id: str,
    current_user: dict = Depends(get_current_active_user),
    controller: UserController = Depends(get_user_controller),
):
    return await controller.get_user_by_id(user_id)


@router.put(
    "/{user_id}",
    status_code=status.HTTP_200_OK,
    summary="Update user details (Admin)",
    description="Update user profile, status, role, or password by user ID.",
)
async def update_user(
    request: Request,
    user_id: str,
    payload: UserUpdate,
    admin_user: dict = Depends(require_company_admin),
    controller: UserController = Depends(get_user_controller),
    audit_db: AsyncIOMotorDatabase = Depends(get_database),
):
    result = await controller.update_user(user_id, payload, admin_user)
    await record_audit(audit_db, admin_user, "user.updated", "user", user_id, "", {k: {"to": ("***" if k == "password" else v)} for k, v in payload.model_dump(exclude_unset=True).items()}, request=request)
    return result


@router.put(
    "/{user_id}/role",
    status_code=status.HTTP_200_OK,
    summary="Update user role (Admin)",
    description="Assign a specific role to a user by ID.",
)
async def update_user_role(
    request: Request,
    user_id: str,
    payload: UserRoleUpdate,
    admin_user: dict = Depends(require_company_admin),
    controller: UserController = Depends(get_user_controller),
    audit_db: AsyncIOMotorDatabase = Depends(get_database),
):
    result = await controller.update_user_role(user_id, payload.role, admin_user)
    await record_audit(audit_db, admin_user, "user.role_changed", "user", user_id, "", {"role": {"to": payload.role}}, request=request)
    return result


@router.delete(
    "/{user_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete user account (Admin)",
    description="Delete a user account by ID.",
)
async def delete_user(
    request: Request,
    user_id: str,
    admin_user: dict = Depends(require_company_admin),
    controller: UserController = Depends(get_user_controller),
    audit_db: AsyncIOMotorDatabase = Depends(get_database),
):
    result = await controller.delete_user(user_id, admin_user)
    await record_audit(audit_db, admin_user, "user.deleted", "user", user_id, request=request)
    return result
