"""
InterviewType repository for MongoDB database queries regarding Interview Type entities.
"""

from typing import Any, Dict, List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.repositories.base_repository import BaseRepository
from app.utils.constants import INTERVIEW_TYPES_COLLECTION
from app.utils.helpers import utc_now


class InterviewTypeRepository(BaseRepository):
    """Repository handling database operations for interview_types collection."""

    def __init__(self, db: AsyncIOMotorDatabase):
        super().__init__(db, INTERVIEW_TYPES_COLLECTION)

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
        query: Dict[str, Any] = {"$or": [{"is_deleted": False}, {"is_deleted": {"$exists": False}}]}
        if not include_inactive:
            query["is_active"] = True

        return await self.find_many(query=query, skip=skip, limit=limit, sort_by="created_at", descending=False)

    async def soft_delete(self, id_val: str) -> bool:
        """Soft delete interview type document by setting is_deleted flag."""
        result = await self.update(id_val, {"is_deleted": True, "updated_at": utc_now().isoformat()})
        return result is not None
