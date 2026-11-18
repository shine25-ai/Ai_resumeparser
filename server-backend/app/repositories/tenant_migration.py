"""
One-time move of data from before company workspaces existed. Idempotent: it only touches documents with
no company yet, so it runs safely at every startup. Runs in system scope (no company limits).

- A company with no email domains gets the domain(s) its name matches among the users' work addresses
  (datapattern.ai -> DataPattern); Shinelogics keeps accepting any address. Users go to the company of their email domain; the rest go to the default
  company (Shinelogics). Emails stay unique platform-wide, so users are moved, never copied.
- Every resume, interview, template, setting and log with no company goes to the default company. The
  built-in roles stay shared (no company).
- Once (guarded by a marker): every other company gets its own copy of the default company's settings
  (email, app), mail templates, interview types, skills and custom roles (the careers page text names the
  company, so each company keeps its own), so all
  companies start with the same configuration and can then change it on their own.
- Once (guarded by a marker in `migrations`): a resume that belongs to several companies (uploaded by
  Shinelogics staff and/or applied through several careers pages) is split into one copy per company, so no
  company sees another's applicants. Interviews, logs and notes stay with the original copy.
- Child records (logs, interviews, meaning vectors) follow their resume's company.
- Unique indexes become unique per company.
"""

from typing import Any, Dict, List, Optional, Set

from loguru import logger
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING
from pymongo.errors import OperationFailure

from app.models.company import DEFAULT_COMPANY_ID, email_allowed
from app.utils.constants import (
    COMPANIES_COLLECTION,
    INTERVIEWS_COLLECTION,
    JOB_APPLICATIONS_COLLECTION,
    RESUME_LOGS_COLLECTION,
    RESUMES_COLLECTION,
    ROLES_COLLECTION,
    SKILLS_EVALUATION_COLLECTION,
    USERS_COLLECTION,
)
from app.utils.helpers import generate_uuid, utc_now

PUBLIC_APPLICANT_USER_ID = "public-applicant"
MEANING_COLLECTION = "resume_embeddings"

# Collections whose documents simply go to the default company.
DEFAULT_COMPANY_COLLECTIONS = [
    USERS_COLLECTION,
    SKILLS_EVALUATION_COLLECTION,
    "interview_types",
    "job_openings",
    "careers_page_settings",
    JOB_APPLICATIONS_COLLECTION,
    "integration_api_keys",
    "integration_api_logs",
    "mail_templates",
    "resume_templates",
]

# The AI provider settings are the platform's, not a company's.
PLATFORM_SETTING_TYPES = ["ai_config"]

NO_COMPANY = {"$or": [{"company_id": {"$exists": False}}, {"company_id": None}]}


async def _swap_unique_index(db: AsyncIOMotorDatabase, collection: str, field: str) -> None:
    """A unique `field` becomes unique per company."""
    coll = db[collection]
    try:
        info = await coll.index_information()
    except OperationFailure:
        info = {}
    old = f"{field}_1"
    if old in info and info[old].get("unique"):
        await coll.drop_index(old)
        logger.info(f"Tenancy: dropped platform-wide unique index {collection}.{old}")
    await coll.create_index([("company_id", ASCENDING), (field, ASCENDING)], unique=True)


def _companies_of(resume: Dict[str, Any]) -> List[str]:
    """The companies that should each hold a copy of this resume, the original's company first."""
    applied: List[str] = []
    for cid in [*(resume.get("company_ids") or []), *[j.get("company_id") for j in resume.get("applied_jobs") or []]]:
        if cid and cid not in applied:
            applied.append(cid)
    uploaded_by_staff = resume.get("user_id") not in (None, PUBLIC_APPLICANT_USER_ID)
    owners: List[str] = []
    if uploaded_by_staff or not applied:
        owners.append(DEFAULT_COMPANY_ID)
    owners += [c for c in applied if c not in owners]
    return owners


def _for_company(resume: Dict[str, Any], company_id: str) -> Dict[str, Any]:
    jobs = [j for j in resume.get("applied_jobs") or [] if j.get("company_id") == company_id]
    latest = jobs[-1] if jobs else {}
    return {
        "company_id": company_id,
        "company_ids": [company_id],
        "applied_jobs": jobs,
        "company_name": latest.get("company_name") if jobs else (resume.get("company_name") if resume.get("company_id") == company_id else None),
        "job_opening_id": latest.get("job_id"),
        "job_title": latest.get("job_title"),
    }


SPLIT_MARKER = "tenancy_resume_split_v1"


