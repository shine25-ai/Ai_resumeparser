"""
Authentication routes for registration, login, logout, token refresh, and password management.
"""

from fastapi import APIRouter, Depends, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field
from app.controllers.auth_controller import AuthController
from app.core.database import get_database
from app.services.audit_service import record_audit
from app.core.dependencies import get_current_active_user
from app.repositories.user_repository import UserRepository
from app.schemas.auth import LoginRequest, RefreshTokenRequest, RegisterRequest, MfaVerifyRequest, MfaEnrolConfirmRequest
from app.schemas.user import ChangePasswordRequest
from app.services.auth_service import AuthService
from app.services.mfa_service import MfaService
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
    "/mfa/verify",
    status_code=status.HTTP_200_OK,
    summary="Verify MFA TOTP or backup code during sign-in",
)
async def verify_mfa(
    payload: MfaVerifyRequest,
    controller: AuthController = Depends(get_auth_controller),
):
    return await controller.verify_mfa_login(payload.mfa_token, payload.code)


@router.post(
    "/mfa/enrol/start",
    status_code=status.HTTP_200_OK,
    summary="Start MFA enrolment: get secret, otpauth URI, backup codes & QR code",
)
async def start_mfa_enrol(
    current_user: dict = Depends(get_current_active_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    mfa_svc = MfaService(db)
    res = await mfa_svc.start_enrolment(current_user["id"], current_user.get("email", ""))
    return success_response(data=res, message="MFA enrolment initialized.")


@router.post(
    "/mfa/enrol/confirm",
    status_code=status.HTTP_200_OK,
    summary="Confirm MFA enrolment with 6-digit TOTP code",
)
async def confirm_mfa_enrol(
    payload: MfaEnrolConfirmRequest,
    current_user: dict = Depends(get_current_active_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    mfa_svc = MfaService(db)
    res = await mfa_svc.confirm_enrolment(current_user["id"], payload.code)
    return success_response(data=res, message="MFA successfully activated.")


@router.post(
    "/mfa/disable",
    status_code=status.HTTP_200_OK,
    summary="Disable MFA on user account",
)
async def disable_mfa(
    current_user: dict = Depends(get_current_active_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    mfa_svc = MfaService(db)
    res = await mfa_svc.disable_mfa(current_user["id"], current_user)
    return success_response(data=res, message="MFA disabled.")


@router.post(
    "/switch-company",
    status_code=status.HTTP_200_OK,
    summary="Open another company's workspace (super admin)",
    description="Returns new tokens for the chosen company. Replace the stored tokens and reload.",
)
async def switch_company(
    payload: SwitchCompanyRequest,
    request: Request,
    current_user: dict = Depends(get_current_active_user),
    controller: AuthController = Depends(get_auth_controller),
    audit_db: AsyncIOMotorDatabase = Depends(get_database),
):
    tokens = await controller.auth_service.switch_company(current_user, payload.company_id)
    # Both the platform log and the company's own log show that the super admin opened the workspace.
    for platform in (True, False):
        await record_audit(
            audit_db, current_user, "workspace.opened", "company", payload.company_id,
            details=f"Super admin opened this workspace (from {current_user.get('company_name') or current_user.get('company_id')})",
            request=request, platform=platform, target_company_id=payload.company_id,
        )
    return success_response(data=tokens.model_dump(), message="Company switched.")
