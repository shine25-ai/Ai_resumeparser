"""
Integration API key management, request logging, and usage statistics.
"""

import hashlib
import secrets
from datetime import timedelta
from typing import Any, Dict, List, Optional
from loguru import logger
from app.core.exceptions import BadRequestError, NotFoundError
from app.repositories.integration_repository import IntegrationRepository
from app.utils.constants import INTEGRATION_KEY_PREFIX, INTEGRATION_LOG_RETENTION_DAYS
from app.utils.helpers import generate_uuid, utc_now


def hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def generate_api_key() -> str:
    return INTEGRATION_KEY_PREFIX + secrets.token_urlsafe(32)


def key_hint(raw_key: str) -> str:
    """Safe-to-show identifier for a key, e.g. 'rp_live_Ab12…'."""
    return raw_key[: len(INTEGRATION_KEY_PREFIX) + 4] if raw_key else ""


def endpoint_label(method: str, path: str) -> str:
    """Group integration paths into a few readable endpoint names."""
    tail = path.rstrip("/").split("/api/v1/integration", 1)[-1]
    if tail == "/resumes" and method == "POST":
        return "upload"
    if tail == "/resumes/lookup":
        return "lookup"
    if "/interviews" in tail:
        return "interviews"
    if tail.startswith("/resumes/") and tail.endswith("/status"):
        return "status"
    if tail.startswith("/resumes/"):
        return "profile"
    return "other"


