from fastapi import APIRouter, Depends, Query
from typing import Any, Optional
from app.schemas.common import ApiResponse
from app.schemas.analytics import AnalyticsResponse
from app.services.analytics_service import AnalyticsService
from app.controllers.analytics_controller import AnalyticsController
from app.core.dependencies import get_current_user

router = APIRouter(prefix="/api/v1/analytics", tags=["Analytics"])

def get_analytics_controller() -> AnalyticsController:
    service = AnalyticsService()
    return AnalyticsController(service)

@router.get("/reports", response_model=ApiResponse[AnalyticsResponse])
async def get_analytics_reports(
    days: Optional[int] = Query(30, ge=1, le=3650, description="Look back this many days; omit with all_time=true for everything"),
    all_time: bool = Query(False, description="Ignore `days` and use all data"),
    controller: AnalyticsController = Depends(get_analytics_controller),
    current_user: Any = Depends(get_current_user)
):
    """
    Get analytics reports data for the frontend.
    """
    data = await controller.get_analytics_reports(days=None if all_time else days)
    return ApiResponse(success=True, message="Analytics reports retrieved", data=data)
