"""
Pytest configuration and async fixtures for FastAPI testing.
"""

import asyncio
from typing import AsyncGenerator, Dict
import pytest
from httpx import ASGITransport, AsyncClient
from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.models.user import UserDocument
from app.utils.enums import UserRole


@pytest.fixture
async def async_client() -> AsyncGenerator[AsyncClient, None]:
    """Async HTTPX client for requesting FastAPI routes in tests. Opens the database the app uses, as its startup does."""
    from app.core.database import db_manager
    from app.main import app

    await db_manager.connect_to_database()
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            yield client
    finally:
        await db_manager.close_database_connection()


@pytest.fixture
def mock_user_payload() -> Dict[str, str]:
    """Sample user payload for testing registration."""
    return {
        "full_name": "Test User",
        "email": "testuser@example.com",
        "password": "Password@123",
    }


@pytest.fixture
def mock_auth_headers() -> Dict[str, str]:
    """Generate auth headers with a mock JWT token."""
    token = create_access_token(subject="mock-user-uuid-1234", extra_claims={"role": UserRole.USER.value})
    return {"Authorization": f"Bearer {token}"}
