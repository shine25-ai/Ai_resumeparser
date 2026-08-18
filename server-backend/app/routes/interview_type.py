"""
Interview Type management routes for retrieving, creating, updating, and deleting application interview types.
"""

from fastapi import APIRouter, Depends, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.controllers.interview_type_controller import InterviewTypeController
from app.core.database import get_database
from app.core.dependencies import get_current_active_user
from app.repositories.interview_type_repository import InterviewTypeRepository
from app.schemas.interview_type import InterviewTypeCreate, InterviewTypeUpdate
from app.services.interview_type_service import InterviewTypeService

router = APIRouter(prefix="/api/v1/interview-types", tags=["Interview Types"])


def get_interview_type_controller(
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> InterviewTypeController:
    """Dependency injector for InterviewTypeController."""
    repo = InterviewTypeRepository(db)
    service = InterviewTypeService(repo)
    return InterviewTypeController(service)


@router.get(
    "",
    status_code=status.HTTP_200_OK,
    summary="List all interview types",
    description="Retrieve list of all interview types.",
)
async def list_interview_types(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    include_inactive: bool = Query(True),
    current_user: dict = Depends(get_current_active_user),
    controller: InterviewTypeController = Depends(get_interview_type_controller),
):
    return await controller.list_interview_types(
        skip=skip, limit=limit, include_inactive=include_inactive
    )


@router.get(
    "/{id_val}",
    status_code=status.HTTP_200_OK,
    summary="Get interview type by ID",
    description="Retrieve detailed information for a specific interview type.",
)
async def get_interview_type(
    id_val: str,
    current_user: dict = Depends(get_current_active_user),
    controller: InterviewTypeController = Depends(get_interview_type_controller),
):
    return await controller.get_interview_type(id_val)


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="Create custom interview type",
    description="Create a new custom interview type.",
)
async def create_interview_type(
    payload: InterviewTypeCreate,
    current_user: dict = Depends(get_current_active_user),
    controller: InterviewTypeController = Depends(get_interview_type_controller),
):
    return await controller.create_interview_type(payload)


@router.put(
    "/{id_val}",
    status_code=status.HTTP_200_OK,
    summary="Update interview type details",
    description="Update metadata or active status of an existing interview type.",
)
async def update_interview_type(
    id_val: str,
    payload: InterviewTypeUpdate,
    current_user: dict = Depends(get_current_active_user),
    controller: InterviewTypeController = Depends(get_interview_type_controller),
):
    return await controller.update_interview_type(id_val, payload)


@router.delete(
    "/{id_val}",
    status_code=status.HTTP_200_OK,
    summary="Delete custom interview type",
    description="Soft delete a custom interview type. System default types cannot be deleted.",
)
async def delete_interview_type(
    id_val: str,
    current_user: dict = Depends(get_current_active_user),
    controller: InterviewTypeController = Depends(get_interview_type_controller),
):
    return await controller.delete_interview_type(id_val)
