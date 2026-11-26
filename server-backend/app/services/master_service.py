"""
Master data (SRS 4.20): skills, skill groups, job categories, industries, locations, education levels,
experience levels and departments.

Platform entries (company_id None) are set by the super admin and seen by every company. A company can add
its own entries of the same types; it sees both, and its own entry wins when the names match. Departments are
always a company's own.
"""

import re
from typing import Any, Dict, List

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.core.tenant import current_company_id, system_scope
from app.utils.constants import MASTERS_COLLECTION
from app.utils.helpers import generate_uuid, utc_now

MASTER_TYPES: Dict[str, str] = {
    "skill": "Skills",
    "skill_group": "Skill groups",
    "job_category": "Job categories",
    "industry": "Industries",
    "location": "Locations",
    "education_level": "Education levels",
    "experience_level": "Experience levels",
    "department": "Departments",
}
COMPANY_ONLY_TYPES = frozenset({"department"})

DEFAULT_MASTERS: Dict[str, List[str]] = {
    "industry": [
        "Information Technology", "Banking & Financial Services", "Healthcare", "Manufacturing", "Retail & E-commerce",
        "Education", "Telecommunications", "Consulting", "Logistics", "Media & Entertainment", "Government", "Other",
    ],
    "job_category": [
        "Engineering", "Data & Analytics", "Design", "Product", "Quality Assurance", "DevOps & Cloud", "Sales",
        "Marketing", "Human Resources", "Finance", "Operations", "Customer Support",
    ],
    "experience_level": ["Fresher (0-1 yrs)", "Junior (1-3 yrs)", "Mid (3-6 yrs)", "Senior (6-10 yrs)", "Lead (10+ yrs)"],
    "education_level": ["High School", "Diploma", "Bachelor's", "Master's", "Doctorate"],
    "skill_group": ["Programming Languages", "Frameworks", "Databases", "Cloud", "DevOps", "Testing", "Soft Skills"],
    "location": ["Chennai", "Bengaluru", "Hyderabad", "Pune", "Mumbai", "Delhi NCR", "Coimbatore", "Remote"],
}


def _key(name: str) -> str:
    return re.sub(r"\s+", " ", (name or "").strip()).lower()


def _out(doc: Dict[str, Any]) -> Dict[str, Any]:
    doc = {k: v for k, v in doc.items() if k != "_id"}
    doc["is_global"] = not doc.get("company_id")
    return doc


class MasterService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    @property
    def col(self):
        return self.db[MASTERS_COLLECTION]

    @staticmethod
    def _check_type(type_: str) -> str:
        if type_ not in MASTER_TYPES:
            raise BadRequestError(f"Unknown master type '{type_}'. Use one of: {', '.join(MASTER_TYPES)}.")
        return type_

    async def list(self, type_: str, include_inactive: bool = False, search: str = "") -> List[Dict[str, Any]]:
        """Platform + this company's entries (or only the platform's in system scope). Company entries win on name."""
        self._check_type(type_)
        query: Dict[str, Any] = {"type": type_}
        if not include_inactive:
            query["is_active"] = {"$ne": False}
        if search:
            query["key"] = {"$regex": re.escape(_key(search))}
        docs = await self.col.find(query).sort("name", 1).to_list(length=2000)
        by_key: Dict[str, Dict[str, Any]] = {}
        for d in docs:
            k = d.get("key") or _key(d.get("name", ""))
            if k not in by_key or d.get("company_id"):
                by_key[k] = d
        return sorted((_out(d) for d in by_key.values()), key=lambda d: d["name"].lower())

    async def create(self, type_: str, name: str, parent: str = "", global_entry: bool = False) -> Dict[str, Any]:
        self._check_type(type_)
        clean = re.sub(r"\s+", " ", (name or "").strip())
        if not clean or len(clean) > 120:
            raise BadRequestError("Name is required (up to 120 characters).")
        if global_entry and type_ in COMPANY_ONLY_TYPES:
            raise BadRequestError("Departments belong to a company, not the platform.")
        doc = {
            "id": generate_uuid(),
            "type": type_,
            "name": clean,
            "key": _key(clean),
            "parent": (parent or "").strip()[:120],
            "is_active": True,
            "created_at": utc_now().isoformat(),
            "updated_at": utc_now().isoformat(),
        }
        if global_entry:
            with system_scope():
                if await self.col.find_one({"type": type_, "key": doc["key"], "company_id": None}):
                    raise ConflictError(f"'{clean}' already exists.")
                doc["company_id"] = None
                await self.col.insert_one(doc)
        else:
            if not current_company_id():
                raise BadRequestError("Choose a company first.")
            existing = await self.col.find_one({"type": type_, "key": doc["key"]})
            if existing and existing.get("company_id"):
                raise ConflictError(f"'{clean}' already exists.")
            if existing and not existing.get("company_id"):
                raise ConflictError(f"'{clean}' is already in the platform list.")
            await self.col.insert_one(doc)
        return _out(doc)

    async def _own(self, master_id: str, global_entry: bool) -> Dict[str, Any]:
        if global_entry:
            with system_scope():
                doc = await self.col.find_one({"id": master_id, "company_id": None})
        else:
            doc = await self.col.find_one({"id": master_id})
            if doc and not doc.get("company_id"):
                raise BadRequestError("Platform entries can only be changed by the platform super admin.")
        if not doc:
            raise NotFoundError("Entry not found.")
        return doc

    async def update(self, master_id: str, changes: Dict[str, Any], global_entry: bool = False) -> Dict[str, Any]:
        doc = await self._own(master_id, global_entry)
        clean: Dict[str, Any] = {}
        if changes.get("name") is not None:
            name = re.sub(r"\s+", " ", str(changes["name"]).strip())
            if not name or len(name) > 120:
                raise BadRequestError("Name is required (up to 120 characters).")
            clean.update(name=name, key=_key(name))
        if changes.get("parent") is not None:
            clean["parent"] = str(changes["parent"]).strip()[:120]
        if changes.get("is_active") is not None:
            clean["is_active"] = bool(changes["is_active"])
        if not clean:
            return _out(doc)
        clean["updated_at"] = utc_now().isoformat()
        if global_entry:
            with system_scope():
                await self.col.update_one({"id": master_id, "company_id": None}, {"$set": clean})
        else:
            await self.col.update_one({"id": master_id}, {"$set": clean})
        return _out({**doc, **clean})

    async def delete(self, master_id: str, global_entry: bool = False) -> None:
        """Turns the entry off (kept so records that use it still show its name)."""
        await self.update(master_id, {"is_active": False}, global_entry)


async def bootstrap_masters(db: AsyncIOMotorDatabase) -> int:
    """Idempotent: adds the default platform entries that are missing. `db` must be raw or in system scope."""
    added = 0
    col = db[MASTERS_COLLECTION]
    await col.create_index([("company_id", 1), ("type", 1), ("key", 1)], unique=True)
    await col.create_index("id", unique=True)
    for type_, names in DEFAULT_MASTERS.items():
        for name in names:
            now = utc_now().isoformat()
            result = await col.update_one(
                {"company_id": None, "type": type_, "key": _key(name)},
                {"$setOnInsert": {
                    "id": generate_uuid(), "type": type_, "name": name, "key": _key(name), "parent": "",
                    "is_active": True, "company_id": None, "created_at": now, "updated_at": now,
                }},
                upsert=True,
            )
            added += 1 if result.upserted_id else 0
    return added


def master_types_payload() -> List[Dict[str, Any]]:
    return [{"id": t, "label": label, "company_only": t in COMPANY_ONLY_TYPES} for t, label in MASTER_TYPES.items()]
