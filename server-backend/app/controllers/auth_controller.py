"""
Auth controller handling HTTP request processing for registration, login, logout, refresh, and password change.
"""

from fastapi import status
from fastapi.responses import JSONResponse
from app.schemas.auth import LoginRequest, RefreshTokenRequest, RegisterRequest
from app.schemas.user import ChangePasswordRequest
from app.services.auth_service import AuthService
from app.utils.response import success_response


class AuthController:
    """Controller orchestrating authentication API endpoints."""

    def __init__(self, auth_service: AuthService):
        self.auth_service = auth_service

    async def register(self, payload: RegisterRequest) -> JSONResponse:
        """Process user registration."""
        user_response = await self.auth_service.register_user(payload)
        return success_response(
            data=user_response.model_dump(),
            message="User registered successfully.",
            status_code=status.HTTP_201_CREATED,
        )

    async def login(self, payload: LoginRequest) -> JSONResponse:
        """Process user login authentication."""
        token_response = await self.auth_service.authenticate_user(payload)
        return success_response(
            data=token_response.model_dump(),
            message="Login successful.",
            status_code=status.HTTP_200_OK,
        )

    async def refresh_token(self, payload: RefreshTokenRequest) -> JSONResponse:
        """Process token refresh."""
        token_response = await self.auth_service.refresh_tokens(payload.refresh_token)
        return success_response(
            data=token_response.model_dump(),
            message="Token refreshed successfully.",
            status_code=status.HTTP_200_OK,
        )

    async def logout(self) -> JSONResponse:
        """Process user logout."""
        return success_response(
            data={},
            message="Logout successful.",
            status_code=status.HTTP_200_OK,
        )

    async def verify_mfa_login(self, mfa_token: str, code: str) -> JSONResponse:
        """Verify 2FA TOTP code or backup code and return token."""
        token_response = await self.auth_service.verify_mfa_login(mfa_token, code)
        return success_response(
            data=token_response.model_dump(),
            message="2FA verification successful.",
            status_code=status.HTTP_200_OK,
        )

    async def change_password(self, user_id: str, payload: ChangePasswordRequest) -> JSONResponse:
        """Process password update for authenticated user."""
        await self.auth_service.change_password(user_id, payload)
        return success_response(
            data={},
            message="Password updated successfully.",
            status_code=status.HTTP_200_OK,
        )
