"""
Role repository for MongoDB database queries regarding Role entities.
"""

from typing import Any, Dict, List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.repositories.base_repository import BaseRepository
from app.utils.constants import ROLES_COLLECTION


class RoleRepository(BaseRepository):
    """Repository handling database operations for roles collection."""

    def __init__(self, db: AsyncIOMotorDatabase):
        super().__init__(db, ROLES_COLLECTION)

    async def get_by_slug(self, slug: str) -> Optional[Dict[str, Any]]:
        """Fetch role document by slug, name, or ID with flexible normalization."""
        if not slug:
            return None
        clean_slug = slug.strip().lower()
        slug_underscore = clean_slug.replace("-", "_")
        slug_hyphen = clean_slug.replace("_", "-")

        # Try matching by slug variants, ID, ObjectId, or name
        import re
        or_conds: List[Dict[str, Any]] = [
            {"slug": clean_slug},
            {"slug": slug_underscore},
            {"slug": slug_hyphen},
            {"id": slug.strip()},
            {"name": {"$regex": f"^{re.escape(slug.strip())}$", "$options": "i"}},
        ]
        if len(slug.strip()) == 24:
            try:
                from bson import ObjectId
                or_conds.append({"_id": ObjectId(slug.strip())})
            except Exception:
                pass

        return await self.find_one({"$or": or_conds})

    async def find_active_roles(self, skip: int = 0, limit: int = 100) -> List[Dict[str, Any]]:
        """Fetch active role documents excluding soft-deleted roles."""
        query = {"$or": [{"is_deleted": False}, {"is_deleted": {"$exists": False}}]}
        return await self.find_many(query=query, skip=skip, limit=limit, sort_by="created_at", descending=False)

    async def soft_delete(self, role_id: str) -> bool:
        """Soft delete role document by updating is_deleted flag."""
        from app.utils.helpers import utc_now
        result = await self.update(role_id, {"is_deleted": True, "updated_at": utc_now().isoformat()})
        return result is not None

