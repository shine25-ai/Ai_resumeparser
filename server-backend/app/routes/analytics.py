from fastapi import APIRouter, Depends
from typing import Any
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
    controller: AnalyticsController = Depends(get_analytics_controller),
    current_user: Any = Depends(get_current_user)
):
    """
    Get analytics reports data for the frontend.
    """
    data = await controller.get_analytics_reports()
    return ApiResponse(success=True, message="Analytics reports retrieved", data=data)
