"""
FastAPI application lifespan context manager managing startup and shutdown tasks.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from loguru import logger
from app.core.bootstrap import bootstrap_default_admin
from app.core.database import db_manager
from app.core.logging import setup_logging
from app.repositories.integration_repository import IntegrationRepository


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
    db = db_manager.get_db()

    await bootstrap_default_admin(db)

    try:
        await IntegrationRepository(db).ensure_indexes()
    except Exception as e:
        logger.warning(f"Could not create integration API indexes: {e}")

    logger.info("Application startup completed successfully.")

    yield

    logger.info("Initiating FastAPI Application Shutdown Lifespan...")
    await db_manager.close_database_connection()
    logger.info("Application shutdown complete.")
