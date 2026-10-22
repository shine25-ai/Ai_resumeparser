"""
API key authentication for the integration API used by other projects (server-to-server).
Keys are created and managed from Settings → API Integration and stored hashed in MongoDB.
"""

from fastapi import Depends, Request, Security, status
from fastapi.security import APIKeyHeader
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.core.database import get_database
from app.core.exceptions import AppException, AuthenticationError, AuthorizationError
from app.repositories.integration_repository import IntegrationRepository
from app.services.integration_service import IntegrationService, hash_api_key, key_hint

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def get_integration_service(db: AsyncIOMotorDatabase = Depends(get_database)) -> IntegrationService:
    return IntegrationService(IntegrationRepository(db))


async def get_integration_client(
    request: Request,
    api_key: str = Security(api_key_header),
    service: IntegrationService = Depends(get_integration_service),
) -> dict:
    """
    Validate the X-API-Key header and return the calling client.
    The client dict is shaped like a user so it can be passed to existing services.
    """
    request.state.integration_key_hint = key_hint(api_key or "")

    if not await service.repo.is_enabled():
        raise AppException(
            "Integration API is turned off. An admin can enable it in Settings → API Integration.",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    if not api_key:
        raise AuthenticationError("X-API-Key header missing.")

    stored = await service.repo.find_by_hash(hash_api_key(api_key))
    if not stored:
        raise AuthenticationError("Invalid API key.")

    request.state.integration_key_id = stored["id"]
    request.state.integration_key_name = stored["name"]
    if not stored.get("is_active"):
        raise AuthorizationError("This API key has been disabled.")

    await service.authenticate(api_key)  # updates last used time and request count
    return {
        "id": f"integration:{stored['id']}",
        "full_name": f"API Integration ({stored['name']})",
        "email": None,
        "key_id": stored["id"],
        "client_name": stored["name"],
    }
