"""
Authentication service handling user registration, login authentication, token refresh, and password updates.
"""

from loguru import logger
from app.core.config import settings
from app.core.exceptions import AuthenticationError, AuthorizationError, AppException, NotFoundError
from app.core.tenant import company_scope, system_scope
from app.models.company import DEFAULT_COMPANY_ID, email_domain
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_jwt_token,
    hash_password,
    verify_password,
)
from app.models.user import UserDocument
from app.repositories.user_repository import UserRepository
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse
from app.schemas.user import ChangePasswordRequest, UserResponse
from app.utils.constants import COMPANIES_COLLECTION, ERROR_INVALID_CREDENTIALS, ERROR_USER_EXISTS
from app.utils.helpers import utc_now


class AuthService:
    """Service containing authentication business logic."""

    def __init__(self, user_repo: UserRepository):
        self.user_repo = user_repo

    async def _company(self, company_id: str):
        return await self.user_repo.db[COMPANIES_COLLECTION].find_one({"id": company_id})

    def _issue_tokens(self, user: dict, company_id: str = None) -> TokenResponse:
        """A super admin's token carries the company they are working in."""
        claims = {"company_id": company_id} if company_id else {}
        return TokenResponse(
            access_token=create_access_token(subject=user["id"], extra_claims={"role": user["role"], **claims}),
            refresh_token=create_refresh_token(subject=user["id"], extra_claims=claims or None),
            token_type="Bearer",
            expires_in_minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES,
        )

    async def _check_company_open(self, user: dict) -> None:
        if str(user.get("role", "")).lower() == "superadmin":
            return
        company = await self._company(user.get("company_id") or DEFAULT_COMPANY_ID)
        if not company or company.get("is_active") is False:
            raise AuthenticationError("Your company's workspace has been turned off. Please contact support.")

    async def register_user(self, payload: RegisterRequest) -> UserResponse:
        """
        Self sign-up is only for a company that lists its email domains: someone at @abc.com joins ABC's
        workspace, switched off until ABC's administrator turns the account on. Everyone else is added
        by their company's administrator.
        """
        email = payload.email.strip().lower()

        with system_scope():
            if await self.user_repo.get_by_email(email):
                raise AppException(ERROR_USER_EXISTS, status_code=400)
            companies = await self.user_repo.db[COMPANIES_COLLECTION].find(
                {"email_domains": email_domain(email), "is_active": {"$ne": False}}
            ).to_list(length=2)
        if len(companies) != 1:
            raise AuthorizationError("Please ask your company's administrator to create your account.")

        user_doc = UserDocument(
            full_name=payload.full_name,
            email=email,
            password=hash_password(payload.password),
            is_active=False,
        )
        with company_scope(companies[0]["id"]):
            created = await self.user_repo.create(user_doc.to_dict())
        logger.info(f"Registered new user account '{email}' for company '{companies[0]['name']}' (waiting for approval)")
        return UserResponse.model_validate(created)

    async def authenticate_user(self, payload: LoginRequest) -> TokenResponse:
        """Authenticate user credentials and issue JWT Access and Refresh tokens."""
        email = payload.email.strip().lower()
        user = await self.user_repo.get_by_email(email)

        if not user or not verify_password(payload.password, user["password"]):
            logger.warning(f"Failed login attempt for email: '{email}'")
            raise AuthenticationError(ERROR_INVALID_CREDENTIALS)

        if not user.get("is_active", True):
            raise AuthenticationError("User account is deactivated.")
        await self._check_company_open(user)

        logger.info(f"User '{email}' logged in successfully.")
        return self._issue_tokens(user)

    async def refresh_tokens(self, refresh_token_str: str) -> TokenResponse:
        """Issue new access & refresh token pair using valid refresh token."""
        payload = decode_jwt_token(refresh_token_str)
        if payload.get("type") != "refresh":
            raise AuthenticationError("Invalid token type. Refresh token required.")

        with system_scope():
            user = await self.user_repo.get_by_id(payload.get("sub"))
        if not user or not user.get("is_active", True) or user.get("is_deleted"):
            raise AuthenticationError("User account is invalid or inactive.")
        await self._check_company_open(user)

        company_id = payload.get("company_id") if str(user.get("role", "")).lower() == "superadmin" else None
        return self._issue_tokens(user, company_id)

    async def switch_company(self, user: dict, company_id: str) -> TokenResponse:
        """Super admin only: new tokens that open another company's workspace."""
        if not user.get("is_superadmin"):
            raise AuthorizationError("Only the platform super admin can switch company.")
        if not await self._company(company_id):
            raise NotFoundError("Company not found.")
        home = user.get("home_company_id") or DEFAULT_COMPANY_ID
        return self._issue_tokens(user, None if company_id == home else company_id)

    async def change_password(self, user_id: str, payload: ChangePasswordRequest) -> bool:
        """Update password for authenticated user."""
        with system_scope():
            user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise AuthenticationError("User not found.")

        if not verify_password(payload.old_password, user["password"]):
            raise AppException("Old password is incorrect.", status_code=400)

        hashed_pwd = hash_password(payload.new_password)
        with system_scope():
            await self.user_repo.update_password(user_id, hashed_pwd, utc_now().isoformat())
        logger.info(f"Password changed successfully for user_id '{user_id}'")
        return True
