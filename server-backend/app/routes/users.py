"""
User management routes for accessing profile details, creating users, updating profiles/roles, deleting users, and user listings.
"""

from fastapi import APIRouter, Depends, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.controllers.user_controller import UserController
from app.core.database import get_database
from app.core.dependencies import get_current_active_user
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
    return await controller.update_me(current_user["id"], payload)


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
    payload: UserCreate,
    admin_user: dict = Depends(get_current_active_user),
    controller: UserController = Depends(get_user_controller),
):
    return await controller.create_user(payload)


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
    user_id: str,
    payload: UserUpdate,
    admin_user: dict = Depends(get_current_active_user),
    controller: UserController = Depends(get_user_controller),
):
    return await controller.update_user(user_id, payload)


@router.put(
    "/{user_id}/role",
    status_code=status.HTTP_200_OK,
    summary="Update user role (Admin)",
    description="Assign a specific role to a user by ID.",
)
async def update_user_role(
    user_id: str,
    payload: UserRoleUpdate,
    admin_user: dict = Depends(get_current_active_user),
    controller: UserController = Depends(get_user_controller),
):
    return await controller.update_user_role(user_id, payload.role)


@router.delete(
    "/{user_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete user account (Admin)",
    description="Delete a user account by ID.",
)
async def delete_user(
    user_id: str,
    admin_user: dict = Depends(get_current_active_user),
    controller: UserController = Depends(get_user_controller),
):
    return await controller.delete_user(user_id)
