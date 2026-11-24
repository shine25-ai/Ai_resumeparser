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


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def async_client() -> AsyncGenerator[AsyncClient, None]:
    """Async HTTPX client for requesting FastAPI routes in tests."""
    from app.main import app
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        yield client


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
