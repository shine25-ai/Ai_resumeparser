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
        """Fetch role document by slug."""
        return await self.find_one({"slug": slug.strip().lower()})
