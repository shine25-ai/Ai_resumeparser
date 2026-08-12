"""
Role controller handling HTTP requests for role viewing, creation, updates, and deletion.
"""

from fastapi.responses import JSONResponse
from app.schemas.role import RoleCreate, RoleUpdate
from app.services.role_service import RoleService
from app.utils.response import success_response


class RoleController:
    """Controller orchestrating role management API endpoints."""

    def __init__(self, role_service: RoleService):
        self.role_service = role_service

    async def list_roles(self, skip: int = 0, limit: int = 100) -> JSONResponse:
        """Return list of all roles."""
        roles = await self.role_service.list_roles(skip=skip, limit=limit)
        role_list = [r.model_dump() for r in roles]
        return success_response(
            data={"total": len(role_list), "roles": role_list},
            message="Roles list retrieved successfully.",
        )

    async def get_role(self, role_id: str) -> JSONResponse:
        """Return single role details by ID."""
        role = await self.role_service.get_role(role_id)
        return success_response(
            data=role.model_dump(),
            message="Role details retrieved successfully.",
        )

    async def create_role(self, payload: RoleCreate) -> JSONResponse:
        """Create a new custom role."""
        role = await self.role_service.create_role(payload)
        return success_response(
            data=role.model_dump(),
            message="Role created successfully.",
            status_code=210, # Or 201
        )

    async def update_role(self, role_id: str, payload: RoleUpdate) -> JSONResponse:
        """Update role permissions or details."""
        role = await self.role_service.update_role(role_id, payload)
        return success_response(
            data=role.model_dump(),
            message="Role updated successfully.",
        )

    async def delete_role(self, role_id: str) -> JSONResponse:
        """Delete role by ID."""
        await self.role_service.delete_role(role_id)
        return success_response(
            data=None,
            message="Role deleted successfully.",
        )
