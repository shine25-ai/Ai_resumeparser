import logging
from fastapi import status
from app.core.exceptions import AppException
from app.schemas.analytics import AnalyticsResponse
from app.services.analytics_service import AnalyticsService

logger = logging.getLogger(__name__)

class AnalyticsController:
    def __init__(self, service: AnalyticsService):
        self.service = service

    async def get_analytics_reports(self) -> AnalyticsResponse:
        try:
            data = await self.service.get_analytics_reports()
            return AnalyticsResponse(**data)
        except Exception as e:
            logger.error(f"Error fetching analytics reports: {str(e)}")
            raise AppException("Failed to fetch analytics reports", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR) from e
