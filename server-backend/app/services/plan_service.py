"""
Subscription plans (decision 10, Screen 22 "Subscription Plans & Billing"): a catalogue the super admin keeps,
e.g. Starter / Growth / Business / Enterprise, each with a monthly price, the features it lists and its limits.

A company's `plan` holds the plan code. Choosing a plan copies its limits onto the company (the super admin can
still change a company's limits by hand). Prices are shown only; payments come later (Phase 11).

Stored in `plans` (platform-wide, not per company).
"""

import re
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.company import CompanyLimits, slugify
from app.utils.constants import COMPANIES_COLLECTION
from app.utils.helpers import generate_uuid, utc_now

PLANS_COLLECTION = "plans"
CURRENCY = re.compile(r"^[A-Z]{3}$")


def clean_plan(data: Dict[str, Any], partial: bool = False) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    if "name" in data or not partial:
        name = str(data.get("name") or "").strip()[:60]
        if not name:
            raise BadRequestError("Plan name is required.")
        out["name"] = name
    if "code" in data and data["code"]:
        out["code"] = slugify(str(data["code"]))[:40]
    if "description" in data:
        out["description"] = str(data.get("description") or "").strip()[:300]
    if "monthly_price" in data:
        price = data.get("monthly_price")
        if price in (None, ""):
            out["monthly_price"] = None  # "Custom"
        else:
            try:
                out["monthly_price"] = round(float(price), 2)
            except (TypeError, ValueError):
                raise BadRequestError("Monthly price must be a number (leave it empty for a custom price).")
            if out["monthly_price"] < 0:
                raise BadRequestError("Monthly price cannot be negative.")
    if "currency" in data:
        cur = str(data.get("currency") or "INR").strip().upper()
        if not CURRENCY.match(cur):
            raise BadRequestError("Currency must be a 3-letter code such as INR.")
        out["currency"] = cur
    if "features" in data:
        feats = [str(f).strip()[:120] for f in (data.get("features") or []) if str(f).strip()]
        out["features"] = list(dict.fromkeys(feats))[:20]
    if "limits" in data and data["limits"] is not None:
        limits = dict(data["limits"])
        if any(int(v or 0) < 0 for v in limits.values()):
            raise BadRequestError("Limits cannot be negative (0 means no limit).")
        out["limits"] = CompanyLimits(**{k: int(v or 0) for k, v in limits.items()}).model_dump()
    if "is_active" in data:
        out["is_active"] = bool(data["is_active"])
    if "sort_order" in data:
        out["sort_order"] = int(data.get("sort_order") or 0)
    return out


class PlanService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.col = db[PLANS_COLLECTION]

    async def list(self, include_inactive: bool = True) -> List[Dict[str, Any]]:
        query: Dict[str, Any] = {} if include_inactive else {"is_active": True}
        plans = await self.col.find(query).sort("sort_order", 1).to_list(length=200)
        counts: Dict[str, int] = {}
        companies = await self.db[COMPANIES_COLLECTION].find({}, {"plan": 1, "archived_at": 1}).to_list(length=None)
        for c in companies:
            if c.get("plan") and not c.get("archived_at"):
                counts[c["plan"]] = counts.get(c["plan"], 0) + 1
        out = []
        for p in plans:
            p = {k: v for k, v in p.items() if k != "_id"}
            p["companies_count"] = counts.get(p["code"], 0)
            out.append(p)
        return out

    async def get(self, plan_id: str) -> Dict[str, Any]:
        plan = await self.col.find_one({"id": plan_id})
        if not plan:
            raise NotFoundError("Plan not found.")
        return {k: v for k, v in plan.items() if k != "_id"}

    async def by_code(self, code: str) -> Optional[Dict[str, Any]]:
        plan = await self.col.find_one({"code": code})
        return {k: v for k, v in plan.items() if k != "_id"} if plan else None

    async def create(self, data: Dict[str, Any]) -> Dict[str, Any]:
        clean = clean_plan(data)
        code = clean.get("code") or slugify(clean["name"])
        if not code:
            raise BadRequestError("The plan needs a code made of letters or numbers.")
        if await self.col.find_one({"code": code}):
            raise ConflictError(f"A plan with the code '{code}' already exists.")
        now = utc_now().isoformat()
        doc = {
            "id": generate_uuid(), "code": code, "description": "", "monthly_price": None, "currency": "INR",
            "features": [], "limits": CompanyLimits().model_dump(), "is_active": True, "sort_order": 0,
            **clean, "created_at": now, "updated_at": now,
        }
        doc["code"] = code
        await self.col.insert_one(dict(doc))
        return {**doc, "companies_count": 0}

    async def update(self, plan_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        current = await self.get(plan_id)
        clean = clean_plan(data, partial=True)
        if "code" in clean and clean["code"] != current["code"]:
            raise BadRequestError("A plan's code cannot change once companies may use it. Create a new plan instead.")
        clean["updated_at"] = utc_now().isoformat()
        await self.col.update_one({"id": plan_id}, {"$set": clean})
        return {**current, **clean}

    async def delete(self, plan_id: str) -> None:
        plan = await self.get(plan_id)
        if await self.db[COMPANIES_COLLECTION].find_one({"plan": plan["code"], "archived_at": None}):
            raise ConflictError("Companies are on this plan. Move them to another plan, or turn this one off instead.")
        await self.col.delete_one({"id": plan_id})

    async def limits_for(self, code: str) -> Optional[Dict[str, Any]]:
        plan = await self.by_code(code) if code else None
        return dict(plan["limits"]) if plan and plan.get("limits") else None
