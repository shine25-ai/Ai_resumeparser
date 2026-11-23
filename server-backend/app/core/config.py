"""
Application configuration management utilizing Pydantic BaseSettings and dotenv file parsing.
"""

import os
from pathlib import Path
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    """Application Settings Schema."""

    APP_NAME: str = "AI Resume Parser Backend"
    APP_ENV: str = "development"
    DEBUG: bool = True

    @field_validator("DEBUG", mode="before")
    @classmethod
    def parse_debug(cls, v):
        if isinstance(v, str):
            if v.lower() in ("release", "prod", "production", "false", "0", "no"):
                return False
            if v.lower() in ("debug", "dev", "development", "true", "1", "yes"):
                return True
        return bool(v)

    HOST: str = "0.0.0.0"
    PORT: int = 8000

    DATABASE_URL: str = "mongodb://localhost:27017"
    DATABASE_NAME: str = "ai_resume_parser_db"

    SECRET_KEY: str = "super-secret-key-change-in-production-ai-resume-parser-2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 720
    REFRESH_TOKEN_EXPIRE_DAYS: int = 14

    DEFAULT_ADMIN_NAME: str = "Administrator"
    DEFAULT_ADMIN_EMAIL: str = "admin@example.com"
    DEFAULT_ADMIN_PASSWORD: str = "Admin@123"
    DEFAULT_ADMIN_ROLE: str = "admin"
    # Role permission checks on the API: "warn" logs a missing permission and lets the request through,
    # "enforce" refuses it. Start with "warn" on existing data, check the logs, then switch.
    PERMISSIONS_MODE: str = "warn"

    UPLOAD_FOLDER: str = "uploads"
    OPENAI_API_KEY: str = "sk-placeholder-api-key"
    AI_PARSER_URL: str = "http://localhost:8001/api/upload"
    # How long to wait for the AI parser: once it starts a resume (includes rate-limit waits),
    # and in total while the resume is still queued behind others
    AI_PARSER_POLL_TIMEOUT_SECONDS: int = 900
    AI_PARSER_QUEUE_TIMEOUT_SECONDS: int = 3600

    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "ap-south-1"
    AWS_BUCKET_NAME: str = "farm2bagv4live"
    S3_UR: str = "https://farm2bagv4live.s3.ap-south-1.amazonaws.com/"
    # New uploads are private; the API hands out signed links that expire (app.core.file_access).
    # Set to "public-read" only to go back to the old public URLs.
    S3_OBJECT_ACL: str = "private"
    FILE_LINK_TTL_MINUTES: int = 60
    # Public address of this API (e.g. https://api.example.com), used for logo links inside emails.
    # Empty: the address of the request that triggered the email.
    PUBLIC_API_BASE_URL: str = ""

    model_config = SettingsConfigDict(
        env_file=os.path.join(BASE_DIR, ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
