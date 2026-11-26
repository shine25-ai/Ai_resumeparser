"""
Central audit log (SRS 4.22): who did what, to which record, in which company, and when.

Company logs carry the company_id and are only seen by that company. Platform logs (the super admin's work on
companies, plans, platform master data) have company_id None and are only seen by the super admin; when they
concern one company, `target_company_id` says which.

Writing a log never fails the request: an error is logged and the request goes on.
"""

import csv
import io
import re
from typing import Any, Dict, List, Optional

from fastapi import Request
from loguru import logger
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.tenant import company_scope, current_company_id, system_scope
from app.utils.constants import AUDIT_LOGS_COLLECTION
from app.utils.helpers import generate_uuid, utc_now

SENSITIVE_FIELDS = frozenset({"password", "hashed_password", "token", "secret", "api_key", "smtp_password"})


def _actor(user: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    user = user or {}
    return {
        "id": user.get("id") or "system",
        "name": user.get("full_name") or user.get("name") or ("System" if not user else ""),
        "email": user.get("email") or "",
        "role": user.get("role") or "",
    }


def diff(before: Optional[Dict[str, Any]], after: Optional[Dict[str, Any]], fields: Optional[List[str]] = None) -> Dict[str, Any]:
    """{field: {"from": old, "to": new}} for changed fields. Secrets are masked."""
    before, after = before or {}, after or {}
    keys = fields or sorted(set(before) | set(after))
    out: Dict[str, Any] = {}
    for k in keys:
        if k in ("_id", "updated_at", "created_at"):
            continue
        if before.get(k) != after.get(k):
            masked = k in SENSITIVE_FIELDS
            out[k] = {"from": "***" if masked else before.get(k), "to": "***" if masked else after.get(k)}
    return out


async def record_audit(
    db: AsyncIOMotorDatabase,
    actor: Optional[Dict[str, Any]],
    action: str,
    entity_type: str,
    entity_id: str = "",
    entity_label: str = "",
    changes: Optional[Dict[str, Any]] = None,
    details: str = "",
    request: Optional[Request] = None,
    platform: bool = False,
    target_company_id: Optional[str] = None,
) -> None:
    """Write one audit entry: to the platform log (`platform=True`), else to `target_company_id`'s log,
    else to the request's company log."""
    try:
        doc: Dict[str, Any] = {
            "id": generate_uuid(),
            "action": action,
            "entity_type": entity_type,
            "entity_id": str(entity_id or ""),
            "entity_label": str(entity_label or "")[:200],
            "changes": changes or {},
            "details": str(details or "")[:1000],
            "actor": _actor(actor),
            "target_company_id": target_company_id,
            "ip": (request.client.host if request and request.client else ""),
            "user_agent": (request.headers.get("user-agent", "")[:300] if request else ""),
            "created_at": utc_now().isoformat(),
        }
        col = db[AUDIT_LOGS_COLLECTION]
        if platform:
            doc["company_id"] = None
            with system_scope():
                await col.insert_one(doc)
        elif target_company_id:
            with company_scope(target_company_id):
                await col.insert_one(doc)
        elif current_company_id():
            await col.insert_one(doc)
        else:
            doc["company_id"] = None
            with system_scope():
                await col.insert_one(doc)
    except Exception as e:  # never break the request over a log line
        logger.warning(f"Could not write audit log '{action}': {e}")


async def ensure_audit_indexes(db: AsyncIOMotorDatabase) -> None:
    col = db[AUDIT_LOGS_COLLECTION]
    await col.create_index([("company_id", 1), ("created_at", -1)])
    await col.create_index([("company_id", 1), ("action", 1), ("created_at", -1)])
    await col.create_index("id", unique=True)


def _query(
    action: str = "",
    actor: str = "",
    entity_type: str = "",
    start: str = "",
    end: str = "",
    search: str = "",
    target_company_id: str = "",
) -> Dict[str, Any]:
    q: Dict[str, Any] = {}
    if action:
        q["action"] = action
    if entity_type:
        # "master" also matches "master:department", "master:industry", ...
        q["entity_type"] = {"$regex": f"^{re.escape(entity_type)}(:|$)"}
    if actor:
        rx = {"$regex": re.escape(actor), "$options": "i"}
        q["$or"] = [{"actor.name": rx}, {"actor.email": rx}]
    if start or end:
        q["created_at"] = {**({"$gte": start} if start else {}), **({"$lte": end + ("T23:59:59.999" if len(end) == 10 else "")} if end else {})}
    if search:
        rx = {"$regex": re.escape(search), "$options": "i"}
        q.setdefault("$and", []).append({"$or": [{"entity_label": rx}, {"details": rx}, {"action": rx}]})
    if target_company_id:
        q["target_company_id"] = target_company_id
    return q


async def list_audit_logs(
    db: AsyncIOMotorDatabase, page: int = 1, limit: int = 50, platform: bool = False, **filters: str
) -> Dict[str, Any]:
    q = _query(**filters)
    col = db[AUDIT_LOGS_COLLECTION]
    if platform:
        q["company_id"] = None
        with system_scope():
            total = await col.count_documents(q)
            items = await col.find(q, {"_id": 0}).sort("created_at", -1).skip((page - 1) * limit).limit(limit).to_list(length=limit)
    else:
        total = await col.count_documents(q)
        items = await col.find(q, {"_id": 0}).sort("created_at", -1).skip((page - 1) * limit).limit(limit).to_list(length=limit)
    return {"items": items, "total": total, "page": page, "limit": limit}


def to_csv(items: List[Dict[str, Any]]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["When", "Action", "Record type", "Record", "By", "Email", "Role", "Details", "Changes", "IP"])
    for i in items:
        a = i.get("actor") or {}
        changes = "; ".join(f"{k}: {v.get('from')} → {v.get('to')}" for k, v in (i.get("changes") or {}).items())
        w.writerow([
            i.get("created_at", ""), i.get("action", ""), i.get("entity_type", ""), i.get("entity_label", ""),
            a.get("name", ""), a.get("email", ""), a.get("role", ""), i.get("details", ""), changes, i.get("ip", ""),
        ])
    return buf.getvalue()
