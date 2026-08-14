"""
Role repository for MongoDB database queries regarding Role entities.
"""

from typing import Any, Dict, Optional
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

        # Try matching by slug variants, ID, or name
        import re
        query = {
            "$or": [
                {"slug": clean_slug},
                {"slug": slug_underscore},
                {"slug": slug_hyphen},
                {"id": slug},
                {"name": {"$regex": f"^{re.escape(slug.strip())}$", "$options": "i"}},
            ]
        }
        return await self.find_one(query)

