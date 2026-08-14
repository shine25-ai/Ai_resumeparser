"""
Idempotent default admin user and default system roles bootstrap logic executed during startup.
"""

from motor.motor_asyncio import AsyncIOMotorDatabase
from loguru import logger
from app.core.config import settings
from app.core.security import hash_password
from app.utils.constants import ROLES_COLLECTION, USERS_COLLECTION, SKILLS_EVALUATION_COLLECTION
from app.utils.helpers import generate_uuid, utc_now


DEFAULT_SYSTEM_ROLES = [
    {
        "name": "Administrator",
        "slug": "admin",
        "description": "System administrator with full permissions across all tools and configurations.",
        "permissions": [
            "dashboard", "upload", "database", "evaluation",
            "jd-match", "interviews", "interview-dashboard",
            "client-feedback", "analytics", "settings", "role-management"
        ],
        "is_system": True,
    },
]



async def bootstrap_default_roles(db: AsyncIOMotorDatabase) -> None:
    """Idempotently create default system roles if absent in MongoDB."""
    roles_collection = db[ROLES_COLLECTION]
    for default_role in DEFAULT_SYSTEM_ROLES:
        existing = await roles_collection.find_one({"slug": default_role["slug"]})
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


async def bootstrap_default_skills(db: AsyncIOMotorDatabase) -> None:
    """Idempotently bootstrap default skills evaluations templates."""
    collection = db[SKILLS_EVALUATION_COLLECTION]
    count = await collection.count_documents({})
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
                "created_at": utc_now().isoformat(),
                "updated_at": utc_now().isoformat()
            }
            await collection.insert_one(doc)
            logger.info(f"Bootstrapped default skill evaluation template: {template['skill_name']}")


async def bootstrap_default_admin(db: AsyncIOMotorDatabase) -> None:
    """
    Check if default administrator exists in MongoDB users collection.
    If absent, create administrator account automatically.
    This operation is strictly idempotent.
    """
    await bootstrap_default_roles(db)
    await bootstrap_default_skills(db)

    users_collection = db[USERS_COLLECTION]

    # Ensure Collections and Indexes exist
    from app.utils.constants import RESUMES_COLLECTION, RESUME_LOGS_COLLECTION
    try:
        await db[RESUME_LOGS_COLLECTION].create_index([("resume_id", 1)])
        await db[RESUME_LOGS_COLLECTION].create_index([("email", 1)])
        await db[RESUMES_COLLECTION].create_index([("parsed_data.email", 1)])
        await db[ROLES_COLLECTION].create_index([("slug", 1)], unique=True)
        # Create index for skills evaluation skill_name
        await db[SKILLS_EVALUATION_COLLECTION].create_index([("skill_name", 1)], unique=True)
        logger.info(f"Initialized MongoDB collections '{RESUME_LOGS_COLLECTION}', '{RESUMES_COLLECTION}', and '{ROLES_COLLECTION}' with indexes.")
    except Exception as idx_err:
        logger.warning(f"Index initialization note: {idx_err}")

    admin_email = settings.DEFAULT_ADMIN_EMAIL.strip().lower()
    existing_admin = await users_collection.find_one({"email": admin_email})

    if existing_admin:
        logger.info(f"Default admin user '{admin_email}' already exists. Skipping bootstrap.")
        return

    logger.info(f"Default admin user '{admin_email}' not found. Initializing bootstrap administrator creation...")

    admin_document = {
        "id": generate_uuid(),
        "full_name": settings.DEFAULT_ADMIN_NAME,
        "email": admin_email,
        "password": hash_password(settings.DEFAULT_ADMIN_PASSWORD),
        "role": settings.DEFAULT_ADMIN_ROLE,
        "is_active": True,
        "created_at": utc_now().isoformat(),
        "updated_at": utc_now().isoformat(),
    }

    await users_collection.insert_one(admin_document)
    logger.info(f"Successfully bootstrapped default admin account for '{admin_email}' with role '{settings.DEFAULT_ADMIN_ROLE}'.")
