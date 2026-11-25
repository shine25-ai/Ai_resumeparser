import logging
from typing import Any, Dict, Optional
from fastapi import status
from app.core.exceptions import AppException
from app.services.analytics_service import AnalyticsService

logger = logging.getLogger(__name__)

class AnalyticsController:
    def __init__(self, service: AnalyticsService):
        self.service = service

    async def get_super_admin_dashboard(
        self,
        days: Optional[int] = 30,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> Dict[str, Any]:
        try:
            return await self.service.get_super_admin_dashboard(
                days=days,
                start_date=start_date,
                end_date=end_date,
            )
        except Exception as e:
            logger.error(f"Error fetching super admin dashboard: {str(e)}")
            raise AppException("Failed to fetch super admin dashboard", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR) from e

    async def get_company_dashboard(
        self,
        days: Optional[int] = 30,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> Dict[str, Any]:
        try:
            return await self.service.get_company_dashboard(
                days=days,
                start_date=start_date,
                end_date=end_date,
            )
        except Exception as e:
            logger.error(f"Error fetching company dashboard: {str(e)}")
            raise AppException("Failed to fetch company dashboard", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR) from e

    async def get_recruitment_reports(
        self,
        days: Optional[int] = 90,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        job_id: Optional[str] = None,
        department: Optional[str] = None,
        recruiter_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        try:
            return await self.service.get_recruitment_reports(
                days=days,
                start_date=start_date,
                end_date=end_date,
                job_id=job_id,
                department=department,
                recruiter_id=recruiter_id,
            )
        except Exception as e:
            logger.error(f"Error fetching recruitment reports: {str(e)}")
            raise AppException("Failed to fetch recruitment reports", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR) from e

    async def export_reports_csv(
        self,
        days: Optional[int] = 90,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        job_id: Optional[str] = None,
        department: Optional[str] = None,
        recruiter_id: Optional[str] = None,
    ) -> str:
        try:
            return await self.service.export_reports_csv(
                days=days,
                start_date=start_date,
                end_date=end_date,
                job_id=job_id,
                department=department,
                recruiter_id=recruiter_id,
            )
        except Exception as e:
            logger.error(f"Error exporting recruitment reports CSV: {str(e)}")
            raise AppException("Failed to export recruitment reports CSV", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR) from e

    # Backwards compatibility
    async def get_analytics_reports_legacy(self, days: Optional[int] = 30) -> Dict[str, Any]:
        return await self.get_recruitment_reports(days=days)
