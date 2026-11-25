from fastapi import APIRouter, Depends, Query, Response, status
from typing import Any, Dict, Optional
from app.core.dependencies import get_current_active_user, require_superadmin, can
from app.core.exceptions import AuthorizationError
from app.schemas.common import ApiResponse
from app.services.analytics_service import AnalyticsService
from app.controllers.analytics_controller import AnalyticsController

router = APIRouter(prefix="/api/v1/analytics", tags=["Analytics"])

_analytics_service = AnalyticsService()


def get_analytics_controller() -> AnalyticsController:
    return AnalyticsController(_analytics_service)


@router.get("/platform-dashboard", response_model=ApiResponse[Dict[str, Any]])
async def get_platform_dashboard(
    days: Optional[int] = Query(30, ge=1, le=3650, description="Look back window in days"),
    start_date: Optional[str] = Query(None, description="Custom start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="Custom end date (YYYY-MM-DD)"),
    controller: AnalyticsController = Depends(get_analytics_controller),
    _superadmin: dict = Depends(require_superadmin),
):
    """
    Super Admin platform dashboard (Screen 1).
    Aggregates metrics across all companies in system scope. Only accessible by Super Admin.
    """
    data = await controller.get_super_admin_dashboard(
        days=days,
        start_date=start_date,
        end_date=end_date,
    )
    return ApiResponse(success=True, message="Platform dashboard retrieved", data=data)


@router.get("/company-dashboard", response_model=ApiResponse[Dict[str, Any]])
async def get_company_dashboard(
    days: Optional[int] = Query(30, ge=1, le=3650, description="Look back window in days"),
    start_date: Optional[str] = Query(None, description="Custom start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="Custom end date (YYYY-MM-DD)"),
    controller: AnalyticsController = Depends(get_analytics_controller),
    current_user: dict = Depends(get_current_active_user),
):
    """
    Company Executive Dashboard (Screen 4).
    Metrics scoped strictly to current active company.
    """
    data = await controller.get_company_dashboard(
        days=days,
        start_date=start_date,
        end_date=end_date,
    )
    return ApiResponse(success=True, message="Company dashboard retrieved", data=data)


@router.get("/reports", response_model=ApiResponse[Dict[str, Any]])
async def get_recruitment_reports(
    days: Optional[int] = Query(90, ge=1, le=3650, description="Look back window in days"),
    all_time: bool = Query(False, description="Ignore `days` and use all data"),
    start_date: Optional[str] = Query(None, description="Custom start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="Custom end date (YYYY-MM-DD)"),
    job_id: Optional[str] = Query(None, description="Filter by job opening"),
    department: Optional[str] = Query(None, description="Filter by department"),
    recruiter_id: Optional[str] = Query(None, description="Filter by recruiter"),
    controller: AnalyticsController = Depends(get_analytics_controller),
    current_user: dict = Depends(get_current_active_user),
):
    """
    Recruitment Reports & Analytics (Screen 20).
    Requires reports:view or analytics permission.
    """
    # Permission check: admin or reports:view or analytics
    role = str(current_user.get("role", "")).lower()
    perms = current_user.get("permissions") or []
    if role not in ("admin", "superadmin") and not (
        can(current_user, "reports:view") or "reports" in perms or "analytics" in perms
    ):
        raise AuthorizationError("You do not have permission to view recruitment reports (reports:view required).")

    actual_days = None if all_time else days
    data = await controller.get_recruitment_reports(
        days=actual_days,
        start_date=start_date,
        end_date=end_date,
        job_id=job_id,
        department=department,
        recruiter_id=recruiter_id,
    )
    return ApiResponse(success=True, message="Recruitment reports retrieved", data=data)


@router.get("/reports/export")
async def export_recruitment_reports_csv(
    days: Optional[int] = Query(90, ge=1, le=3650, description="Look back window in days"),
    all_time: bool = Query(False, description="Ignore `days` and use all data"),
    start_date: Optional[str] = Query(None, description="Custom start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="Custom end date (YYYY-MM-DD)"),
    job_id: Optional[str] = Query(None, description="Filter by job opening"),
    department: Optional[str] = Query(None, description="Filter by department"),
    recruiter_id: Optional[str] = Query(None, description="Filter by recruiter"),
    controller: AnalyticsController = Depends(get_analytics_controller),
    current_user: dict = Depends(get_current_active_user),
):
    """
    Export Recruitment Reports to CSV format.
    Requires reports:export permission.
    """
    role = str(current_user.get("role", "")).lower()
    perms = current_user.get("permissions") or []
    if role not in ("admin", "superadmin") and not (
        can(current_user, "reports:export") or "reports:export" in perms
    ):
        raise AuthorizationError("You do not have permission to export recruitment reports (reports:export required).")

    actual_days = None if all_time else days
    csv_content = await controller.export_reports_csv(
        days=actual_days,
        start_date=start_date,
        end_date=end_date,
        job_id=job_id,
        department=department,
        recruiter_id=recruiter_id,
    )

    filename = f"recruitment_report_{actual_days or 'all'}d.csv"
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-cache",
        },
    )
