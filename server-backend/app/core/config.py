"""
Application configuration management utilizing Pydantic BaseSettings and dotenv file parsing.
"""

import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    """Application Settings Schema."""

    APP_NAME: str = "AI Resume Parser Backend"
    APP_ENV: str = "development"
    DEBUG: bool = True

    HOST: str = "0.0.0.0"
    PORT: int = 8000

    DATABASE_URL: str = "mongodb://localhost:27017"
    DATABASE_NAME: str = "ai_resume_parser_db"

    SECRET_KEY: str = "super-secret-key-change-in-production-ai-resume-parser-2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    DEFAULT_ADMIN_NAME: str = "Administrator"
    DEFAULT_ADMIN_EMAIL: str = "admin@example.com"
    DEFAULT_ADMIN_PASSWORD: str = "Admin@123"
    DEFAULT_ADMIN_ROLE: str = "admin"

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

    model_config = SettingsConfigDict(
        env_file=os.path.join(BASE_DIR, ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
