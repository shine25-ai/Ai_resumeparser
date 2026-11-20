"""
FastAPI application lifespan context manager managing startup and shutdown tasks.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from loguru import logger
from app.core.bootstrap import bootstrap_default_admin, bootstrap_default_skills
from app.repositories.tenant_migration import migrate_to_companies
from app.core.database import db_manager
from app.core.logging import setup_logging
from app.repositories.company_repository import bootstrap_companies
from app.repositories.integration_repository import IntegrationRepository
from datetime import timedelta
from app.core.config import settings
from app.utils.constants import RESUMES_COLLECTION
from app.utils.enums import ResumeStatus
from app.utils.helpers import utc_now


async def fail_interrupted_parses(db) -> int:
    """Parsing runs as an in-process background task, so a restart drops it and the resume would stay
    PENDING forever (gap G05). Mark PENDING resumes older than the parse timeout as FAILED."""
    max_age = settings.AI_PARSER_QUEUE_TIMEOUT_SECONDS + settings.AI_PARSER_POLL_TIMEOUT_SECONDS + 120
    cutoff = (utc_now() - timedelta(seconds=max_age)).isoformat()
    result = await db[RESUMES_COLLECTION].update_many(
        {"status": ResumeStatus.PENDING.value, "upload_date": {"$lt": cutoff}},
        {"$set": {"status": ResumeStatus.FAILED.value,
                  "parse_error": "Parsing was interrupted (server restart or timeout). Please upload the resume again."}},
    )
    if result.modified_count:
        logger.warning(f"Marked {result.modified_count} interrupted resume parse(s) as FAILED")
    return result.modified_count


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan context manager:
    - Sets up Loguru logging
    - Connects to MongoDB via Motor
    - Executes idempotent admin bootstrap
    - Yields application runtime execution
    - Gracefully closes database connection on shutdown
    """
    setup_logging()
    logger.info("Initializing FastAPI Application Startup Lifespan...")

    await db_manager.connect_to_database()
    # Startup jobs see every company's data (app.core.tenant); requests never inherit this.
    db = db_manager.get_raw_db()

    await bootstrap_default_admin(db)

    try:
        await IntegrationRepository(db).ensure_indexes()
    except Exception as e:
        logger.warning(f"Could not create integration API indexes: {e}")

    try:
        await bootstrap_companies(db)
    except Exception as e:
        logger.warning(f"Could not set up companies: {e}")

    try:
        await migrate_to_companies(db)
        await bootstrap_default_skills(db)
    except Exception as e:
        logger.error(f"Could not move older data into company workspaces: {e}")

    try:
        await fail_interrupted_parses(db)
    except Exception as e:
        logger.warning(f"Could not check for interrupted resume parses: {e}")

    # Warm up dashboard cache in the background so initial user requests are instant (< 5ms)
    try:
        import asyncio
        from app.services.dashboard_service import DashboardService
        asyncio.create_task(DashboardService().get_dashboard_metrics())
    except Exception as e:
        logger.warning(f"Could not warm dashboard cache: {e}")

    logger.info("Application startup completed successfully.")

    yield

    logger.info("Initiating FastAPI Application Shutdown Lifespan...")
    await db_manager.close_database_connection()
    logger.info("Application shutdown complete.")
