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

    async def search_by_skill_name(
        self, search: str, include_categories: bool = False, skip: int = 0, limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Search skills evaluation templates by partial skill_name (case-insensitive), optionally excluding categories."""
        projection = None if include_categories else {"categories": 0}

        if not search or not search.strip():
            return await self.find_many(
                projection=projection, skip=skip, limit=limit, sort_by="skill_name", descending=False
            )

        import re
        regex = re.compile(re.escape(search.strip()), re.IGNORECASE)
        return await self.find_many(
            query={"skill_name": {"$regex": regex}},
            projection=projection,
            skip=skip,
            limit=limit,
            sort_by="skill_name",
            descending=False,
        )
