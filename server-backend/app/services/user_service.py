"""
User management service handling user profile operations, CRUD management, role assignments, and admin user listings.
"""

from typing import Any, Dict, List, Optional
from app.core.exceptions import AuthorizationError, BadRequestError, ConflictError, NotFoundError
from app.core.tenant import current_company_id, system_scope
from app.models.company import email_allowed
from app.core.security import hash_password
from app.models.user import UserDocument
from app.repositories.role_repository import RoleRepository
from app.repositories.user_repository import UserRepository
from app.schemas.user import UserCreate, UserResponse, UserUpdate
from app.utils.constants import COMPANIES_COLLECTION
from app.utils.helpers import utc_now

SUPERADMIN = "superadmin"


def _is_super(user: Optional[Dict[str, Any]]) -> bool:
    return str((user or {}).get("role", "")).strip().lower() == SUPERADMIN


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



    async def _check_email(self, email: str, company_id: Optional[str] = None) -> None:
        """Users must have an email at one of the company's domains, when it lists any."""
        company_id = company_id or current_company_id()
        if not company_id:
            return
        company = await self.user_repo.db[COMPANIES_COLLECTION].find_one({"id": company_id})
        if not email_allowed(company, email):
            domains = ", ".join("@" + d for d in company.get("email_domains") or [])
            raise BadRequestError(f"{company.get('name', 'This company')} only allows email addresses at {domains}.")

    @staticmethod
    def _check_role_change(actor: Optional[Dict[str, Any]], role: Optional[str]) -> None:
        if role and role.strip().lower() == SUPERADMIN and not _is_super(actor):
            raise AuthorizationError("Only the platform super admin can give the super admin role.")

    @staticmethod
    def _check_target(actor: Optional[Dict[str, Any]], target: Dict[str, Any]) -> None:
        if _is_super(target) and not _is_super(actor):
            raise AuthorizationError("The platform super admin's account can only be changed by a super admin.")

    async def create_user(self, payload: UserCreate, actor: Optional[Dict[str, Any]] = None) -> UserResponse:
        """Create a new user document in the current company (Admin operation)."""
        email = payload.email.strip().lower()
        existing = await self.user_repo.get_by_email(email)
        if existing:
            raise ConflictError(f"User with email '{payload.email}' already exists.")
        self._check_role_change(actor, payload.role)
        await self._check_email(email)

        user_doc = UserDocument(
            full_name=payload.full_name.strip(),
            email=email,
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

    async def get_me(self, current_user: Dict[str, Any]) -> UserResponse:
        """The signed-in user, with the company they are working in (a super admin may be in another)."""
        with system_scope():
            user = await self.user_repo.get_by_id(current_user["id"])
        if not user:
            raise NotFoundError("User profile not found.")
        enriched = await self._attach_role_permissions(user)
        enriched.update(
            company_id=current_user.get("company_id"),
            company_name=current_user.get("company_name"),
            is_superadmin=_is_super(user),
        )
        return UserResponse.model_validate(enriched)

    async def update_me(self, current_user: Dict[str, Any], payload: UserUpdate) -> UserResponse:
        """Users can change their own name, email and password, not their role or status."""
        update_dict = payload.model_dump(exclude_unset=True, include={"full_name", "email", "password"})
        with system_scope():
            user = await self.user_repo.get_by_id(current_user["id"])
            if not user:
                raise NotFoundError("User profile not found.")
            if update_dict.get("email"):
                update_dict["email"] = update_dict["email"].strip().lower()
                other = await self.user_repo.get_by_email(update_dict["email"])
                if other and other["id"] != user["id"]:
                    raise ConflictError(f"User with email '{update_dict['email']}' already exists.")
                await self._check_email(update_dict["email"], user.get("company_id"))
            if update_dict.get("password"):
                update_dict["password"] = hash_password(update_dict["password"])
            else:
                update_dict.pop("password", None)
            if update_dict:
                update_dict["updated_at"] = utc_now().isoformat()
                user = await self.user_repo.update(user["id"], update_dict)
        return await self.get_me({**current_user, "id": user["id"]})

    async def update_user_profile(self, user_id: str, payload: UserUpdate, actor: Optional[Dict[str, Any]] = None) -> UserResponse:
        """Update profile fields for specified user in the current company."""
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User profile not found.")
        self._check_target(actor, user)

        update_dict = payload.model_dump(exclude_unset=True)
        if not update_dict:
            enriched = await self._attach_role_permissions(user)
            return UserResponse.model_validate(enriched)
        self._check_role_change(actor, update_dict.get("role"))

        if "password" in update_dict and update_dict["password"]:
            update_dict["password"] = hash_password(update_dict["password"])
        elif "password" in update_dict:
            update_dict.pop("password")

        if "email" in update_dict and update_dict["email"]:
            update_dict["email"] = update_dict["email"].strip().lower()
            other = await self.user_repo.get_by_email(update_dict["email"])
            if other and other["id"] != user_id:
                raise ConflictError(f"User with email '{update_dict['email']}' already exists.")
            await self._check_email(update_dict["email"])

        update_dict["updated_at"] = utc_now().isoformat()
        updated_user = await self.user_repo.update(user_id, update_dict)
        enriched = await self._attach_role_permissions(updated_user)
        return UserResponse.model_validate(enriched)

    async def update_user_role(self, user_id: str, role: str, actor: Optional[Dict[str, Any]] = None) -> UserResponse:
        """Update role for specified user (Admin operation)."""
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User profile not found.")
        self._check_target(actor, user)
        self._check_role_change(actor, role)

        update_dict = {"role": role, "updated_at": utc_now().isoformat()}
        updated_user = await self.user_repo.update(user_id, update_dict)
        enriched = await self._attach_role_permissions(updated_user)
        return UserResponse.model_validate(enriched)

    async def list_all_users(self, skip: int = 0, limit: int = 100) -> List[UserResponse]:
        """Fetch paginated list of all active registered users (excluding soft-deleted)."""
        users = await self.user_repo.find_active_users(skip=skip, limit=limit)
        result = []
        for u in users:
            enriched = await self._attach_role_permissions(u)
            result.append(UserResponse.model_validate(enriched))
        return result

    async def delete_user(self, user_id: str, actor: Optional[Dict[str, Any]] = None) -> bool:
        """Soft delete user account by ID. Administrator account cannot be deleted."""
        user = await self.user_repo.get_by_id(user_id)
        if not user or user.get("is_deleted", False):
            raise NotFoundError("User profile not found.")
        self._check_target(actor, user)

        role_lower = str(user.get("role", "")).lower()
        email_lower = str(user.get("email", "")).lower()
        name_lower = str(user.get("full_name", "")).lower()
        if role_lower in ["admin", "administrator", "superadmin"] or email_lower in ["admin@gmail.com", "admin@company.com", "administrator@gmail.com"] or "administrator" in name_lower or name_lower == "admin":
            raise BadRequestError("Administrator account cannot be deleted.")

        return await self.user_repo.soft_delete(user_id)
