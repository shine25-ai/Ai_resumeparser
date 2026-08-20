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

    async def list_templates(
        self, search: Optional[str] = None, include_categories: bool = False, skip: int = 0, limit: int = 100
    ) -> List[dict]:
        """Retrieve skills evaluation templates, optionally filtered by search term and excluding categories."""
        if search and search.strip():
            return await self.repository.search_by_skill_name(
                search=search, include_categories=include_categories, skip=skip, limit=limit
            )
        projection = None if include_categories else {"categories": 0}
        return await self.repository.find_many(
            projection=projection, skip=skip, limit=limit, sort_by="skill_name", descending=False
        )

    async def get_template(self, skill_id: str) -> Optional[dict]:
        """Get a single template by ID."""
        return await self.repository.get_by_id(skill_id)

    async def get_template_by_name(self, skill_name: str) -> Optional[dict]:
        """Get a single template by name."""
        return await self.repository.get_by_skill_name(skill_name)

    async def save_template(self, payload: SkillsEvaluationCreate) -> dict:
        """Create or update a skills evaluation template by skill name (upsert)."""
        existing = await self.repository.get_by_skill_name(payload.skill_name)

        # Deduplicate categories case-insensitively within this skill_name template
        seen_categories = set()
        categories_list = []
        for cat in payload.categories:
            cat_name_clean = cat.category.strip().lower()
            if cat_name_clean not in seen_categories:
                seen_categories.add(cat_name_clean)
                categories_list.append(
                    CategoryWeightage(category=cat.category.strip(), weightage=cat.weightage)
                )

        if existing:
            # Update existing
            existing_doc = SkillsEvaluationDocument(**existing)
            existing_doc.categories = categories_list
            existing_doc.updated_at = utc_now().isoformat()
            updated = await self.repository.update(existing_doc.id, existing_doc.to_dict())
            return updated or existing_doc.to_dict()
        else:
            # Create new
            new_doc = SkillsEvaluationDocument(
                skill_name=payload.skill_name.strip(),
                categories=categories_list
            )
            created = await self.repository.create(new_doc.to_dict())
            return created or new_doc.to_dict()

    async def delete_template(self, skill_id: str) -> bool:
        """Delete a skill template by ID."""
        return await self.repository.delete(skill_id)
