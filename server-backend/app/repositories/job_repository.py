"""
Repositories for job openings, job applications, and applicant email verification codes.
"""

from typing import Any, Dict
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.repositories.base_repository import BaseRepository
from app.utils.constants import (
    APPLICANT_VERIFICATIONS_COLLECTION,
    JOB_APPLICATIONS_COLLECTION,
    JOB_OPENINGS_COLLECTION,
)


class JobOpeningRepository(BaseRepository):
    def __init__(self, db: AsyncIOMotorDatabase):
        super().__init__(db, JOB_OPENINGS_COLLECTION)


class JobApplicationRepository(BaseRepository):
    def __init__(self, db: AsyncIOMotorDatabase):
        super().__init__(db, JOB_APPLICATIONS_COLLECTION)

    async def count_by_opening(self) -> Dict[str, int]:
        """Number of applications per opening id, computed in one aggregation."""
        pipeline = [{"$group": {"_id": "$opening_id", "count": {"$sum": 1}}}]
        counts: Dict[str, int] = {}
        async for row in self.collection.aggregate(pipeline):
            counts[row["_id"]] = row["count"]
        return counts


class ApplicantVerificationRepository(BaseRepository):
    def __init__(self, db: AsyncIOMotorDatabase):
        super().__init__(db, APPLICANT_VERIFICATIONS_COLLECTION)

    async def save_code(self, email: str, data: Dict[str, Any]) -> None:
        """Create or replace the pending code for an email."""
        await self.collection.update_one({"id": email}, {"$set": {**data, "id": email}}, upsert=True)
