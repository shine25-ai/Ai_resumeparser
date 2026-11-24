"""
SaaS Plan Limits, Expiration, and Usage Metering Service (Phase 11 - SRS 4.19-4.22).

Enforces:
1. User limit (`limits.users`, 0 = unlimited)
2. Active published/reopened jobs limit (`limits.active_jobs`, 0 = unlimited)
3. Storage limit (`limits.storage_mb`, 0 = unlimited)
4. AI resume parses per month limit (`limits.ai_parses_per_month`, 0 = unlimited)
5. Subscription expiration (`plan_valid_until`): read-only workspace when past expiry.
6. 80% threshold warnings and notifications.
"""

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError
from app.core.tenant import company_scope, current_company_id, system_scope
from app.utils.constants import (
    COMPANIES_COLLECTION,
    JOB_OPENINGS_COLLECTION,
    RESUMES_COLLECTION,
    USERS_COLLECTION,
    USAGE_METERS_COLLECTION,
)
from app.utils.helpers import generate_uuid, utc_now


def current_month_key() -> str:
    """Format: YYYY-MM"""
    return utc_now().strftime("%Y-%m")


class LimitService:
    def __init__(self, db: Any):
        self.db = db

    async def get_company(self, company_id: Optional[str] = None) -> Dict[str, Any]:
        cid = company_id or current_company_id()
        if not cid:
            return {}
        with system_scope():
            company = await self.db[COMPANIES_COLLECTION].find_one({"id": cid})
        if not company:
            raise NotFoundError(f"Company '{cid}' not found.")
        return company

    def check_plan_active(self, company: Dict[str, Any]) -> None:
        """Verify the subscription plan has not expired. If expired, workspace is read-only."""
        valid_until = company.get("plan_valid_until")
        if not valid_until:
            return

        try:
            exp_date = datetime.strptime(str(valid_until).strip()[:10], "%Y-%m-%d").date()
            today = utc_now().date()
            if today > exp_date:
                plan_name = company.get("plan") or "Standard"
                raise ForbiddenError(
                    f"Your subscription plan ({plan_name}) expired on {valid_until}. "
                    "The workspace is currently in read-only mode. Please contact the administrator to renew."
                )
        except (ValueError, TypeError):
            pass

    async def check_users_limit(self, company_id: Optional[str] = None, extra: int = 0) -> None:
        company = await self.get_company(company_id)
        if not company:
            return
        self.check_plan_active(company)

        limits = company.get("limits") or {}
        limit = int(limits.get("users") or 0)
        if limit <= 0:
            return

        cid = company.get("id")
        with system_scope():
            used = await self.db[USERS_COLLECTION].count_documents({
                "company_id": cid,
                "is_deleted": {"$ne": True},
            })

        plan_name = company.get("plan") or "current"
        if used + extra >= limit:
            raise BadRequestError(
                f"User limit reached ({used}/{limit} users) on the {plan_name} plan. "
                "Upgrade your subscription plan or deactivate users to invite more."
            )

        # 80% check
        if (used + extra) >= int(limit * 0.8):
            await self._trigger_threshold_warning(cid, "users", used + extra, limit, plan_name)

    async def check_active_jobs_limit(self, company_id: Optional[str] = None, extra: int = 1) -> None:
        company = await self.get_company(company_id)
        if not company:
            return
        self.check_plan_active(company)

        limits = company.get("limits") or {}
        limit = int(limits.get("active_jobs") or 0)
        if limit <= 0:
            return

        cid = company.get("id")
        with system_scope():
            used = await self.db[JOB_OPENINGS_COLLECTION].count_documents({
                "company_id": cid,
                "status": "OPEN",
            })

        plan_name = company.get("plan") or "current"
        if used + extra > limit:
            raise BadRequestError(
                f"Active jobs limit reached ({used}/{limit} open jobs) on the {plan_name} plan. "
                "Close existing jobs or upgrade your plan to publish new openings."
            )

        if (used + extra) >= int(limit * 0.8):
            await self._trigger_threshold_warning(cid, "active jobs", used + extra, limit, plan_name)

    async def check_storage_limit(self, upload_bytes: int = 0, company_id: Optional[str] = None) -> None:
        company = await self.get_company(company_id)
        if not company:
            return
        self.check_plan_active(company)

        limits = company.get("limits") or {}
        limit_mb = int(limits.get("storage_mb") or 0)
        if limit_mb <= 0:
            return

        cid = company.get("id")
        month = current_month_key()
        meter = await self._get_or_create_meter(cid, month)
        current_bytes = int(meter.get("storage_bytes") or 0)

        limit_bytes = limit_mb * 1024 * 1024
        plan_name = company.get("plan") or "current"

        if (current_bytes + upload_bytes) > limit_bytes:
            raise BadRequestError(
                f"Storage limit reached ({limit_mb} MB) on the {plan_name} plan. "
                "Free up space or upgrade your subscription plan to upload more files."
            )

        if (current_bytes + upload_bytes) >= int(limit_bytes * 0.8):
            used_mb = round((current_bytes + upload_bytes) / (1024 * 1024), 1)
            await self._trigger_threshold_warning(cid, "storage", used_mb, limit_mb, plan_name)

    async def can_parse_ai(self, company_id: Optional[str] = None) -> bool:
        """Returns True if AI parse quota is available for this month, False if limit reached."""
        company = await self.get_company(company_id)
        if not company:
            return True

        limits = company.get("limits") or {}
        limit = int(limits.get("ai_parses_per_month") or 0)
        if limit <= 0:
            return True

        cid = company.get("id")
        month = current_month_key()
        meter = await self._get_or_create_meter(cid, month)
        used = int(meter.get("ai_parses") or 0)
        return used < limit

    async def record_ai_parse_or_raise(self, company_id: Optional[str] = None) -> None:
        """For staff actions: raises BadRequestError if limit reached."""
        company = await self.get_company(company_id)
        if not company:
            return
        self.check_plan_active(company)

        limits = company.get("limits") or {}
        limit = int(limits.get("ai_parses_per_month") or 0)
        cid = company.get("id")
        month = current_month_key()
        meter = await self._get_or_create_meter(cid, month)
        used = int(meter.get("ai_parses") or 0)

        plan_name = company.get("plan") or "current"
        if limit > 0 and used >= limit:
            raise BadRequestError(
                f"Monthly AI resume parsing limit reached ({used}/{limit} parses) on the {plan_name} plan. "
                "Limit resets on the 1st of next month, or contact your administrator to upgrade."
            )

        await self.increment_ai_parses(cid)

    async def increment_ai_parses(self, company_id: str) -> None:
        month = current_month_key()
        await self._get_or_create_meter(company_id, month)
        with system_scope():
            await self.db[USAGE_METERS_COLLECTION].update_one(
                {"company_id": company_id, "month": month},
                {"$inc": {"ai_parses": 1}, "$set": {"updated_at": utc_now().isoformat()}},
            )

    async def record_storage_bytes(self, company_id: str, bytes_delta: int) -> None:
        month = current_month_key()
        await self._get_or_create_meter(company_id, month)
        with system_scope():
            await self.db[USAGE_METERS_COLLECTION].update_one(
                {"company_id": company_id, "month": month},
                {"$inc": {"storage_bytes": bytes_delta}, "$set": {"updated_at": utc_now().isoformat()}},
            )

    async def get_usage_meters(self, company_id: Optional[str] = None) -> Dict[str, Any]:
        company = await self.get_company(company_id)
        cid = company.get("id")
        limits = company.get("limits") or {}
        plan_code = company.get("plan") or "custom"
        valid_until = company.get("plan_valid_until")

        # Expiration state
        is_expired = False
        if valid_until:
            try:
                exp_date = datetime.strptime(str(valid_until).strip()[:10], "%Y-%m-%d").date()
                is_expired = utc_now().date() > exp_date
            except Exception:
                pass

        # 1. Users count
        with system_scope():
            users_count = await self.db[USERS_COLLECTION].count_documents({
                "company_id": cid,
                "is_deleted": {"$ne": True},
            })

        # 2. Active open jobs
        with system_scope():
            jobs_count = await self.db[JOB_OPENINGS_COLLECTION].count_documents({
                "company_id": cid,
                "status": "OPEN",
            })

        # 3. Monthly meter (AI parses & storage)
        month = current_month_key()
        meter = await self._get_or_create_meter(cid, month)
        ai_parses = int(meter.get("ai_parses") or 0)
        storage_bytes = int(meter.get("storage_bytes") or 0)
        storage_mb = round(storage_bytes / (1024 * 1024), 2)

        # Limits
        u_lim = int(limits.get("users") or 0)
        j_lim = int(limits.get("active_jobs") or 0)
        s_lim = int(limits.get("storage_mb") or 0)
        ai_lim = int(limits.get("ai_parses_per_month") or 0)

        def calc_pct(used: float, lim: int) -> float:
            if lim <= 0:
                return 0.0
            return round(min(100.0, (used / lim) * 100.0), 1)

        return {
            "company_id": cid,
            "company_name": company.get("name", ""),
            "plan": plan_code,
            "plan_valid_until": valid_until,
            "is_expired": is_expired,
            "billing_mode": company.get("billing_mode", "manual"),
            "month": month,
            "users": {
                "used": users_count,
                "limit": u_lim,
                "pct": calc_pct(users_count, u_lim),
                "is_unlimited": u_lim <= 0,
            },
            "active_jobs": {
                "used": jobs_count,
                "limit": j_lim,
                "pct": calc_pct(jobs_count, j_lim),
                "is_unlimited": j_lim <= 0,
            },
            "storage_mb": {
                "used": storage_mb,
                "limit": s_lim,
                "pct": calc_pct(storage_mb, s_lim),
                "is_unlimited": s_lim <= 0,
            },
            "ai_parses": {
                "used": ai_parses,
                "limit": ai_lim,
                "pct": calc_pct(ai_parses, ai_lim),
                "is_unlimited": ai_lim <= 0,
            },
        }

    async def _get_or_create_meter(self, company_id: str, month: str) -> Dict[str, Any]:
        with system_scope():
            meter = await self.db[USAGE_METERS_COLLECTION].find_one({"company_id": company_id, "month": month})
            if not meter:
                meter = {
                    "id": f"meter_{company_id}_{month}",
                    "company_id": company_id,
                    "month": month,
                    "ai_parses": 0,
                    "storage_bytes": 0,
                    "created_at": utc_now().isoformat(),
                    "updated_at": utc_now().isoformat(),
                }
                await self.db[USAGE_METERS_COLLECTION].insert_one(dict(meter))
            return meter

    async def _trigger_threshold_warning(self, company_id: str, resource_name: str, used: Any, limit: Any, plan: str):
        """Send notification when resource reaches 80% limit."""
        from app.services.notification_service import NotificationService
        ns = NotificationService(self.db)
        await ns.create_notification(
            company_id=company_id,
            title=f"{resource_name.capitalize()} Limit Warning (80%)",
            message=f"Your company has reached {used}/{limit} of allowed {resource_name} on the {plan} plan.",
            notification_type="warning",
            link="/settings?tab=usage",
        )

