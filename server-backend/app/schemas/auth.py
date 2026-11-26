from typing import Optional
"""
Pydantic schemas for authentication requests, tokens, and registration payloads.
"""

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class LoginRequest(BaseModel):
    """User login request payload."""

    email: EmailStr = Field(..., examples=["user@example.com"])
    password: str = Field(..., min_length=6, examples=["Password@123"])
    company: Optional[str] = Field(default=None, max_length=60, description="Company sign-in page (/<slug>/login): only its users may sign in there")


class RegisterRequest(BaseModel):
    """User self-registration request payload."""

    full_name: str = Field(..., min_length=2, max_length=100, examples=["John Doe"])
    email: EmailStr = Field(..., examples=["john.doe@example.com"])
    password: str = Field(..., min_length=6, examples=["Password@123"])


class RefreshTokenRequest(BaseModel):
    """Token refresh request payload."""

    refresh_token: str = Field(..., examples=["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."])


class TokenResponse(BaseModel):
    """JWT Token response schema."""

    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    token_type: str = "Bearer"
    expires_in_minutes: Optional[int] = None
    mfa_required: bool = False
    mfa_enrolled: bool = False
    mfa_token: Optional[str] = None
    email: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class MfaVerifyRequest(BaseModel):
    mfa_token: str
    code: str


class MfaEnrolConfirmRequest(BaseModel):
    code: str


class MfaSetupStartRequest(BaseModel):
    """First-time MFA setup during sign-in: the 5-minute token from the sign-in response."""
    mfa_token: str


class MfaSetupConfirmRequest(BaseModel):
    mfa_token: str
    code: str


class MfaDisableRequest(BaseModel):
    """A current code from the authenticator app, or a backup code."""
    code: str
