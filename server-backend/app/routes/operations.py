"""
SaaS Operations, Data Retention, System Health, and Screen 22 Platform Settings Routes.
"""

from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.core.database import get_database
from app.core.dependencies import get_current_active_user, require_can
from app.core.exceptions import AuthorizationError
from app.services.branding_service import BrandingService
from app.services.health_service import HealthService
from app.services.retention_service import RetentionService
from app.utils.response import success_response

router = APIRouter(prefix="/api/v1/operations", tags=["Operations & System Settings"])


class RetentionActionRequest(BaseModel):
    company_id: Optional[str] = None


class CandidateDeletionRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500, description="GDPR / privacy reason for deletion")


# ── 1. Data Retention ────────────────────────────────────────────────────────

@router.post(
    "/retention/dry-run",
    summary="Preview candidates eligible for deletion under data retention policy",
    dependencies=[Depends(require_can("company_settings:view"))],
)
async def retention_dry_run(
    body: Optional[RetentionActionRequest] = None,
    current_user: dict = Depends(get_current_active_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    cid = (body.company_id if body and body.company_id and current_user.get("is_superadmin")
           else current_user.get("company_id"))
    service = RetentionService(db)
    report = await service.run_retention_job(company_id=cid, dry_run=True, actor=current_user)
    return success_response(data=report, message="Retention dry-run report generated.")


@router.post(
    "/retention/apply",
    summary="Execute candidate deletion under data retention policy",
    dependencies=[Depends(require_can("company_settings:edit"))],
)
async def retention_apply(
    body: Optional[RetentionActionRequest] = None,
    current_user: dict = Depends(get_current_active_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    cid = (body.company_id if body and body.company_id and current_user.get("is_superadmin")
           else current_user.get("company_id"))
    service = RetentionService(db)
    result = await service.run_retention_job(company_id=cid, dry_run=False, actor=current_user)
    return success_response(data=result, message="Data retention policy applied.")


@router.post(
    "/candidates/{candidate_id}/delete-request",
    summary="Staff right-to-be-forgotten deletion request for candidate",
    dependencies=[Depends(require_can("candidates:delete"))],
)
async def candidate_delete_request(
    candidate_id: str,
    body: CandidateDeletionRequest,
    current_user: dict = Depends(get_current_active_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    service = RetentionService(db)
    result = await service.request_candidate_deletion(
        candidate_id=candidate_id,
        reason=body.reason,
        actor=current_user,
        company_id=current_user.get("company_id"),
    )
    return success_response(data=result, message="Candidate erased successfully.")


# ── 2. System Health Monitoring (Super Admin) ────────────────────────────────

@router.get(
    "/health",
    summary="Comprehensive system health and background jobs status (Super Admin)",
)
async def system_health(
    current_user: dict = Depends(get_current_active_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    if not current_user.get("is_superadmin") and str(current_user.get("role", "")).lower() != "superadmin":
        raise AuthorizationError("Only platform Super Administrators can access full system health metrics.")
    health_svc = HealthService(db)
    report = await health_svc.get_system_health()
    return success_response(data=report, message="System health status retrieved.")


# ── 3. Screen 22 Platform Settings ───────────────────────────────────────────

@router.get(
    "/platform-settings",
    summary="Screen 22 Unified Platform Settings (Super Admin)",
)
async def get_platform_settings(
    current_user: dict = Depends(get_current_active_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    if not current_user.get("is_superadmin") and str(current_user.get("role", "")).lower() != "superadmin":
        raise AuthorizationError("Only Super Administrators can manage platform settings.")
    service = BrandingService(db)
    data = await service.platform_settings()
    return success_response(data=data, message="Platform settings retrieved.")


@router.patch(
    "/platform-settings",
    summary="Update Screen 22 Unified Platform Settings (Super Admin)",
)
async def update_platform_settings(
    changes: Dict[str, Any],
    current_user: dict = Depends(get_current_active_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    if not current_user.get("is_superadmin") and str(current_user.get("role", "")).lower() != "superadmin":
        raise AuthorizationError("Only Super Administrators can update platform settings.")
    service = BrandingService(db)
    data = await service.save_platform_settings(changes)
    return success_response(data=data, message="Platform settings saved successfully.")
