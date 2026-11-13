"""
Companies repository, plus the one-time setup that moves data from before companies existed
to the default company.
"""

from typing import Any, Dict, Optional
from loguru import logger
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.models.company import DEFAULT_COMPANY_ID, default_company_doc
from app.repositories.base_repository import BaseRepository
from app.utils.constants import COMPANIES_COLLECTION, JOB_APPLICATIONS_COLLECTION, JOB_OPENINGS_COLLECTION


class CompanyRepository(BaseRepository):
    def __init__(self, db: AsyncIOMotorDatabase):
        super().__init__(db, COMPANIES_COLLECTION)

    async def get_by_slug(self, slug: str) -> Optional[Dict[str, Any]]:
        return await self.find_one({"slug": slug})

    async def ensure_default(self) -> Dict[str, Any]:
        doc = default_company_doc()
        await self.collection.update_one({"id": DEFAULT_COMPANY_ID}, {"$setOnInsert": doc}, upsert=True)
        return await self.get_by_id(DEFAULT_COMPANY_ID) or doc


async def bootstrap_companies(db: AsyncIOMotorDatabase) -> None:
    """
    Idempotent. Creates the default company, gives older roles and applications to it, and records the
    company and role on the resumes of older applications (including ones merged into an existing profile).
    """
    from app.repositories.resume_repository import ResumeRepository

    companies = CompanyRepository(db)
    await companies.collection.create_index("slug", unique=True)
    await companies.collection.create_index("id", unique=True)
    default = await companies.ensure_default()
    ref = {"company_id": default["id"], "company_name": default["name"]}

    roles = await db[JOB_OPENINGS_COLLECTION].update_many({"company_id": {"$exists": False}}, {"$set": ref})

    resumes = ResumeRepository(db)
    moved = 0
    async for application in db[JOB_APPLICATIONS_COLLECTION].find({"company_id": {"$exists": False}}):
        resume = await resumes.get_by_id(application["resume_id"])
        if resume:
            await add_application_to_resume(
                db, resume["id"], ref, application["opening_id"], application["opening_title"], application["submitted_at"]
            )
        await db[JOB_APPLICATIONS_COLLECTION].update_one({"_id": application["_id"]}, {"$set": ref})
        moved += 1

    if roles.modified_count or moved:
        logger.info(f"Companies: moved {roles.modified_count} role(s) and {moved} application(s) to '{default['name']}'")


async def add_application_to_resume(
    db: AsyncIOMotorDatabase, resume_id: str, company: Dict[str, str], job_id: str, job_title: str, applied_at: str
) -> None:
    """Record on a resume that the candidate applied for a role at a company. The latest one is also kept on top."""
    from app.utils.constants import RESUMES_COLLECTION

    entry = {**company, "job_id": job_id, "job_title": job_title, "applied_at": applied_at}
    await db[RESUMES_COLLECTION].update_one(
        {"id": resume_id},
        {
            "$set": {**company, "job_opening_id": job_id, "job_title": job_title},
            "$addToSet": {"company_ids": company["company_id"]},
            "$push": {"applied_jobs": entry},
        },
    )
