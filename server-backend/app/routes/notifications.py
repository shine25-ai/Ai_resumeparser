"""
In-App Notifications and Email Dispatch Logs Routes (Phase 11 - SRS 4.21).
"""

from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_database
from app.core.dependencies import get_current_active_user, require_can
from app.services.notification_service import NotificationService
from app.utils.response import success_response

router = APIRouter(prefix="/api/v1/notifications", tags=["Notifications"])


def get_notification_service(db: AsyncIOMotorDatabase = Depends(get_database)) -> NotificationService:
    return NotificationService(db)


@router.get(
    "",
    summary="List in-app notifications for current user with unread count",
)
async def list_notifications(
    unread_only: bool = Query(False, description="Filter unread notifications only"),
    limit: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_active_user),
    service: NotificationService = Depends(get_notification_service),
):
    data = await service.list_notifications(
        user_id=current_user["id"],
        company_id=current_user.get("company_id"),
        unread_only=unread_only,
        limit=limit,
    )
    return success_response(data=data, message="Notifications retrieved.")


@router.patch(
    "/{notification_id}/read",
    summary="Mark single notification as read",
)
async def mark_notification_read(
    notification_id: str,
    current_user: dict = Depends(get_current_active_user),
    service: NotificationService = Depends(get_notification_service),
):
    res = await service.mark_read(notification_id, current_user["id"])
    return success_response(data=res, message="Notification marked as read.")


@router.post(
    "/read-all",
    summary="Mark all notifications as read for current user",
)
async def mark_all_notifications_read(
    current_user: dict = Depends(get_current_active_user),
    service: NotificationService = Depends(get_notification_service),
):
    count = await service.mark_all_read(current_user["id"], current_user.get("company_id"))
    return success_response(data={"modified_count": count}, message="All notifications marked as read.")


@router.get(
    "/logs",
    summary="List email notification dispatch audit trail (admin)",
    dependencies=[Depends(require_can("company_settings:view"))],
)
async def list_notification_logs(
    limit: int = Query(50, ge=1, le=100),
    skip: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_active_user),
    service: NotificationService = Depends(get_notification_service),
):
    data = await service.list_email_logs(
        company_id=current_user.get("company_id"),
        limit=limit,
        skip=skip,
    )
    return success_response(data=data, message="Email logs retrieved.")
