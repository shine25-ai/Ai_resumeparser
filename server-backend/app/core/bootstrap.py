"""
Idempotent default admin user and default system roles bootstrap logic executed during startup.
"""

from motor.motor_asyncio import AsyncIOMotorDatabase
from loguru import logger
from app.core.config import settings
from app.core.security import hash_password
from app.utils.constants import ROLES_COLLECTION, USERS_COLLECTION, SKILLS_EVALUATION_COLLECTION
from app.utils.helpers import generate_uuid, utc_now
from app.models.company import DEFAULT_COMPANY_ID
from app.core.permissions import ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, DEFAULT_ROLES_INFO


_LEGACY_PAGES = ["dashboard", "upload", "database", "evaluation", "jd-match", "interviews", "analytics", "settings", "role-management"]

# Built-in roles, shared by every company (company_id None) and read-only for them. Companies copy one to make
# their own. Permissions are module:action pairs (app.core.permissions); the admin roles also keep the old
# page names so older screens keep working.
DEFAULT_SYSTEM_ROLES = [
    {
        "name": name,
        "slug": slug,
        "description": desc,
        "permissions": (DEFAULT_ROLE_PERMISSIONS[slug] + _LEGACY_PAGES) if slug == "admin" else DEFAULT_ROLE_PERMISSIONS[slug],
        "is_system": True,
    }
    for slug, name, desc in DEFAULT_ROLES_INFO
] + [
    {
        "name": "Super Admin",
        "slug": "superadmin",
        "description": "Platform owner: manages companies and can open any company's workspace.",
        "permissions": ALL_PERMISSIONS + _LEGACY_PAGES + ["companies"],
        "is_system": True,
    },
]


async def bootstrap_default_roles(db: AsyncIOMotorDatabase) -> None:
    """Idempotently create default system roles if absent in MongoDB."""
    roles_collection = db[ROLES_COLLECTION]
    for default_role in DEFAULT_SYSTEM_ROLES:
        existing = await roles_collection.find_one({"slug": default_role["slug"], "company_id": None})
        if not existing:
            role_doc = {
                "id": generate_uuid(),
                "name": default_role["name"],
                "slug": default_role["slug"],
                "description": default_role["description"],
                "permissions": default_role["permissions"],
                "is_system": True,
                "created_at": utc_now().isoformat(),
                "updated_at": utc_now().isoformat(),
            }
            await roles_collection.insert_one(role_doc)
            logger.info(f"Bootstrapped system role: {default_role['name']} ({default_role['slug']})")
        elif sorted(existing.get("permissions") or []) != sorted(default_role["permissions"]) or existing.get("name") != default_role["name"]:
            # Built-in roles follow the code: companies cannot change them, so updating them changes nobody's custom role.
            await roles_collection.update_one(
                {"slug": default_role["slug"], "company_id": None},
                {"$set": {
                    "name": default_role["name"],
                    "description": default_role["description"],
                    "permissions": default_role["permissions"],
                    "is_system": True,
                    "updated_at": utc_now().isoformat(),
                }},
            )
            logger.info(f"Updated system role permissions: {default_role['name']} ({default_role['slug']})")


async def bootstrap_default_skills(db: AsyncIOMotorDatabase, company_id: str = DEFAULT_COMPANY_ID) -> None:
    """Idempotently bootstrap a company's default skills evaluation templates."""
    collection = db[SKILLS_EVALUATION_COLLECTION]
    count = await collection.count_documents({"company_id": company_id})
    if count == 0:
        default_templates = [
            {
                "skill_name": "Java",
                "categories": [
                    {"category": "Core Java & OOP", "weightage": 25},
                    {"category": "Spring Framework / Boot", "weightage": 25},
                    {"category": "Data Structures & Collections", "weightage": 20},
                    {"category": "Concurrency & Multithreading", "weightage": 15},
                    {"category": "Database & SQL", "weightage": 15}
                ]
            },
            {
                "skill_name": "Python",
                "categories": [
                    {"category": "Python Syntax & Scripting", "weightage": 30},
                    {"category": "Web Frameworks (FastAPI/Django)", "weightage": 25},
                    {"category": "Database & SQL", "weightage": 15},
                    {"category": "Data Analysis & Libraries (Pandas/NumPy)", "weightage": 20},
                    {"category": "Testing & Debugging", "weightage": 10}
                ]
            },
            {
                "skill_name": "Angular",
                "categories": [
                    {"category": "TypeScript & ES6", "weightage": 25},
                    {"category": "Angular Core (Components, Directives, Pipes)", "weightage": 25},
                    {"category": "State Management & RxJS", "weightage": 20},
                    {"category": "Routing & API Integration", "weightage": 15},
                    {"category": "HTML5, CSS3 & Responsive Design", "weightage": 15}
                ]
            }
        ]
        for template in default_templates:
            doc = {
                "id": generate_uuid(),
                "skill_name": template["skill_name"],
                "categories": template["categories"],
                "company_id": company_id,
                "created_at": utc_now().isoformat(),
                "updated_at": utc_now().isoformat()
            }
            await collection.insert_one(doc)
            logger.info(f"Bootstrapped default skill evaluation template: {template['skill_name']}")


