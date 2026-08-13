"""
SkillsEvaluation repository for MongoDB database queries regarding SkillsEvaluation templates.
"""

from typing import Any, Dict, List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.repositories.base_repository import BaseRepository
from app.utils.constants import SKILLS_EVALUATION_COLLECTION


class SkillsEvaluationRepository(BaseRepository):
    """Repository handling database operations for skills_evaluations collection."""

    def __init__(self, db: AsyncIOMotorDatabase):
        super().__init__(db, SKILLS_EVALUATION_COLLECTION)

    async def get_by_skill_name(self, skill_name: str) -> Optional[Dict[str, Any]]:
        """Fetch skills evaluation template by skill name (case-insensitive)."""
        import re
        regex = re.compile(f"^{re.escape(skill_name)}$", re.IGNORECASE)
        return await self.find_one({"skill_name": {"$regex": regex}})
