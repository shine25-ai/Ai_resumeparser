"""
Custom exception definitions and global FastAPI exception handlers.
"""

from typing import Any, Dict, List, Optional
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from loguru import logger
from app.utils.response import error_response


class AppException(Exception):
    """Base application exception."""

    def __init__(self, message: str, status_code: int = status.HTTP_400_BAD_REQUEST, errors: Optional[List[Any]] = None):
        self.message = message
        self.status_code = status_code
        self.errors = errors or []
        super().__init__(message)


class AuthenticationError(AppException):
    """Raised when authentication credentials fail or token is invalid."""

    def __init__(self, message: str = "Authentication failed", errors: Optional[List[Any]] = None):
        super().__init__(message=message, status_code=status.HTTP_401_UNAUTHORIZED, errors=errors)


class AuthorizationError(AppException):
    """Raised when user lacks permission to access resource."""

    def __init__(self, message: str = "Permission denied", errors: Optional[List[Any]] = None):
        super().__init__(message=message, status_code=status.HTTP_403_FORBIDDEN, errors=errors)


class BadRequestError(AppException):
    """Raised when request payload or parameters are invalid."""

    def __init__(self, message: str = "Bad request", errors: Optional[List[Any]] = None):
        super().__init__(message=message, status_code=status.HTTP_400_BAD_REQUEST, errors=errors)


class ConflictError(AppException):
    """Raised when resource creation conflicts with existing state (e.g. duplicate key)."""

    def __init__(self, message: str = "Resource conflict", errors: Optional[List[Any]] = None):
        super().__init__(message=message, status_code=status.HTTP_409_CONFLICT, errors=errors)


class NotFoundError(AppException):
    """Raised when requested resource is not found."""

    def __init__(self, message: str = "Resource not found", errors: Optional[List[Any]] = None):
        super().__init__(message=message, status_code=status.HTTP_404_NOT_FOUND, errors=errors)


class FileUploadError(AppException):
    """Raised when file validation or upload fails."""

    def __init__(self, message: str = "File upload failed", errors: Optional[List[Any]] = None):
        super().__init__(message=message, status_code=status.HTTP_400_BAD_REQUEST, errors=errors)


class DatabaseError(AppException):
    """Raised when a MongoDB operation fails."""

    def __init__(self, message: str = "Database operation failed", errors: Optional[List[Any]] = None):
        super().__init__(message=message, status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, errors=errors)


def register_exception_handlers(app: FastAPI) -> None:
    """Register custom exception handlers on FastAPI application."""

    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException):
        logger.warning(f"AppException [{exc.status_code}] on {request.method} {request.url.path}: {exc.message}")
        return error_response(message=exc.message, errors=exc.errors, status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        logger.warning(f"ValidationError on {request.method} {request.url.path}: {exc.errors()}")
        formatted_errors = []
        for err in exc.errors():
            loc = " -> ".join([str(item) for item in err.get("loc", [])])
            msg = err.get("msg", "Invalid value")
            formatted_errors.append(f"{loc}: {msg}")
        return error_response(message="Validation failed", errors=formatted_errors, status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        logger.warning(f"HTTPException [{exc.status_code}] on {request.method} {request.url.path}: {exc.detail}")
        return error_response(message=str(exc.detail), status_code=exc.status_code)

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        logger.exception(f"Unhandled exception on {request.method} {request.url.path}")
        return error_response(message="Internal Server Error", errors=[str(exc)], status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)
