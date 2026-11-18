"""
Database initialization and connection management using AsyncIOMotorClient.
"""

from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from loguru import logger
from app.core.config import settings
from app.core.tenant import ScopedDatabase


class DatabaseManager:
    """Manages Motor Async MongoDB client lifecycle."""

    client: Optional[AsyncIOMotorClient] = None
    db: Optional[AsyncIOMotorDatabase] = None

    async def connect_to_database(self) -> None:
        """Establish connection to MongoDB using Motor async driver."""
        logger.info(f"Connecting to MongoDB database '{settings.DATABASE_NAME}'...")
        try:
            client_kwargs = {"serverSelectionTimeoutMS": 10000}
            url = settings.DATABASE_URL.lower()
            uses_tls = url.startswith("mongodb+srv://") or "tls=true" in url or "ssl=true" in url
            if uses_tls:  # a local MongoDB without TLS rejects tlsCAFile
                try:
                    import certifi
                    client_kwargs["tlsCAFile"] = certifi.where()
                except ImportError:
                    pass

            self.client = AsyncIOMotorClient(settings.DATABASE_URL, **client_kwargs)
            self.db = self.client[settings.DATABASE_NAME]
            # Verify connectivity
            await self.client.admin.command("ping")
            logger.info(f"Successfully connected to MongoDB database '{settings.DATABASE_NAME}'")
        except Exception as e:
            logger.error(
                f"Failed to connect to MongoDB at {settings.DATABASE_URL}. "
                "Please ensure MongoDB service is running locally or start it via Docker using `docker-compose up -d mongodb`."
            )
            raise e

    async def close_database_connection(self) -> None:
        """Close Motor MongoDB connection."""
        if self.client:
            logger.info("Closing MongoDB connection...")
            self.client.close()
            logger.info("MongoDB connection closed.")

    def get_db(self) -> AsyncIOMotorDatabase:
        """The database limited to the request's company (see app.core.tenant)."""
        return ScopedDatabase(self.get_raw_db())  # type: ignore[return-value]

    def get_raw_db(self) -> AsyncIOMotorDatabase:
        """Every company's data, with no company limits. Startup migrations only."""
        if self.db is None:
            raise RuntimeError("Database connection has not been initialized.")
        return self.db


db_manager = DatabaseManager()


def get_database() -> AsyncIOMotorDatabase:
    """FastAPI Dependency for obtaining the MongoDB database instance."""
    return db_manager.get_db()

async def get_next_sequence(db: AsyncIOMotorDatabase, name: str) -> int:
    """Atomically increment and return the next sequence number for a given name."""
    result = await db["counters"].find_one_and_update(
        {"_id": name},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True
    )
    return result["seq"]