async def split_resumes(db: AsyncIOMotorDatabase) -> int:
    """
    Once: give each company its own copy of every resume from before workspaces (including resumes that
    already carry a careers-page company). Returns the number of copies made. Resumes created after this
    belong to one company from the start, so it never runs again.
    """
    if await db["migrations"].find_one({"_id": SPLIT_MARKER}):
        return 0
    resumes = db[RESUMES_COLLECTION]
    copies = 0
    async for resume in resumes.find({}):
        owners = _companies_of(resume)
        original_company = owners[0]
        await resumes.update_one({"_id": resume["_id"]}, {"$set": _for_company(resume, original_company)})

        for company_id in owners[1:]:
            clone = {k: v for k, v in resume.items() if k != "_id"}
            clone.update(_for_company(resume, company_id))
            clone.update(
                id=generate_uuid(),
                copied_from_resume_id=resume["id"],
                hr_updates=[],
                interview_assigned=False,
                interview_status="NOT_ASSIGNED",
                last_interview_assigned_date=None,
                latest_interview=None,
                redirect_id=None,
                category=None,
            )
            await resumes.insert_one(clone)
            await db[JOB_APPLICATIONS_COLLECTION].update_many(
                {"resume_id": resume["id"], "company_id": company_id}, {"$set": {"resume_id": clone["id"]}}
            )
            copies += 1
    await db["migrations"].insert_one({"_id": SPLIT_MARKER, "copies": copies, "done_at": utc_now().isoformat()})
    return copies


async def _resume_company(db: AsyncIOMotorDatabase, resume_id: Optional[str], cache: Dict[str, str]) -> str:
    if not resume_id:
        return DEFAULT_COMPANY_ID
    if resume_id not in cache:
        doc = await db[RESUMES_COLLECTION].find_one({"$or": [{"id": resume_id}, {"candidate_id": resume_id}]}, {"company_id": 1})
        cache[resume_id] = (doc or {}).get("company_id") or DEFAULT_COMPANY_ID
    return cache[resume_id]


async def _follow_resume(db: AsyncIOMotorDatabase, collection: str, link_fields: List[str], cache: Dict[str, str]) -> int:
    moved = 0
    async for doc in db[collection].find(NO_COMPANY, {k: 1 for k in ["_id", *link_fields]}):
        link = next((doc.get(f) for f in link_fields if doc.get(f)), None)
        company_id = await _resume_company(db, str(link) if link else None, cache)
        await db[collection].update_one({"_id": doc["_id"]}, {"$set": {"company_id": company_id}})
        moved += 1
    return moved


# Free mail providers are never a company's domain.
PUBLIC_MAIL_DOMAINS = {
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "outlook.com", "hotmail.com", "live.com",
    "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "rediffmail.com", "zoho.com", "yandex.com",
}


def _letters(value: str) -> str:
    return "".join(ch for ch in (value or "").lower() if ch.isalnum())


def _domain_matches_company(domain: str, company: Dict[str, Any]) -> bool:
    """'datapattern.ai' matches a company named 'DataPattern' or with slug 'data-pattern'."""
    stem = _letters(domain.split(".")[0])
    return bool(stem) and stem in {_letters(company.get("name", "")), _letters(company.get("slug", ""))}


async def assign_company_domains(db: AsyncIOMotorDatabase) -> int:
    """Fill email_domains for companies that have none, from the work addresses of existing users."""
    domains = set()
    async for user in db[USERS_COLLECTION].find({}, {"email": 1}):
        email = str(user.get("email") or "").lower()
        if "@" in email and email.split("@", 1)[1] not in PUBLIC_MAIL_DOMAINS:
            domains.add(email.split("@", 1)[1])
    changed = 0
    # Shinelogics (the default company) keeps accepting any address: its own super admin uses a public one.
    no_domains = {"$or": [{"email_domains": {"$exists": False}}, {"email_domains": []}]}
    async for company in db[COMPANIES_COLLECTION].find({**no_domains, "id": {"$ne": DEFAULT_COMPANY_ID}}):
        found = sorted(d for d in domains if _domain_matches_company(d, company))
        if found:
            await db[COMPANIES_COLLECTION].update_one({"_id": company["_id"]}, {"$set": {"email_domains": found}})
            changed += 1
    return changed


