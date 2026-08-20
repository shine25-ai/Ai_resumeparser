"""
FastAPI router definition for skills evaluation CRUD endpoints.
"""

from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.core.database import get_database
from app.core.dependencies import get_current_active_user
from app.repositories.skills_evaluation_repository import SkillsEvaluationRepository
from app.services.skills_evaluation_service import SkillsEvaluationService
from app.controllers.skills_evaluation_controller import SkillsEvaluationController
from app.schemas.skills_evaluation import SkillsEvaluationCreate


router = APIRouter(prefix="/api/v1/skills-evaluations", tags=["Skills Evaluations"])


def get_skills_evaluation_controller(db: AsyncIOMotorDatabase = Depends(get_database)) -> SkillsEvaluationController:
    """Dependency injector for SkillsEvaluationController."""
    repo = SkillsEvaluationRepository(db)
    service = SkillsEvaluationService(repo)
    return SkillsEvaluationController(service)


@router.get(
    "",
    status_code=status.HTTP_200_OK,
    summary="List all skills evaluation templates",
)
async def list_templates(
    search: Optional[str] = Query(None, description="Search term for skill_name"),
    include_categories: bool = Query(False, description="Include categories array in response"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    controller: SkillsEvaluationController = Depends(get_skills_evaluation_controller),
    current_user: dict = Depends(get_current_active_user),
):
    return await controller.list_templates(
        search=search, include_categories=include_categories, skip=skip, limit=limit
    )


@router.get(
    "/{skill_id}",
    status_code=status.HTTP_200_OK,
    summary="Get skills evaluation template by ID",
)
async def get_template(
    skill_id: str,
    controller: SkillsEvaluationController = Depends(get_skills_evaluation_controller),
    current_user: dict = Depends(get_current_active_user),
):
    return await controller.get_template(skill_id)


@router.post(
    "",
    status_code=status.HTTP_200_OK,
    summary="Create or update a skills evaluation template",
)
async def save_template(
    payload: SkillsEvaluationCreate,
    controller: SkillsEvaluationController = Depends(get_skills_evaluation_controller),
    current_user: dict = Depends(get_current_active_user),
):
    return await controller.save_template(payload)


@router.delete(
    "/{skill_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a skills evaluation template",
)
async def delete_template(
    skill_id: str,
    controller: SkillsEvaluationController = Depends(get_skills_evaluation_controller),
    current_user: dict = Depends(get_current_active_user),
):
    return await controller.delete_template(skill_id)
