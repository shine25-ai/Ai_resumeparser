"""
User management service handling user profile operations, CRUD management, role assignments, and admin user listings.
"""

from typing import Any, Dict, List, Optional
from app.core.exceptions import ConflictError, NotFoundError
from app.core.security import hash_password
from app.models.user import UserDocument
from app.repositories.role_repository import RoleRepository
from app.repositories.user_repository import UserRepository
from app.schemas.user import UserCreate, UserResponse, UserUpdate
from app.utils.helpers import utc_now


class UserService:
    """Service handling user profile management operations."""

    def __init__(self, user_repo: UserRepository, role_repo: Optional[RoleRepository] = None):
        self.user_repo = user_repo
        self.role_repo = role_repo

    async def _attach_role_permissions(self, user_dict: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Enrich user document with permissions derived strictly from ROLES_COLLECTION in MongoDB."""
        if not user_dict:
            return {}

        role_identifier = str(user_dict.get("role", "user")).strip().lower()
        permissions = []

        if self.role_repo:
            role_doc = await self.role_repo.get_by_slug(role_identifier)
            if role_doc and "permissions" in role_doc:
                permissions = role_doc.get("permissions", [])

        if not permissions and user_dict.get("permissions"):
            permissions = user_dict.get("permissions", [])

        user_dict_copy = dict(user_dict)
        user_dict_copy["permissions"] = permissions
        return user_dict_copy



    async def create_user(self, payload: UserCreate) -> UserResponse:
        """Create a new user document (Admin operation)."""
        existing = await self.user_repo.get_by_email(payload.email)
        if existing:
            raise ConflictError(f"User with email '{payload.email}' already exists.")

        user_doc = UserDocument(
            full_name=payload.full_name.strip(),
            email=payload.email.strip().lower(),
            password=hash_password(payload.password),
            role=payload.role or "user",
            is_active=payload.is_active,
        )

        created = await self.user_repo.create(user_doc.to_dict())
        enriched = await self._attach_role_permissions(created)
        return UserResponse.model_validate(enriched)

    async def get_user_profile(self, user_id: str) -> UserResponse:
        """Get profile details for specified user ID."""
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User profile not found.")
        enriched = await self._attach_role_permissions(user)
        return UserResponse.model_validate(enriched)

    async def update_user_profile(self, user_id: str, payload: UserUpdate) -> UserResponse:
        """Update profile fields for specified user."""
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User profile not found.")

        update_dict = payload.model_dump(exclude_unset=True)
        if not update_dict:
            enriched = await self._attach_role_permissions(user)
            return UserResponse.model_validate(enriched)

        if "password" in update_dict and update_dict["password"]:
            update_dict["password"] = hash_password(update_dict["password"])

        if "email" in update_dict and update_dict["email"]:
            update_dict["email"] = update_dict["email"].strip().lower()

        update_dict["updated_at"] = utc_now().isoformat()
        updated_user = await self.user_repo.update(user_id, update_dict)
        enriched = await self._attach_role_permissions(updated_user)
        return UserResponse.model_validate(enriched)

    async def update_user_role(self, user_id: str, role: str) -> UserResponse:
        """Update role for specified user (Admin operation)."""
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User profile not found.")

        update_dict = {"role": role, "updated_at": utc_now().isoformat()}
        updated_user = await self.user_repo.update(user_id, update_dict)
        enriched = await self._attach_role_permissions(updated_user)
        return UserResponse.model_validate(enriched)

    async def list_all_users(self, skip: int = 0, limit: int = 100) -> List[UserResponse]:
        """Fetch paginated list of all registered users."""
        users = await self.user_repo.find_many(skip=skip, limit=limit, sort_by="created_at", descending=True)
        result = []
        for u in users:
            enriched = await self._attach_role_permissions(u)
            result.append(UserResponse.model_validate(enriched))
        return result

    async def delete_user(self, user_id: str) -> bool:
        """Delete user by ID."""
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User profile not found.")
        return await self.user_repo.delete(user_id)