async def assign_users_by_domain(db: AsyncIOMotorDatabase) -> int:
    """A user with no company joins the company whose email domains include theirs."""
    companies = [c async for c in db[COMPANIES_COLLECTION].find({"email_domains": {"$ne": []}})]
    companies = [c for c in companies if c.get("email_domains")]
    moved = 0
    async for user in db[USERS_COLLECTION].find(NO_COMPANY, {"email": 1}):
        match = next((c for c in companies if email_allowed(c, str(user.get("email") or ""))), None)
        if match:
            await db[USERS_COLLECTION].update_one({"_id": user["_id"]}, {"$set": {"company_id": match["id"]}})
            moved += 1
    return moved


CONFIG_COPY_MARKER = "tenancy_config_copy_v1"
COMPANY_SETTING_TYPES = ["email_config", "app_config"]
# collection -> extra filter on the default company's documents to copy
SHARED_CONFIG = {
    "settings": {"type": {"$in": COMPANY_SETTING_TYPES}},
    "mail_templates": {},
    "resume_templates": {},
    "interview_types": {},
    SKILLS_EVALUATION_COLLECTION: {},
    ROLES_COLLECTION: {"is_system": {"$ne": True}},
}


async def copy_config_to_companies(db: AsyncIOMotorDatabase) -> int:
    """
    Once: give every other company its own copy of the default company's configuration. Interviews already
    in a company are pointed at that company's copy of their interview type.
    """
    if await db["migrations"].find_one({"_id": CONFIG_COPY_MARKER}):
        return 0
    copies = 0
    async for company in db[COMPANIES_COLLECTION].find({"id": {"$ne": DEFAULT_COMPANY_ID}}):
        cid = company["id"]
        for name, extra in SHARED_CONFIG.items():
            # A company that already has its own documents here keeps them.
            if await db[name].count_documents({"company_id": cid, **extra}):
                continue
            new_ids: Dict[str, str] = {}
            async for doc in db[name].find({"company_id": DEFAULT_COMPANY_ID, **extra}):
                clone = {k: v for k, v in doc.items() if k != "_id"}
                clone["company_id"] = cid
                if clone.get("id"):
                    clone["id"] = new_ids[str(doc["id"])] = generate_uuid()
                if name == ROLES_COLLECTION:
                    clone["company_name"] = company.get("name")
                await db[name].insert_one(clone)
                copies += 1
            if name == "interview_types":
                for old_id, new_id in new_ids.items():
                    await db[INTERVIEWS_COLLECTION].update_many(
                        {"company_id": cid, "interview_type_id": old_id}, {"$set": {"interview_type_id": new_id}}
                    )
    await db["migrations"].insert_one({"_id": CONFIG_COPY_MARKER, "copies": copies, "done_at": utc_now().isoformat()})
    return copies


async def migrate_to_companies(db: AsyncIOMotorDatabase) -> Dict[str, int]:
    """Run every step. `db` must be the raw database or run in system scope."""
    stats: Dict[str, int] = {}

    await _swap_unique_index(db, ROLES_COLLECTION, "slug")
    await _swap_unique_index(db, SKILLS_EVALUATION_COLLECTION, "skill_name")

    stats["company domains"] = await assign_company_domains(db)
    stats["users by domain"] = await assign_users_by_domain(db)
    stats["resume copies"] = await split_resumes(db)

    cache: Dict[str, str] = {}
    stats[RESUME_LOGS_COLLECTION] = await _follow_resume(db, RESUME_LOGS_COLLECTION, ["resume_id"], cache)
    stats[INTERVIEWS_COLLECTION] = await _follow_resume(db, INTERVIEWS_COLLECTION, ["resume_id", "candidate_id"], cache)
    stats[MEANING_COLLECTION] = await _follow_resume(db, MEANING_COLLECTION, ["_id"], cache)

    for name in DEFAULT_COMPANY_COLLECTIONS:
        result = await db[name].update_many(NO_COMPANY, {"$set": {"company_id": DEFAULT_COMPANY_ID}})
        stats[name] = result.modified_count

    # Custom roles go to the default company; the built-in roles stay shared.
    result = await db[ROLES_COLLECTION].update_many(
        {**NO_COMPANY, "is_system": {"$ne": True}}, {"$set": {"company_id": DEFAULT_COMPANY_ID}}
    )
    stats[ROLES_COLLECTION] = result.modified_count

    result = await db["settings"].update_many(
        {**NO_COMPANY, "type": {"$nin": PLATFORM_SETTING_TYPES}}, {"$set": {"company_id": DEFAULT_COMPANY_ID}}
    )
    stats["settings"] = result.modified_count

    stats["config copies"] = await copy_config_to_companies(db)

    changed = {k: v for k, v in stats.items() if v}
    if changed:
        logger.info(f"Tenancy: moved older data into company workspaces: {changed}")
    return stats
