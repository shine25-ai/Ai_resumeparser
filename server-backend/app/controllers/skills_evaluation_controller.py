"""
SkillsEvaluation controller handling request routing payloads and responses wrapping.
"""

from typing import Optional
from fastapi import HTTPException, status
from app.services.skills_evaluation_service import SkillsEvaluationService
from app.schemas.skills_evaluation import SkillsEvaluationCreate
from app.utils.constants import ERROR_SKILLS_EVALUATION_NOT_FOUND


class SkillsEvaluationController:
    """Controller exposing handlers for skills evaluation endpoints."""

    def __init__(self, service: SkillsEvaluationService):
        self.service = service

    async def list_templates(
        self, search: Optional[str] = None, include_categories: bool = False, skip: int = 0, limit: int = 100
    ) -> dict:
        """List all templates, optionally filtered by search query and category inclusion."""
        templates = await self.service.list_templates(
            search=search, include_categories=include_categories, skip=skip, limit=limit
        )
        return {"success": True, "data": templates}

    async def get_template(self, skill_id: str) -> dict:
        """Get template by ID."""
        template = await self.service.get_template(skill_id)
        if not template:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=ERROR_SKILLS_EVALUATION_NOT_FOUND
            )
        return {"success": True, "data": template}

    async def save_template(self, payload: SkillsEvaluationCreate) -> dict:
        """Save (create/update) a template."""
        template = await self.service.save_template(payload)
        return {"success": True, "message": "Skills evaluation template saved successfully", "data": template}

    async def delete_template(self, skill_id: str) -> dict:
        """Delete a template."""
        success = await self.service.delete_template(skill_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=ERROR_SKILLS_EVALUATION_NOT_FOUND
            )
        return {"success": True, "message": "Skills evaluation template deleted successfully"}
