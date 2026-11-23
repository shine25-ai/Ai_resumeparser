"""
Audit log API (SRS 4.22). Company users with audit_logs:view see their company's log; the super admin can
read the platform log with ?scope=platform.
"""

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_database
from app.core.dependencies import is_superadmin, require_access
from app.core.exceptions import AuthorizationError
from app.services.audit_service import list_audit_logs, to_csv
from app.utils.response import success_response

_AUDIT_ACCESS = require_access("audit_logs", {("GET", "/api/v1/audit-logs/export"): "audit_logs:export"})
router = APIRouter(prefix="/api/v1/audit-logs", tags=["Audit Logs"], dependencies=[Depends(_AUDIT_ACCESS)])


def _filters(action: str, actor: str, entity_type: str, start: str, end: str, search: str, company_id: str) -> dict:
    return dict(action=action, actor=actor, entity_type=entity_type, start=start, end=end, search=search,
                target_company_id=company_id)


def _is_platform(scope: str, user: dict) -> bool:
    if scope != "platform":
        return False
    if not is_superadmin(user):
        raise AuthorizationError("Only the platform super admin can read the platform log.")
    return True


@router.get("", summary="Audit log entries, newest first")
async def get_audit_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    action: str = Query("", max_length=80),
    actor: str = Query("", max_length=120),
    entity_type: str = Query("", max_length=40),
    start: str = Query("", max_length=32, description="ISO date"),
    end: str = Query("", max_length=32, description="ISO date"),
    search: str = Query("", max_length=120),
    company_id: str = Query("", max_length=64, description="Platform log only: entries about this company"),
    scope: str = Query("company", pattern="^(company|platform)$"),
    user: dict = Depends(_AUDIT_ACCESS),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    data = await list_audit_logs(
        db, page=page, limit=limit, platform=_is_platform(scope, user),
        **_filters(action, actor, entity_type, start, end, search, company_id),
    )
    return success_response(data=data, message="Audit log retrieved.")


@router.get("/export", summary="Download the filtered audit log as CSV (up to 5,000 rows)")
async def export_audit_logs(
    action: str = Query("", max_length=80),
    actor: str = Query("", max_length=120),
    entity_type: str = Query("", max_length=40),
    start: str = Query("", max_length=32),
    end: str = Query("", max_length=32),
    search: str = Query("", max_length=120),
    company_id: str = Query("", max_length=64),
    scope: str = Query("company", pattern="^(company|platform)$"),
    user: dict = Depends(_AUDIT_ACCESS),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    data = await list_audit_logs(
        db, page=1, limit=5000, platform=_is_platform(scope, user),
        **_filters(action, actor, entity_type, start, end, search, company_id),
    )
    return Response(
        content=to_csv(data["items"]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="audit-log.csv"'},
    )
