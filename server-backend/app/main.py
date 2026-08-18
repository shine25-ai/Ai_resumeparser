"""
Main FastAPI application entry point initializing lifespan, CORS, middlewares, routers, and exception handlers.
"""

import os
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.core.lifespan import lifespan
from app.middleware.request_logger import RequestLoggerMiddleware
from app.routes import auth, health, interview, resume, users, dashboard, roles
from app.routes import settings as settings_router
from app.routes import templates
from app.routes import transcription, skills_evaluation, resume_templates, interview_type


def create_application() -> FastAPI:
    """FastAPI Application Factory."""
    app = FastAPI(
        title=settings.APP_NAME,
        description="Production-ready FastAPI backend for AI Resume Parser with MongoDB Motor, JWT Auth, and PyMuPDF text extraction.",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    # Enable CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:8000",
            "http://127.0.0.1:8000",
        ],
        allow_origin_regex=r"https?://.*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],
    )

    # Enable Trusted Host Security Middleware
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=["*"],
    )

    # Enable Request Duration Logger Middleware
    app.add_middleware(RequestLoggerMiddleware)

    # Register Exception Handlers
    register_exception_handlers(app)

    # Mount Static directory safely
    static_dir = os.path.join(os.path.dirname(__file__), "static")
    os.makedirs(static_dir, exist_ok=True)
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

    # Include Routers
    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(users.router)
    app.include_router(roles.router)
    app.include_router(resume.router)
    app.include_router(interview.router)
    app.include_router(settings_router.router)
    app.include_router(templates.router)
    app.include_router(dashboard.router)
    app.include_router(transcription.router)
    app.include_router(skills_evaluation.router)
    app.include_router(resume_templates.router)
    app.include_router(interview_type.router)
    # ── Serve Frontend Static Files ──────────────────────────────────────────────
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dist_path = os.path.join(os.path.dirname(BASE_DIR), "dist")
    if not os.path.exists(dist_path):
        dist_path = os.path.join(BASE_DIR, "dist")

    dist_assets_path = os.path.join(dist_path, "assets")
    dist_index_path = os.path.join(dist_path, "index.html")

    if os.path.exists(dist_path):
        if os.path.exists(dist_assets_path):
            app.mount("/assets", StaticFiles(directory=dist_assets_path), name="assets")

        @app.get("/")
        def read_root():
            if os.path.exists(dist_index_path):
                return FileResponse(dist_index_path)
            raise HTTPException(status_code=404, detail="Frontend index.html not found")

        @app.get("/{catchall:path}")
        def read_index(catchall: str):
            # Do not capture API routes to avoid returning HTML for bad API calls
            if catchall.startswith(("api/", "health", "docs", "redoc", "openapi.json", "static/")):
                raise HTTPException(status_code=404, detail="Not Found")

            file_path = os.path.join(dist_path, catchall)
            if catchall and os.path.isfile(file_path):
                return FileResponse(file_path)

            if os.path.exists(dist_index_path):
                return FileResponse(dist_index_path)

            raise HTTPException(status_code=404, detail="Frontend index.html not found")

    return app


app = create_application()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )


