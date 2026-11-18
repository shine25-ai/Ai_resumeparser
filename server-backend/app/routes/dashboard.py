from fastapi import APIRouter, Depends, Query
from typing import Any, Dict, Optional

from app.schemas.common import ApiResponse
from app.schemas.dashboard import (
    DashboardMetricsResponse,
    DashboardStatsResponse,
    DashboardPipelineResponse,
    DashboardActivitiesResponse,
    DashboardUpcomingInterviewsResponse,
    DashboardDistributionsResponse,
    DashboardNotificationsResponse,
)
from app.services.dashboard_service import DashboardService
from app.controllers.dashboard_controller import DashboardController
from app.core.dependencies import get_current_user

router = APIRouter(prefix="/api/v1/dashboard", tags=["Dashboard"])

_dashboard_service = DashboardService()


def get_dashboard_controller() -> DashboardController:
    return DashboardController(_dashboard_service)


def get_dashboard_filters(
    date_range: Optional[str] = Query("all", description="all | today | 7d | 30d | 90d | custom"),
    start_date: Optional[str] = Query(None, description="YYYY-MM-DD for custom range"),
    end_date: Optional[str] = Query(None, description="YYYY-MM-DD for custom range"),
    job_id: Optional[str] = Query(None, description="Filter by job opening ID"),
    department: Optional[str] = Query(None, description="Filter by department"),
    recruiter: Optional[str] = Query(None, description="Filter by recruiter email or name"),
    tz_offset: int = Query(0, description="User timezone offset in minutes from JS Date.getTimezoneOffset()"),
) -> Dict[str, Any]:
    return DashboardService._normalize_filters(
        date_range=date_range,
        start_date=start_date,
        end_date=end_date,
        job_id=job_id,
        department=department,
        recruiter=recruiter,
        tz_offset_minutes=tz_offset,
    )


@router.get("/notifications", response_model=ApiResponse[DashboardNotificationsResponse])
async def get_notifications(
    stuck_days: int = Query(7, ge=1, le=90),
    controller: DashboardController = Depends(get_dashboard_controller),
    current_user: Any = Depends(get_current_user),
):
    """Get actionable recruitment notifications for the header bell dropdown."""
    data = await controller.get_notifications(stuck_days=stuck_days)
    return ApiResponse(success=True, message="Notifications retrieved", data=data)


@router.get("/insights", response_model=ApiResponse[Dict[str, Any]])
async def get_dashboard_insights(
    stuck_days: int = Query(7, ge=1, le=90),
    filters: Dict[str, Any] = Depends(get_dashboard_filters),
    controller: DashboardController = Depends(get_dashboard_controller),
    current_user: Any = Depends(get_current_user),
):
    """Get executive dashboard insights widgets."""
    data = await controller.get_insights(stuck_days=stuck_days, filters=filters)
    return ApiResponse(success=True, message="Dashboard insights retrieved", data=data)


@router.get("/metrics", response_model=ApiResponse[DashboardMetricsResponse])
async def get_dashboard_metrics(
    window: str = Query("24h", description="Intake window: today | 24h | 7d"),
    stuck_days: int = Query(7, ge=1, le=90, description="Days threshold to flag candidates stuck in a stage"),
    filters: Dict[str, Any] = Depends(get_dashboard_filters),
    controller: DashboardController = Depends(get_dashboard_controller),
    current_user: Any = Depends(get_current_user),
):
    data = await controller.get_dashboard_metrics(
        window=window,
        tz_offset_minutes=filters["tz_offset_minutes"],
        stuck_days=stuck_days,
        filters=filters,
    )
    return ApiResponse(success=True, message="Dashboard metrics retrieved", data=data)


@router.get("/stats", response_model=ApiResponse[DashboardStatsResponse])
async def get_dashboard_stats(
    window: str = Query("24h", description="Intake window: today | 24h | 7d"),
    stuck_days: int = Query(7, ge=1, le=90, description="Days threshold for pipeline snapshot"),
    filters: Dict[str, Any] = Depends(get_dashboard_filters),
    controller: DashboardController = Depends(get_dashboard_controller),
    current_user: Any = Depends(get_current_user),
):
    data = await controller.get_stats(
        window=window,
        tz_offset_minutes=filters["tz_offset_minutes"],
        stuck_days=stuck_days,
        filters=filters,
    )
    return ApiResponse(success=True, message="Dashboard stats retrieved", data=data)


@router.get("/pipeline", response_model=ApiResponse[DashboardPipelineResponse])
async def get_dashboard_pipeline(
    stuck_days: int = Query(7, ge=1, le=90, description="Days threshold to flag candidates stuck in a stage"),
    filters: Dict[str, Any] = Depends(get_dashboard_filters),
    controller: DashboardController = Depends(get_dashboard_controller),
    current_user: Any = Depends(get_current_user),
):
    data = await controller.get_pipeline(stuck_days=stuck_days, filters=filters)
    return ApiResponse(success=True, message="Dashboard pipeline retrieved", data=data)


@router.get("/activities", response_model=ApiResponse[DashboardActivitiesResponse])
async def get_dashboard_activities(
    filters: Dict[str, Any] = Depends(get_dashboard_filters),
    controller: DashboardController = Depends(get_dashboard_controller),
    current_user: Any = Depends(get_current_user),
):
    data = await controller.get_activities(filters=filters)
    return ApiResponse(success=True, message="Recent activities retrieved", data=data)


@router.get("/upcoming-interviews", response_model=ApiResponse[DashboardUpcomingInterviewsResponse])
async def get_upcoming_interviews(
    filters: Dict[str, Any] = Depends(get_dashboard_filters),
    controller: DashboardController = Depends(get_dashboard_controller),
    current_user: Any = Depends(get_current_user),
):
    data = await controller.get_upcoming_interviews(filters=filters)
    return ApiResponse(success=True, message="Upcoming interviews retrieved", data=data)


@router.get("/distributions", response_model=ApiResponse[DashboardDistributionsResponse])
async def get_dashboard_distributions(
    filters: Dict[str, Any] = Depends(get_dashboard_filters),
    controller: DashboardController = Depends(get_dashboard_controller),
    current_user: Any = Depends(get_current_user),
):
    data = await controller.get_distributions(filters=filters)
    return ApiResponse(success=True, message="Dashboard distributions retrieved", data=data)
