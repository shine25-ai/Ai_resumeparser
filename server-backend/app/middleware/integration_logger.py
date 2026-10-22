"""
Records every request to the integration API (/api/v1/integration) in MongoDB so admins can
see usage, errors and response times in Settings → API Integration.
"""

import time
from fastapi import Request
from loguru import logger
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response
from app.core.database import db_manager
from app.repositories.integration_repository import IntegrationRepository
from app.services.integration_service import IntegrationService, endpoint_label

INTEGRATION_PATH_PREFIX = "/api/v1/integration"


class IntegrationLoggerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if not request.url.path.startswith(INTEGRATION_PATH_PREFIX) or request.method == "OPTIONS":
            return await call_next(request)

        start = time.perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        finally:
            await self._record(request, status_code, (time.perf_counter() - start) * 1000)

    async def _record(self, request: Request, status_code: int, duration_ms: float) -> None:
        try:
            state = request.state
            entry = {
                "key_id": getattr(state, "integration_key_id", None),
                "key_name": getattr(state, "integration_key_name", None),
                "key_hint": getattr(state, "integration_key_hint", None) or None,
                "method": request.method,
                "path": request.url.path,
                "query": str(request.url.query) or None,
                "endpoint": endpoint_label(request.method, request.url.path),
                "status_code": status_code,
                "duration_ms": round(duration_ms, 1),
                "resume_id": getattr(state, "integration_resume_id", None),
                "error_message": getattr(state, "error_message", None) if status_code >= 400 else None,
                "ip_address": request.headers.get("x-forwarded-for", "").split(",")[0].strip()
                or (request.client.host if request.client else None),
                "user_agent": request.headers.get("user-agent"),
            }
            await IntegrationService(IntegrationRepository(db_manager.get_db())).record_request(entry)
        except Exception as e:  # logging must never break the API
            logger.warning(f"Integration request logging failed: {e}")
