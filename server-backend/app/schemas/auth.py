from typing import Optional
"""
Pydantic schemas for authentication requests, tokens, and registration payloads.
"""

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class LoginRequest(BaseModel):
    """User login request payload."""

    email: EmailStr = Field(..., example="user@example.com")
    password: str = Field(..., min_length=6, example="Password@123")
    company: Optional[str] = Field(default=None, max_length=60, description="Company sign-in page (/<slug>/login): only its users may sign in there")


class RegisterRequest(BaseModel):
    """User self-registration request payload."""

    full_name: str = Field(..., min_length=2, max_length=100, example="John Doe")
    email: EmailStr = Field(..., example="john.doe@example.com")
    password: str = Field(..., min_length=6, example="Password@123")


class RefreshTokenRequest(BaseModel):
    """Token refresh request payload."""

    refresh_token: str = Field(..., example="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...")


class TokenResponse(BaseModel):
    """JWT Token response schema."""

    access_token: str
    refresh_token: str
    token_type: str = "Bearer"
    expires_in_minutes: int

    model_config = ConfigDict(from_attributes=True)
