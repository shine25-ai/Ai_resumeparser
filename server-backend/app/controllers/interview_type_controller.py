"""
InterviewType controller handling HTTP requests for interview type management.
"""

from fastapi.responses import JSONResponse
from app.schemas.interview_type import InterviewTypeCreate, InterviewTypeUpdate
from app.services.interview_type_service import InterviewTypeService
from app.utils.response import success_response


class InterviewTypeController:
    """Controller orchestrating Interview Type management API endpoints."""

    def __init__(self, service: InterviewTypeService):
        self.service = service

    async def list_interview_types(
        self, skip: int = 0, limit: int = 100, include_inactive: bool = True
    ) -> JSONResponse:
        """Return list of all interview types."""
        types = await self.service.list_interview_types(
            skip=skip, limit=limit, include_inactive=include_inactive
        )
        type_list = [t.model_dump() for t in types]
        return success_response(
            data={"total": len(type_list), "interview_types": type_list},
            message="Interview types list retrieved successfully.",
        )

    async def get_interview_type(self, id_val: str) -> JSONResponse:
        """Return single interview type details by ID."""
        type_item = await self.service.get_interview_type(id_val)
        return success_response(
            data=type_item.model_dump(),
            message="Interview type details retrieved successfully.",
        )

    async def create_interview_type(self, payload: InterviewTypeCreate) -> JSONResponse:
        """Create a new custom interview type."""
        created = await self.service.create_interview_type(payload)
        return success_response(
            data=created.model_dump(),
            message="Interview type created successfully.",
            status_code=201,
        )

    async def update_interview_type(
        self, id_val: str, payload: InterviewTypeUpdate
    ) -> JSONResponse:
        """Update interview type details."""
        updated = await self.service.update_interview_type(id_val, payload)
        return success_response(
            data=updated.model_dump(),
            message="Interview type updated successfully.",
        )

    async def delete_interview_type(self, id_val: str) -> JSONResponse:
        """Delete interview type by ID."""
        await self.service.delete_interview_type(id_val)
        return success_response(
            data=None,
            message="Interview type deleted successfully.",
        )
