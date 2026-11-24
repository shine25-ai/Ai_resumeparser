"""
In-App Notifications and Notification Logging Service (Phase 11 - SRS 4.21).

Collections:
1. `notifications` (tenant-scoped): in-app alerts per user.
2. `notification_logs` (tenant-scoped): complete email dispatch audit trail.
"""

from typing import Any, Dict, List, Optional
from app.core.tenant import company_scope, current_company_id, system_scope
from app.utils.constants import (
    NOTIFICATIONS_COLLECTION,
    NOTIFICATION_LOGS_COLLECTION,
    USERS_COLLECTION,
)
from app.utils.helpers import generate_uuid, utc_now


class NotificationService:
    def __init__(self, db: Any):
        self.db = db

    # ── 1. In-App Notifications ──────────────────────────────────────────────

    async def create_notification(
        self,
        company_id: Optional[str] = None,
        user_id: Optional[str] = None,
        title: str = "",
        message: str = "",
        notification_type: str = "info",  # info, warning, application, interview, evaluation, approval, limit
        link: Optional[str] = None,
        roles: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Create in-app notification.
        If `user_id` is provided, delivers to that specific user.
        If `roles` is provided or user_id is None, fans out to all matching staff in the company.
        """
        cid = company_id or current_company_id()
        if not cid:
            return []

        # Find target user IDs
        target_user_ids: List[str] = []
        if user_id:
            target_user_ids.append(user_id)
        else:
            with system_scope():
                query: Dict[str, Any] = {"company_id": cid, "is_deleted": {"$ne": True}}
                if roles:
                    query["role"] = {"$in": roles}
                users = await self.db[USERS_COLLECTION].find(query, {"id": 1}).to_list(length=200)
                target_user_ids = [u["id"] for u in users if u.get("id")]

        if not target_user_ids:
            return []

        now = utc_now().isoformat()
        created_docs = []
        for uid in target_user_ids:
            doc = {
                "id": generate_uuid(),
                "company_id": cid,
                "user_id": uid,
                "title": title,
                "message": message,
                "type": notification_type,
                "link": link or "",
                "is_read": False,
                "created_at": now,
            }
            with system_scope():
                await self.db[NOTIFICATIONS_COLLECTION].insert_one(dict(doc))
            created_docs.append(doc)

        return created_docs

    async def list_notifications(
        self,
        user_id: str,
        company_id: Optional[str] = None,
        unread_only: bool = False,
        limit: int = 50,
    ) -> Dict[str, Any]:
        cid = company_id or current_company_id()
        query: Dict[str, Any] = {"user_id": user_id}
        if cid:
            query["company_id"] = cid
        if unread_only:
            query["is_read"] = False

        with system_scope():
            cursor = self.db[NOTIFICATIONS_COLLECTION].find(query).sort("created_at", -1).limit(limit)
            notifications = await cursor.to_list(length=limit)
            # Unread total count
            unread_count = await self.db[NOTIFICATIONS_COLLECTION].count_documents({
                "user_id": user_id,
                **({"company_id": cid} if cid else {}),
                "is_read": False,
            })

        for n in notifications:
            n.pop("_id", None)

        return {
            "notifications": notifications,
            "unread_count": unread_count,
        }

    async def mark_read(self, notification_id: str, user_id: str) -> Dict[str, Any]:
        with system_scope():
            await self.db[NOTIFICATIONS_COLLECTION].update_one(
                {"id": notification_id, "user_id": user_id},
                {"$set": {"is_read": True, "read_at": utc_now().isoformat()}},
            )
            doc = await self.db[NOTIFICATIONS_COLLECTION].find_one({"id": notification_id})
        if doc:
            doc.pop("_id", None)
            return doc
        return {"id": notification_id, "is_read": True}

    async def mark_all_read(self, user_id: str, company_id: Optional[str] = None) -> int:
        cid = company_id or current_company_id()
        query: Dict[str, Any] = {"user_id": user_id, "is_read": False}
        if cid:
            query["company_id"] = cid

        with system_scope():
            res = await self.db[NOTIFICATIONS_COLLECTION].update_many(
                query,
                {"$set": {"is_read": True, "read_at": utc_now().isoformat()}},
            )
            return getattr(res, "modified_count", 0)

    # ── 2. Notification Logs (Email Dispatch History) ─────────────────────────

    async def log_email(
        self,
        to_email: str,
        template: str,
        subject: str,
        status: str = "sent",  # sent, failed
        error: Optional[str] = None,
        company_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        cid = company_id or current_company_id()
        doc = {
            "id": generate_uuid(),
            "company_id": cid,
            "to_email": to_email,
            "template": template,
            "subject": subject,
            "status": status,
            "error": error or None,
            "created_at": utc_now().isoformat(),
        }
        with system_scope():
            await self.db[NOTIFICATION_LOGS_COLLECTION].insert_one(dict(doc))
        doc.pop("_id", None)
        return doc

    async def list_email_logs(
        self,
        company_id: Optional[str] = None,
        limit: int = 50,
        skip: int = 0,
    ) -> Dict[str, Any]:
        cid = company_id or current_company_id()
        query: Dict[str, Any] = {}
        if cid:
            query["company_id"] = cid

        with system_scope():
            cursor = self.db[NOTIFICATION_LOGS_COLLECTION].find(query).sort("created_at", -1).skip(skip).limit(limit)
            logs = await cursor.to_list(length=limit)
            total = await self.db[NOTIFICATION_LOGS_COLLECTION].count_documents(query)

        for l in logs:
            l.pop("_id", None)

        return {
            "logs": logs,
            "total": total,
        }

