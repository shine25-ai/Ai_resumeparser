"""
InterviewType repository for MongoDB database queries regarding Interview Type entities.
"""

from typing import Any, Dict, List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.repositories.base_repository import BaseRepository
from app.utils.constants import INTERVIEW_TYPES_COLLECTION
from app.models.interview_type import InterviewTypeDocument
from app.utils.helpers import utc_now


DEFAULT_INTERVIEW_TYPES = [
    {
        "name": "Technical Round",
        "code": "TECHNICAL",
        "description": "Technical skill evaluation, live coding, and system concepts.",
        "color": "#4F46E5",
        "is_active": True,
        "is_system": True,
    },
    {
        "name": "HR Round",
        "code": "HR",
        "description": "Human resources evaluation, culture fit, and soft skills assessment.",
        "color": "#10B981",
        "is_active": True,
        "is_system": True,
    },
    {
        "name": "Managerial Round",
        "code": "MANAGERIAL",
        "description": "Managerial fit, leadership, problem solving, and project experience.",
        "color": "#F59E0B",
        "is_active": True,
        "is_system": True,
    },
    {
        "name": "Client Round",
        "code": "CLIENT",
        "description": "Client interview, stakeholder discussion, and project matching.",
        "color": "#8B5CF6",
        "is_active": True,
        "is_system": True,
    },
    {
        "name": "Screening Round",
        "code": "SCREENING",
        "description": "Initial recruiter screening and background verification.",
        "color": "#0EA5E9",
        "is_active": True,
        "is_system": True,
    },
]


class InterviewTypeRepository(BaseRepository):
    """Repository handling database operations for interview_types collection."""

    def __init__(self, db: AsyncIOMotorDatabase):
        super().__init__(db, INTERVIEW_TYPES_COLLECTION)

    async def seed_defaults_if_empty(self) -> None:
        """Seed default interview types if collection is empty."""
        active_count = await self.count({"$or": [{"is_deleted": False}, {"is_deleted": {"$exists": False}}]})
        if active_count == 0:
            for item in DEFAULT_INTERVIEW_TYPES:
                doc = InterviewTypeDocument(
                    name=item["name"],
                    code=item["code"],
                    description=item["description"],
                    color=item["color"],
                    is_active=item["is_active"],
                    is_system=item["is_system"],
                )
                await self.create(doc.to_dict())

    async def get_by_code(self, code: str) -> Optional[Dict[str, Any]]:
        """Fetch interview type document by code (case-insensitive)."""
        if not code:
            return None
        import re
        clean_code = code.strip().upper()
        return await self.find_one({
            "code": {"$regex": f"^{re.escape(clean_code)}$", "$options": "i"},
            "$or": [{"is_deleted": False}, {"is_deleted": {"$exists": False}}],
        })

    async def find_all_interview_types(
        self, skip: int = 0, limit: int = 100, include_inactive: bool = True
    ) -> List[Dict[str, Any]]:
        """Fetch list of all interview types (excluding soft-deleted)."""
        await self.seed_defaults_if_empty()
        query: Dict[str, Any] = {"$or": [{"is_deleted": False}, {"is_deleted": {"$exists": False}}]}
        if not include_inactive:
            query["is_active"] = True

        return await self.find_many(query=query, skip=skip, limit=limit, sort_by="created_at", descending=False)

    async def soft_delete(self, id_val: str) -> bool:
        """Soft delete interview type document by setting is_deleted flag."""
        result = await self.update(id_val, {"is_deleted": True, "updated_at": utc_now().isoformat()})
        return result is not None
