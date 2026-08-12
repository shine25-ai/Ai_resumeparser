"""
User controller handling HTTP requests for profile viewing, creation, updating, role changes, deletion, and user listing.
"""

from fastapi.responses import JSONResponse
from app.schemas.user import UserCreate, UserResponse, UserUpdate
from app.services.user_service import UserService
from app.utils.response import success_response


class UserController:
    """Controller orchestrating user management API endpoints."""

    def __init__(self, user_service: UserService):
        self.user_service = user_service

    async def get_me(self, current_user: dict) -> JSONResponse:
        """Return profile information of currently authenticated user with attached permissions."""
        user_response = await self.user_service.get_user_profile(current_user["id"])
        return success_response(
            data=user_response.model_dump(),
            message="User profile retrieved successfully.",
        )

    async def create_user(self, payload: UserCreate) -> JSONResponse:
        """Create a new user account (Admin privilege)."""
        user_response = await self.user_service.create_user(payload)
        return success_response(
            data=user_response.model_dump(),
            message="User created successfully.",
            status_code=201,
        )

    async def get_user_by_id(self, user_id: str) -> JSONResponse:
        """Return single user details by ID."""
        user_response = await self.user_service.get_user_profile(user_id)
        return success_response(
            data=user_response.model_dump(),
            message="User details retrieved successfully.",
        )

    async def update_me(self, user_id: str, payload: UserUpdate) -> JSONResponse:
        """Update authenticated user's profile information."""
        user_response = await self.user_service.update_user_profile(user_id, payload)
        return success_response(
            data=user_response.model_dump(),
            message="User profile updated successfully.",
        )

    async def update_user(self, user_id: str, payload: UserUpdate) -> JSONResponse:
        """Update specified user's profile information (Admin privilege)."""
        user_response = await self.user_service.update_user_profile(user_id, payload)
        return success_response(
            data=user_response.model_dump(),
            message="User updated successfully.",
        )

    async def update_user_role(self, user_id: str, role: str) -> JSONResponse:
        """Update role for specified user (Admin privilege)."""
        user_response = await self.user_service.update_user_role(user_id, role)
        return success_response(
            data=user_response.model_dump(),
            message="User role updated successfully.",
        )

    async def delete_user(self, user_id: str) -> JSONResponse:
        """Delete user account by ID (Admin privilege)."""
        await self.user_service.delete_user(user_id)
        return success_response(
            data=None,
            message="User deleted successfully.",
        )

    async def list_users(self, skip: int = 0, limit: int = 100) -> JSONResponse:
        """Return list of all registered users."""
        users = await self.user_service.list_all_users(skip=skip, limit=limit)
        user_list = [u.model_dump() for u in users]
        return success_response(
            data={"total": len(user_list), "users": user_list},
            message="Users list retrieved successfully.",
        )
