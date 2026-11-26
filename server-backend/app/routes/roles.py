"""
Role management routes for retrieving, creating, updating, and deleting application roles.
"""

from fastapi import APIRouter, Depends, Request, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.controllers.role_controller import RoleController
from app.core.database import get_database
from app.services.audit_service import record_audit
from app.core.dependencies import get_current_active_user, require_company_admin, require_role
from app.repositories.role_repository import RoleRepository
from app.schemas.role import RoleCreate, RoleUpdate
from app.services.role_service import RoleService
from app.utils.enums import UserRole
from app.core.permissions import matrix_payload
from app.utils.response import success_response

router = APIRouter(prefix="/api/v1/roles", tags=["Roles"])


def get_role_controller(db: AsyncIOMotorDatabase = Depends(get_database)) -> RoleController:
    """Dependency injector for RoleController."""
    role_repo = RoleRepository(db)
    role_service = RoleService(role_repo)
    return RoleController(role_service)


@router.get(
    "",
    status_code=status.HTTP_200_OK,
    summary="List all application roles",
    description="Retrieve list of all system and custom roles with assigned permissions.",
)
async def list_roles(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: dict = Depends(get_current_active_user),
    controller: RoleController = Depends(get_role_controller),
):
    return await controller.list_roles(skip=skip, limit=limit, include_superadmin=bool(current_user.get("is_superadmin")))


@router.get(
    "/permission-matrix",
    status_code=status.HTTP_200_OK,
    summary="Modules, actions and default roles for the role editor",
)
async def permission_matrix(current_user: dict = Depends(get_current_active_user)):
    return success_response(data=matrix_payload(), message="Permission matrix retrieved.")


@router.get(
    "/{role_id}",
    status_code=status.HTTP_200_OK,
    summary="Get role by ID",
    description="Retrieve detailed information and permissions for a specific role.",
)
async def get_role(
    role_id: str,
    current_user: dict = Depends(get_current_active_user),
    controller: RoleController = Depends(get_role_controller),
):
    return await controller.get_role(role_id, include_superadmin=bool(current_user.get("is_superadmin")))


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="Create custom role (Admin)",
    description="Create a new custom application role with specific access permissions. Requires admin role.",
)
async def create_role(
    request: Request,
    payload: RoleCreate,
    admin_user: dict = Depends(require_company_admin),
    controller: RoleController = Depends(get_role_controller),
    audit_db: AsyncIOMotorDatabase = Depends(get_database),
):
    result = await controller.create_role(payload)
    await record_audit(audit_db, admin_user, "role.created", "role", "", payload.name, {"permissions": {"to": payload.permissions}}, request=request)
    return result


@router.put(
    "/{role_id}",
    status_code=status.HTTP_200_OK,
    summary="Update role permissions/details (Admin)",
    description="Update permissions or metadata of an existing role. Requires admin role.",
)
async def update_role(
    request: Request,
    role_id: str,
    payload: RoleUpdate,
    admin_user: dict = Depends(require_company_admin),
    controller: RoleController = Depends(get_role_controller),
    audit_db: AsyncIOMotorDatabase = Depends(get_database),
):
    result = await controller.update_role(role_id, payload)
    await record_audit(audit_db, admin_user, "role.updated", "role", role_id, payload.name or "", {k: {"to": v} for k, v in payload.model_dump(exclude_unset=True).items()}, request=request)
    return result


@router.delete(
    "/{role_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete custom role (Admin)",
    description="Delete a custom role. System default roles cannot be deleted.",
)
async def delete_role(
    request: Request,
    role_id: str,
    admin_user: dict = Depends(require_company_admin),
    controller: RoleController = Depends(get_role_controller),
    audit_db: AsyncIOMotorDatabase = Depends(get_database),
):
    result = await controller.delete_role(role_id)
    await record_audit(audit_db, admin_user, "role.deleted", "role", role_id, request=request)
    return result
