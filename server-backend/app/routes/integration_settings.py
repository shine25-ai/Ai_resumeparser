"""
Admin endpoints behind Settings → API Integration: turn the integration API on/off,
manage API keys, and view usage and request logs.
"""

from typing import Literal, Optional
from fastapi import APIRouter, Depends, Query
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field
from app.core.api_key import get_integration_service
from app.core.dependencies import get_current_active_user
from app.core.exceptions import AuthorizationError
from app.services.integration_service import IntegrationService
from app.utils.response import success_response

router = APIRouter(prefix="/api/v1/settings/integration", tags=["Settings - API Integration"])


async def require_settings_admin(current_user: dict = Depends(get_current_active_user)) -> dict:
    """Only admins, or roles granted the 'settings' permission, can manage API keys."""
    role = str(current_user.get("role", "")).strip().lower()
    if role in ("admin", "superadmin") or "settings" in (current_user.get("permissions") or []):
        return current_user
    raise AuthorizationError("Managing API keys requires admin or Settings permission.")


class OptionsRequest(BaseModel):
    enabled: Optional[bool] = Field(None, description="Accept integration API requests at all")
    share_interview_results: Optional[bool] = Field(
        None, description="Include interview outcomes (Selected, Not selected, ...) in candidate interview responses"
    )


class CreateKeyRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=80, description="Who uses this key, e.g. 'HRMS portal'")
    description: Optional[str] = Field(None, max_length=300)


class UpdateKeyRequest(BaseModel):
    name: Optional[str] = Field(None, max_length=80)
    description: Optional[str] = Field(None, max_length=300)
    is_active: Optional[bool] = None


def _ok(data, message: str):
    return success_response(data=jsonable_encoder(data), message=message)


@router.get("", summary="Integration API status overview")
async def get_overview(
    _: dict = Depends(require_settings_admin),
    service: IntegrationService = Depends(get_integration_service),
):
    return _ok(await service.overview(), "Integration status retrieved.")


@router.put("/status", summary="Turn the integration API on/off and choose whether interview results are shared")
async def set_status(
    payload: OptionsRequest,
    _: dict = Depends(require_settings_admin),
    service: IntegrationService = Depends(get_integration_service),
):
    data = await service.update_options(payload.enabled, payload.share_interview_results)
    return _ok(data, "Integration settings updated.")


@router.get("/keys", summary="List API keys")
async def list_keys(
    _: dict = Depends(require_settings_admin),
    service: IntegrationService = Depends(get_integration_service),
):
    return _ok({"keys": await service.list_keys()}, "API keys retrieved.")


@router.post("/keys", status_code=201, summary="Create an API key (the full key is returned only once)")
async def create_key(
    payload: CreateKeyRequest,
    current_user: dict = Depends(require_settings_admin),
    service: IntegrationService = Depends(get_integration_service),
):
    data = await service.create_key(payload.name, payload.description, current_user)
    return success_response(data=jsonable_encoder(data), message="API key created. Copy it now; it won't be shown again.", status_code=201)


@router.patch("/keys/{key_id}", summary="Rename, describe, enable or disable an API key")
async def update_key(
    key_id: str,
    payload: UpdateKeyRequest,
    _: dict = Depends(require_settings_admin),
    service: IntegrationService = Depends(get_integration_service),
):
    data = await service.update_key(key_id, payload.name, payload.description, payload.is_active)
    return _ok(data, "API key updated.")


@router.post("/keys/{key_id}/regenerate", summary="Replace an API key's secret (the old one stops working)")
async def regenerate_key(
    key_id: str,
    _: dict = Depends(require_settings_admin),
    service: IntegrationService = Depends(get_integration_service),
):
    data = await service.regenerate_key(key_id)
    return _ok(data, "API key regenerated. Copy it now; it won't be shown again.")


@router.delete("/keys/{key_id}", summary="Delete an API key")
async def delete_key(
    key_id: str,
    _: dict = Depends(require_settings_admin),
    service: IntegrationService = Depends(get_integration_service),
):
    await service.delete_key(key_id)
    return _ok({}, "API key deleted.")


@router.get("/usage", summary="Request counts, error rate and daily usage")
async def get_usage(
    days: int = Query(30, ge=1, le=90),
    key_id: Optional[str] = Query(None),
    _: dict = Depends(require_settings_admin),
    service: IntegrationService = Depends(get_integration_service),
):
    return _ok(await service.get_usage(days=days, key_id=key_id), "Usage retrieved.")


@router.get("/logs", summary="Request logs")
async def get_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    key_id: Optional[str] = Query(None),
    outcome: Optional[Literal["success", "error"]] = Query(None),
    endpoint: Optional[Literal["upload", "status", "profile", "lookup", "interviews"]] = Query(None),
    _: dict = Depends(require_settings_admin),
    service: IntegrationService = Depends(get_integration_service),
):
    data = await service.get_logs(page=page, limit=limit, key_id=key_id, outcome=outcome, endpoint=endpoint)
    return _ok(data, "Logs retrieved.")
