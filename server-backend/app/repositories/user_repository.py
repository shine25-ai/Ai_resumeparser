"""
User repository for MongoDB database queries regarding User entities.
"""

from typing import Any, Dict, List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.repositories.base_repository import BaseRepository
from app.utils.constants import USERS_COLLECTION


class UserRepository(BaseRepository):
    """Repository handling database operations for users collection."""

    def __init__(self, db: AsyncIOMotorDatabase):
        super().__init__(db, USERS_COLLECTION)

    async def get_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """Fetch active user document by normalized email address."""
        doc = await self.find_one({"email": email.strip().lower()})
        if doc and doc.get("is_deleted", False):
            return None
        return doc

    async def find_active_users(self, skip: int = 0, limit: int = 100) -> List[Dict[str, Any]]:
        """Fetch active user documents excluding soft-deleted users."""
        query = {"$or": [{"is_deleted": False}, {"is_deleted": {"$exists": False}}]}
        return await self.find_many(query=query, skip=skip, limit=limit, sort_by="created_at", descending=True)

    async def soft_delete(self, user_id: str) -> bool:
        """Soft delete user document by updating is_deleted flag and setting is_active to False."""
        from app.utils.helpers import utc_now
        result = await self.update(user_id, {"is_deleted": True, "is_active": False, "updated_at": utc_now().isoformat()})
        return result is not None

    async def update_password(self, user_id: str, new_hashed_password: str, updated_at: str) -> Optional[Dict[str, Any]]:
        """Update password hash for given user."""
        return await self.update(user_id, {"password": new_hashed_password, "updated_at": updated_at})