class IntegrationService:
    def __init__(self, repo: IntegrationRepository):
        self.repo = repo

    # ── Global switch / overview ─────────────────────────────────────────────
    async def update_options(self, enabled: Optional[bool] = None, share_interview_results: Optional[bool] = None) -> Dict[str, Any]:
        if enabled is not None:
            await self.repo.set_enabled(enabled)
        if share_interview_results is not None:
            await self.repo.set_share_interview_results(share_interview_results)
        return await self.overview()

    async def overview(self) -> Dict[str, Any]:
        keys = await self.repo.list_keys()
        since = utc_now() - timedelta(hours=24)
        last_day = await self.repo.aggregate_logs([
            {"$match": {"created_at": {"$gte": since}}},
            {"$group": {
                "_id": None,
                "total": {"$sum": 1},
                "errors": {"$sum": {"$cond": [{"$gte": ["$status_code", 400]}, 1, 0]}},
            }},
        ])
        last_log = await self.repo.find_logs({}, skip=0, limit=1)
        day = last_day[0] if last_day else {"total": 0, "errors": 0}
        return {
            "enabled": await self.repo.is_enabled(),
            "share_interview_results": await self.repo.shares_interview_results(),
            "total_keys": len(keys),
            "active_keys": sum(1 for k in keys if k.get("is_active")),
            "requests_24h": day["total"],
            "errors_24h": day["errors"],
            "last_request_at": last_log[0]["created_at"] if last_log else None,
            "log_retention_days": INTEGRATION_LOG_RETENTION_DAYS,
        }

    # ── Keys ─────────────────────────────────────────────────────────────────
    async def list_keys(self) -> List[Dict[str, Any]]:
        return await self.repo.list_keys()

    async def create_key(self, name: str, description: Optional[str], created_by: Dict[str, Any]) -> Dict[str, Any]:
        name = (name or "").strip()
        if not name:
            raise BadRequestError("Key name is required.")
        raw_key = generate_api_key()
        doc = {
            "id": generate_uuid(),
            "name": name,
            "description": (description or "").strip() or None,
            "key_hash": hash_api_key(raw_key),
            "key_hint": key_hint(raw_key),
            "is_active": True,
            "request_count": 0,
            "last_used_at": None,
            "created_at": utc_now(),
            "created_by_name": created_by.get("full_name"),
            "created_by_email": created_by.get("email"),
        }
        await self.repo.create_key(doc)
        doc.pop("key_hash")
        # The plain key is only returned here; it is never stored.
        return {**doc, "api_key": raw_key}

    async def update_key(self, key_id: str, name: Optional[str], description: Optional[str], is_active: Optional[bool]) -> Dict[str, Any]:
        if not await self.repo.get_key(key_id):
            raise NotFoundError("API key not found.")
        fields: Dict[str, Any] = {"updated_at": utc_now()}
        if name is not None:
            if not name.strip():
                raise BadRequestError("Key name cannot be empty.")
            fields["name"] = name.strip()
        if description is not None:
            fields["description"] = description.strip() or None
        if is_active is not None:
            fields["is_active"] = is_active
        return await self.repo.update_key(key_id, fields)

    async def regenerate_key(self, key_id: str) -> Dict[str, Any]:
        if not await self.repo.get_key(key_id):
            raise NotFoundError("API key not found.")
        raw_key = generate_api_key()
        updated = await self.repo.update_key(key_id, {
            "key_hash": hash_api_key(raw_key),
            "key_hint": key_hint(raw_key),
            "regenerated_at": utc_now(),
        })
        return {**updated, "api_key": raw_key}

    async def delete_key(self, key_id: str) -> None:
        if not await self.repo.delete_key(key_id):
            raise NotFoundError("API key not found.")

    async def authenticate(self, raw_key: str) -> Optional[Dict[str, Any]]:
        """Return the active key matching raw_key, or None."""
        if not raw_key:
            return None
        key = await self.repo.find_by_hash(hash_api_key(raw_key))
        if not key or not key.get("is_active"):
            return None
        try:
            await self.repo.touch_key(key["id"], utc_now())
        except Exception as e:  # usage counters must never block a request
            logger.warning(f"Failed to update API key usage for '{key['id']}': {e}")
        return key

    # ── Logs ─────────────────────────────────────────────────────────────────
    async def record_request(self, entry: Dict[str, Any]) -> None:
        try:
            await self.repo.insert_log({"id": generate_uuid(), "created_at": utc_now(), **entry})
        except Exception as e:
            logger.warning(f"Failed to write integration API log: {e}")

    async def get_logs(
        self,
        page: int = 1,
        limit: int = 25,
        key_id: Optional[str] = None,
        outcome: Optional[str] = None,
        endpoint: Optional[str] = None,
    ) -> Dict[str, Any]:
        query: Dict[str, Any] = {}
        if key_id:
            query["key_id"] = key_id
        if endpoint:
            query["endpoint"] = endpoint
        if outcome == "success":
            query["status_code"] = {"$lt": 400}
        elif outcome == "error":
            query["status_code"] = {"$gte": 400}

        total = await self.repo.count_logs(query)
        logs = await self.repo.find_logs(query, skip=(page - 1) * limit, limit=limit)

        resume_ids = list({log["resume_id"] for log in logs if log.get("resume_id")})
        statuses = await self.repo.resume_statuses(resume_ids)
        for log in logs:
            log["resume"] = statuses.get(log.get("resume_id")) if log.get("resume_id") else None

        return {
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": max(1, -(-total // limit)),
            "logs": logs,
        }

    # ── Usage stats ──────────────────────────────────────────────────────────
    async def get_usage(self, days: int = 30, key_id: Optional[str] = None) -> Dict[str, Any]:
        now = utc_now()
        start_day = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
        match: Dict[str, Any] = {"created_at": {"$gte": start_day}}
        if key_id:
            match["key_id"] = key_id

        is_error = {"$gte": ["$status_code", 400]}
        result = await self.repo.aggregate_logs([
            {"$match": match},
            {"$facet": {
                "totals": [{"$group": {
                    "_id": None,
                    "total": {"$sum": 1},
                    "errors": {"$sum": {"$cond": [is_error, 1, 0]}},
                    "server_errors": {"$sum": {"$cond": [{"$gte": ["$status_code", 500]}, 1, 0]}},
                    "uploads": {"$sum": {"$cond": [
                        {"$and": [{"$eq": ["$endpoint", "upload"]}, {"$lt": ["$status_code", 400]}]}, 1, 0
                    ]}},
                    "avg_duration_ms": {"$avg": "$duration_ms"},
                }}],
                "daily": [
                    {"$group": {
                        "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
                        "total": {"$sum": 1},
                        "errors": {"$sum": {"$cond": [is_error, 1, 0]}},
                    }},
                ],
                "by_endpoint": [
                    {"$group": {"_id": "$endpoint", "total": {"$sum": 1}, "errors": {"$sum": {"$cond": [is_error, 1, 0]}}}},
                    {"$sort": {"total": -1}},
                ],
                "by_key": [
                    {"$group": {
                        "_id": "$key_id",
                        "key_name": {"$last": "$key_name"},
                        "total": {"$sum": 1},
                        "errors": {"$sum": {"$cond": [is_error, 1, 0]}},
                    }},
                    {"$sort": {"total": -1}},
                ],
            }},
        ])
        facets = result[0] if result else {}
        totals = (facets.get("totals") or [{}])[0]
        total = totals.get("total", 0)
        errors = totals.get("errors", 0)

        daily_map = {d["_id"]: d for d in facets.get("daily", [])}
        daily = []
        for i in range(days):
            day = (start_day + timedelta(days=i)).strftime("%Y-%m-%d")
            entry = daily_map.get(day, {})
            daily.append({
                "date": day,
                "success": entry.get("total", 0) - entry.get("errors", 0),
                "errors": entry.get("errors", 0),
            })

        return {
            "days": days,
            "total_requests": total,
            "successful_requests": total - errors,
            "failed_requests": errors,
            "server_errors": totals.get("server_errors", 0),
            "success_rate": round((total - errors) / total * 100, 1) if total else None,
            "resumes_uploaded": totals.get("uploads", 0),
            "avg_duration_ms": round(totals["avg_duration_ms"], 1) if totals.get("avg_duration_ms") is not None else None,
            "daily": daily,
            "by_endpoint": [{"endpoint": e["_id"], "total": e["total"], "errors": e["errors"]} for e in facets.get("by_endpoint", [])],
            "by_key": [
                {"key_id": k["_id"], "key_name": k.get("key_name") or "Unknown / invalid key", "total": k["total"], "errors": k["errors"]}
                for k in facets.get("by_key", [])
            ],
        }
