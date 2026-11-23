"""
Role management service handling role CRUD operations and access privileges.
"""

from typing import List
import re
from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.role import RoleDocument
from app.repositories.role_repository import RoleRepository
from app.schemas.role import RoleCreate, RoleResponse, RoleUpdate
from app.utils.helpers import utc_now
from app.core.permissions import clean_permissions



SUPERADMIN_SLUG = "superadmin"


def _is_superadmin_role(role: dict) -> bool:
    return str(role.get("slug", "")).strip().lower() == SUPERADMIN_SLUG

class RoleService:
    """Service handling role management operations."""

    def __init__(self, role_repo: RoleRepository):
        self.role_repo = role_repo

    def _generate_slug(self, name: str) -> str:
        """Generate URL-friendly and consistent slug from role name."""
        slug = re.sub(r"[^\w\s-]", "", name.lower()).strip()
        return re.sub(r"[-\s]+", "_", slug)

    async def create_role(self, payload: RoleCreate) -> RoleResponse:
        """Create a new custom role."""
        raw_slug = payload.slug.strip() if payload.slug else payload.name
        slug = self._generate_slug(raw_slug)
        existing = await self.role_repo.get_by_slug(slug)
        if existing:
            raise ConflictError(f"Role with slug '{slug}' already exists.")


        role_doc = RoleDocument(
            name=payload.name.strip(),
            slug=slug,
            description=payload.description or "",
            permissions=clean_permissions(payload.permissions),
            is_system=False,
        )

        created = await self.role_repo.create(role_doc.to_dict())
        return RoleResponse.model_validate(created)

    async def get_role(self, role_id: str, include_superadmin: bool = False) -> RoleResponse:
        """Retrieve role details by ID. The super admin role is visible only to the super admin."""
        role = await self.role_repo.get_by_id(role_id)
        if not role or (not include_superadmin and _is_superadmin_role(role)):
            raise NotFoundError("Role not found.")
        return RoleResponse.model_validate(role)

    async def list_roles(self, skip: int = 0, limit: int = 100, include_superadmin: bool = False) -> List[RoleResponse]:
        """
        Active system and custom roles (excluding soft-deleted). The super admin role is listed only for the
        super admin, so company admins never see it as an option.
        """
        roles = await self.role_repo.find_active_roles(skip=skip, limit=limit)
        return [RoleResponse.model_validate(r) for r in roles if include_superadmin or not _is_superadmin_role(r)]

    async def update_role(self, role_id: str, payload: RoleUpdate) -> RoleResponse:
        """Update fields for specified role."""
        role = await self.role_repo.get_by_id(role_id)
        if not role or role.get("is_deleted", False):
            raise NotFoundError("Role not found.")
        if not role.get("company_id"):
            from app.core.exceptions import BadRequestError
            raise BadRequestError("Built-in roles are shared by every company and cannot be changed. Create a new role instead.")

        update_dict = payload.model_dump(exclude_unset=True)
        if not update_dict:
            return RoleResponse.model_validate(role)

        if "name" in update_dict and update_dict["name"]:
            update_dict["name"] = update_dict["name"].strip()
        if "permissions" in update_dict and update_dict["permissions"] is not None:
            update_dict["permissions"] = clean_permissions(update_dict["permissions"])

        update_dict["updated_at"] = utc_now().isoformat()
        updated_role = await self.role_repo.update(role_id, update_dict)
        return RoleResponse.model_validate(updated_role)

    async def delete_role(self, role_id: str) -> bool:
        """Soft delete role by ID. Administrator and system roles cannot be deleted."""
        role = await self.role_repo.get_by_id(role_id)
        if not role or role.get("is_deleted", False):
            raise NotFoundError("Role not found.")

        slug_lower = str(role.get("slug", "")).lower()
        name_lower = str(role.get("name", "")).lower()
        if role.get("is_system", False) or slug_lower in ["admin", "administrator", "superadmin"] or name_lower in ["administrator", "admin"]:
            raise BadRequestError("Administrator role cannot be deleted.")

        return await self.role_repo.soft_delete(role_id)
