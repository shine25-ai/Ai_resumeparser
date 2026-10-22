"""
MongoDB access for integration API keys, request logs, and the integration on/off setting.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING
from app.utils.constants import (
    INTEGRATION_KEYS_COLLECTION,
    INTEGRATION_LOGS_COLLECTION,
    INTEGRATION_LOG_RETENTION_DAYS,
)

SETTINGS_COLLECTION = "settings"
INTEGRATION_SETTINGS_TYPE = "integration_config"


def _clean(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Drop Mongo's _id and mark stored datetimes as UTC (Mongo returns them without a timezone)."""
    if doc:
        doc.pop("_id", None)
        for field, value in doc.items():
            if isinstance(value, datetime) and value.tzinfo is None:
                doc[field] = value.replace(tzinfo=timezone.utc)
    return doc


class IntegrationRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.keys = db[INTEGRATION_KEYS_COLLECTION]
        self.logs = db[INTEGRATION_LOGS_COLLECTION]
        self.settings = db[SETTINGS_COLLECTION]

    async def ensure_indexes(self) -> None:
        await self.keys.create_index("id", unique=True)
        await self.keys.create_index("key_hash", unique=True)
        await self.logs.create_index([("created_at", DESCENDING)])
        await self.logs.create_index([("key_id", ASCENDING), ("created_at", DESCENDING)])
        # Old logs are removed automatically by MongoDB.
        await self.logs.create_index(
            "created_at",
            name="created_at_ttl",
            expireAfterSeconds=INTEGRATION_LOG_RETENTION_DAYS * 24 * 3600,
        )

    # ── Global on/off ────────────────────────────────────────────────────────
    async def is_enabled(self) -> bool:
        doc = await self.settings.find_one({"type": INTEGRATION_SETTINGS_TYPE})
        return bool(doc.get("enabled", True)) if doc else True

    async def set_enabled(self, enabled: bool) -> bool:
        await self.settings.update_one(
            {"type": INTEGRATION_SETTINGS_TYPE},
            {"$set": {"type": INTEGRATION_SETTINGS_TYPE, "enabled": enabled}},
            upsert=True,
        )
        return enabled

    # ── Keys ─────────────────────────────────────────────────────────────────
    async def create_key(self, doc: Dict[str, Any]) -> Dict[str, Any]:
        await self.keys.insert_one(dict(doc))
        return doc

    async def list_keys(self) -> List[Dict[str, Any]]:
        cursor = self.keys.find({}, {"key_hash": 0}).sort("created_at", DESCENDING)
        return [_clean(d) for d in await cursor.to_list(length=500)]

    async def get_key(self, key_id: str) -> Optional[Dict[str, Any]]:
        return _clean(await self.keys.find_one({"id": key_id}, {"key_hash": 0}))

    async def find_by_hash(self, key_hash: str) -> Optional[Dict[str, Any]]:
        return _clean(await self.keys.find_one({"key_hash": key_hash}))

    async def update_key(self, key_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        await self.keys.update_one({"id": key_id}, {"$set": fields})
        return await self.get_key(key_id)

    async def delete_key(self, key_id: str) -> bool:
        result = await self.keys.delete_one({"id": key_id})
        return result.deleted_count > 0

    async def touch_key(self, key_id: str, when: datetime) -> None:
        await self.keys.update_one({"id": key_id}, {"$set": {"last_used_at": when}, "$inc": {"request_count": 1}})

    # ── Logs ─────────────────────────────────────────────────────────────────
    async def insert_log(self, doc: Dict[str, Any]) -> None:
        await self.logs.insert_one(dict(doc))

    async def find_logs(self, query: Dict[str, Any], skip: int, limit: int) -> List[Dict[str, Any]]:
        cursor = self.logs.find(query).sort("created_at", DESCENDING).skip(skip).limit(limit)
        return [_clean(d) for d in await cursor.to_list(length=limit)]

    async def count_logs(self, query: Dict[str, Any]) -> int:
        return await self.logs.count_documents(query)

    async def aggregate_logs(self, pipeline: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return await self.logs.aggregate(pipeline).to_list(length=None)

    async def resume_statuses(self, resume_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        """Current parsing status of the resumes referenced by log entries."""
        if not resume_ids:
            return {}
        cursor = self.db["resumes"].find(
            {"id": {"$in": resume_ids}},
            {"id": 1, "candidate_id": 1, "status": 1, "parsed_data.full_name": 1},
        )
        found = {d["id"]: d for d in await cursor.to_list(length=len(resume_ids))}
        # Uploads merged into an existing candidate are deleted; follow resume_logs to the profile.
        missing = [rid for rid in resume_ids if rid not in found]
        if missing:
            async for log in self.db["resume_logs"].find({"temp_upload_id": {"$in": missing}}, {"temp_upload_id": 1, "resume_id": 1}):
                target = await self.db["resumes"].find_one(
                    {"id": log["resume_id"]}, {"id": 1, "candidate_id": 1, "status": 1, "parsed_data.full_name": 1}
                )
                if target:
                    found[log["temp_upload_id"]] = {**target, "merged": True}
        return {
            rid: {
                "resume_id": d.get("id"),
                "candidate_id": d.get("candidate_id"),
                "candidate_name": (d.get("parsed_data") or {}).get("full_name"),
                "parsing_status": d.get("status"),
                "merged": bool(d.get("merged")),
            }
            for rid, d in found.items()
        }
