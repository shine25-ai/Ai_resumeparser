"""
Authentication routes for registration, login, logout, token refresh, and password management.
"""

from fastapi import APIRouter, Depends, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field
from app.controllers.auth_controller import AuthController
from app.core.database import get_database
from app.core.dependencies import get_current_active_user
from app.repositories.user_repository import UserRepository
from app.schemas.auth import LoginRequest, RefreshTokenRequest, RegisterRequest
from app.schemas.user import ChangePasswordRequest
from app.services.auth_service import AuthService
from app.utils.response import success_response

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])


def get_auth_controller(db: AsyncIOMotorDatabase = Depends(get_database)) -> AuthController:
    """Dependency injector for AuthController."""
    user_repo = UserRepository(db)
    auth_service = AuthService(user_repo)
    return AuthController(auth_service)


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
    description="Create a new standard user account with email and password.",
)
async def register(
    payload: RegisterRequest,
    controller: AuthController = Depends(get_auth_controller),
):
    return await controller.register(payload)


@router.post(
    "/login",
    status_code=status.HTTP_200_OK,
    summary="User login",
    description="Authenticate email and password credentials to receive JWT Access and Refresh tokens.",
)
async def login(
    payload: LoginRequest,
    controller: AuthController = Depends(get_auth_controller),
):
    return await controller.login(payload)


@router.post(
    "/refresh",
    status_code=status.HTTP_200_OK,
    summary="Refresh access token",
    description="Provide valid JWT Refresh Token to generate a new Access and Refresh Token pair.",
)
async def refresh_token(
    payload: RefreshTokenRequest,
    controller: AuthController = Depends(get_auth_controller),
):
    return await controller.refresh_token(payload)


@router.post(
    "/logout",
    status_code=status.HTTP_200_OK,
    summary="User logout",
    description="Logout currently authenticated session.",
)
async def logout(
    current_user: dict = Depends(get_current_active_user),
    controller: AuthController = Depends(get_auth_controller),
):
    return await controller.logout()


@router.post(
    "/change-password",
    status_code=status.HTTP_200_OK,
    summary="Change password",
    description="Change password for current authenticated user.",
)
async def change_password(
    payload: ChangePasswordRequest,
    current_user: dict = Depends(get_current_active_user),
    controller: AuthController = Depends(get_auth_controller),
):
    return await controller.change_password(current_user["id"], payload)


class SwitchCompanyRequest(BaseModel):
    company_id: str = Field(..., min_length=1, max_length=64)


@router.post(
    "/switch-company",
    status_code=status.HTTP_200_OK,
    summary="Open another company's workspace (super admin)",
    description="Returns new tokens for the chosen company. Replace the stored tokens and reload.",
)
async def switch_company(
    payload: SwitchCompanyRequest,
    current_user: dict = Depends(get_current_active_user),
    controller: AuthController = Depends(get_auth_controller),
):
    tokens = await controller.auth_service.switch_company(current_user, payload.company_id)
    return success_response(data=tokens.model_dump(), message="Company switched.")