BUILT_IN_ADMIN_PASSWORD = "Admin@123"


BUILT_IN_SECRET_KEY = "super-secret-key-change-in-production-ai-resume-parser-2026"


def check_secret_key() -> None:
    """
    Refuse to run a shared (non-local) database with the SECRET_KEY published in this repository: anyone could
    sign tokens for any user, file links and applicant tokens. Set SECRET_KEY in the server's .env.
    """
    if settings.SECRET_KEY == BUILT_IN_SECRET_KEY and not _is_local_database():
        raise RuntimeError(
            "SECRET_KEY is the built-in default. Set a long random SECRET_KEY in the server's .env "
            "(for example: python -c 'import secrets; print(secrets.token_urlsafe(48))'). "
            "Changing it signs everyone out once; stored passwords are not affected (they use ENCRYPTION_KEY)."
        )


def _uses_public_default_password() -> bool:
    return settings.DEFAULT_ADMIN_PASSWORD == BUILT_IN_ADMIN_PASSWORD


def _is_local_database() -> bool:
    url = settings.DATABASE_URL.lower()
    return any(host in url for host in ("localhost", "127.0.0.1", "[::1]"))


async def bootstrap_default_admin(db: AsyncIOMotorDatabase) -> None:
    """
    Check if default administrator exists in MongoDB users collection.
    If absent, create administrator account automatically.
    This operation is strictly idempotent.
    """
    await bootstrap_default_roles(db)

    users_collection = db[USERS_COLLECTION]

    # Ensure Collections and Indexes exist
    from app.utils.constants import RESUMES_COLLECTION, RESUME_LOGS_COLLECTION
    try:
        await db[RESUME_LOGS_COLLECTION].create_index([("resume_id", 1)])
        await db[RESUME_LOGS_COLLECTION].create_index([("email", 1)])
        await db[RESUMES_COLLECTION].create_index([("parsed_data.email", 1)])
        await db[USERS_COLLECTION].create_index([("company_id", 1)])
        await db[RESUMES_COLLECTION].create_index([("company_id", 1), ("upload_date", -1)])
        # Unique per company: see app.repositories.tenant_migration
        logger.info(f"Initialized MongoDB collections '{RESUME_LOGS_COLLECTION}', '{RESUMES_COLLECTION}', and '{ROLES_COLLECTION}' with indexes.")
    except Exception as idx_err:
        logger.warning(f"Index initialization note: {idx_err}")

    admin_email = settings.DEFAULT_ADMIN_EMAIL.strip().lower()
    if _uses_public_default_password() and not _is_local_database():
        # A server started without DEFAULT_ADMIN_* would otherwise create (or promote) an admin whose
        # password is published in this repository, and make it the platform super admin.
        logger.warning(
            "DEFAULT_ADMIN_PASSWORD is the built-in default; skipping the default admin on a non-local "
            "database. Set DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_PASSWORD in the server's .env."
        )
        return
    existing_admin = await users_collection.find_one({"email": admin_email})

    if existing_admin:
        # The bootstrap admin is the platform super admin, in the default company.
        fix = {}
        if str(existing_admin.get("role", "")).lower() != "superadmin":
            fix["role"] = "superadmin"
        if not existing_admin.get("company_id"):
            fix["company_id"] = DEFAULT_COMPANY_ID
        if fix:
            await users_collection.update_one({"_id": existing_admin["_id"]}, {"$set": fix})
            logger.info(f"Default admin user '{admin_email}' is now the platform super admin.")
        return

    logger.info(f"Default admin user '{admin_email}' not found. Initializing bootstrap administrator creation...")

    admin_document = {
        "id": generate_uuid(),
        "full_name": settings.DEFAULT_ADMIN_NAME,
        "email": admin_email,
        "password": hash_password(settings.DEFAULT_ADMIN_PASSWORD),
        "role": "superadmin",
        "company_id": DEFAULT_COMPANY_ID,
        "is_active": True,
        "created_at": utc_now().isoformat(),
        "updated_at": utc_now().isoformat(),
    }

    await users_collection.insert_one(admin_document)
    logger.info(f"Successfully bootstrapped default admin account for '{admin_email}' as the platform super admin.")
