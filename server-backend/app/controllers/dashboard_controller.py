from typing import Any, Dict, Optional
from fastapi import status
from loguru import logger

from app.services.dashboard_service import DashboardService
from app.schemas.dashboard import (
    DashboardMetricsResponse,
    DashboardStatsResponse,
    DashboardPipelineResponse,
    DashboardActivitiesResponse,
    DashboardUpcomingInterviewsResponse,
    DashboardDistributionsResponse,
    DashboardNotificationsResponse,
)
from app.core.exceptions import AppException


class DashboardController:
    def __init__(self, service: DashboardService):
        self.service = service

    async def get_dashboard_metrics(
        self,
        window: str = "24h",
        tz_offset_minutes: int = 0,
        stuck_days: int = 7,
        filters: Optional[Dict[str, Any]] = None,
    ) -> DashboardMetricsResponse:
        try:
            metrics_dict = await self.service.get_dashboard_metrics(
                window=window,
                tz_offset_minutes=tz_offset_minutes,
                stuck_days=stuck_days,
                filters=filters,
            )
            return DashboardMetricsResponse(**metrics_dict)
        except Exception as e:
            logger.error(f"Error fetching dashboard metrics: {str(e)}")
            raise AppException(
                "Failed to fetch dashboard metrics",
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            ) from e

    async def get_stats(
        self,
        window: str = "24h",
        tz_offset_minutes: int = 0,
        stuck_days: int = 7,
        filters: Optional[Dict[str, Any]] = None,
    ) -> DashboardStatsResponse:
        try:
            stats_payload = await self.service.get_stats(
                window=window,
                tz_offset_minutes=tz_offset_minutes,
                stuck_days=stuck_days,
                filters=filters,
            )
            return DashboardStatsResponse(**stats_payload)
        except Exception as e:
            logger.error(f"Error fetching dashboard stats: {str(e)}")
            raise AppException(
                "Failed to fetch dashboard stats",
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            ) from e

    async def get_pipeline(
        self, stuck_days: int = 7, filters: Optional[Dict[str, Any]] = None
    ) -> DashboardPipelineResponse:
        try:
            pipeline_data = await self.service.get_pipeline(
                stuck_days=stuck_days, filters=filters
            )
            return DashboardPipelineResponse(**pipeline_data)
        except Exception as e:
            logger.error(f"Error fetching dashboard pipeline: {str(e)}")
            raise AppException(
                "Failed to fetch dashboard pipeline",
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            ) from e

    async def get_activities(
        self, filters: Optional[Dict[str, Any]] = None
    ) -> DashboardActivitiesResponse:
        try:
            activities = await self.service.get_recent_activities(filters=filters)
            return DashboardActivitiesResponse(recentActivities=activities)
        except Exception as e:
            logger.error(f"Error fetching dashboard activities: {str(e)}")
            raise AppException(
                "Failed to fetch dashboard activities",
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            ) from e

    async def get_upcoming_interviews(
        self, filters: Optional[Dict[str, Any]] = None
    ) -> DashboardUpcomingInterviewsResponse:
        try:
            interviews = await self.service.get_upcoming_interviews(filters=filters)
            return DashboardUpcomingInterviewsResponse(upcomingInterviews=interviews)
        except Exception as e:
            logger.error(f"Error fetching upcoming interviews: {str(e)}")
            raise AppException(
                "Failed to fetch upcoming interviews",
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            ) from e

    async def get_distributions(
        self, filters: Optional[Dict[str, Any]] = None
    ) -> DashboardDistributionsResponse:
        try:
            distributions = await self.service.get_distributions(filters=filters)
            return DashboardDistributionsResponse(**distributions)
        except Exception as e:
            logger.error(f"Error fetching dashboard distributions: {str(e)}")
            raise AppException(
                "Failed to fetch dashboard distributions",
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            ) from e

    async def get_notifications(self, stuck_days: int = 7) -> DashboardNotificationsResponse:
        try:
            items = await self.service.get_notifications(stuck_days=stuck_days)
            return DashboardNotificationsResponse(notifications=items)
        except Exception as e:
            logger.error(f"Error fetching dashboard notifications: {str(e)}")
            raise AppException(
                "Failed to fetch dashboard notifications",
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            ) from e

    async def get_insights(
        self, stuck_days: int = 7, filters: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        try:
            return await self.service.get_insights(stuck_days=stuck_days, filters=filters)
        except Exception as e:
            logger.error(f"Error fetching dashboard insights: {str(e)}")
            raise AppException(
                "Failed to fetch dashboard insights",
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            ) from e
