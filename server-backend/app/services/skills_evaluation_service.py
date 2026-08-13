"""
SkillsEvaluation service layer managing templates business logic.
"""

from typing import List, Optional
from app.repositories.skills_evaluation_repository import SkillsEvaluationRepository
from app.models.skills_evaluation import SkillsEvaluationDocument, CategoryWeightage
from app.schemas.skills_evaluation import SkillsEvaluationCreate
from app.utils.helpers import utc_now


class SkillsEvaluationService:
    """Service layer for business logic operations on SkillsEvaluation templates."""

    def __init__(self, repository: SkillsEvaluationRepository):
        self.repository = repository

    async def list_templates(self, skip: int = 0, limit: int = 100) -> List[dict]:
        """Retrieve all skills evaluation templates."""
        return await self.repository.find_many(skip=skip, limit=limit, sort_by="skill_name", descending=False)

    async def get_template(self, skill_id: str) -> Optional[dict]:
        """Get a single template by ID."""
        return await self.repository.get_by_id(skill_id)

    async def get_template_by_name(self, skill_name: str) -> Optional[dict]:
        """Get a single template by name."""
        return await self.repository.get_by_skill_name(skill_name)

    async def save_template(self, payload: SkillsEvaluationCreate) -> dict:
        """Create or update a skills evaluation template by skill name (upsert)."""
        existing = await self.repository.get_by_skill_name(payload.skill_name)

        categories_list = [
            CategoryWeightage(category=cat.category, weightage=cat.weightage)
            for cat in payload.categories
        ]

        if existing:
            # Update existing
            existing_doc = SkillsEvaluationDocument(**existing)
            existing_doc.categories = categories_list
            existing_doc.updated_at = utc_now().isoformat()
            updated = await self.repository.update(existing_doc.id, existing_doc.to_dict())
            return updated
        else:
            # Create new
            new_doc = SkillsEvaluationDocument(
                skill_name=payload.skill_name,
                categories=categories_list
            )
            created = await self.repository.create(new_doc.to_dict())
            return created

    async def delete_template(self, skill_id: str) -> bool:
        """Delete a skill template by ID."""
        return await self.repository.delete(skill_id)
