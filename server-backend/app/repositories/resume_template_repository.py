from typing import List, Optional
from app.core.database import db_manager
from app.models.resume_template import ResumeTemplateDocument

class ResumeTemplateRepository:
    def __init__(self):
        self.collection = db_manager.get_db().get_collection("resume_templates")

    async def create(self, template: ResumeTemplateDocument) -> ResumeTemplateDocument:
        await self.collection.insert_one(template.to_dict())
        return template

    async def get_by_id(self, template_id: str) -> Optional[ResumeTemplateDocument]:
        doc = await self.collection.find_one({"id": template_id})
        if doc:
            return ResumeTemplateDocument(**doc)
        return None

    async def get_all(self) -> List[ResumeTemplateDocument]:
        cursor = self.collection.find({})
        templates = []
        async for doc in cursor:
            templates.append(ResumeTemplateDocument(**doc))
        return templates

    async def update(self, template_id: str, update_data: dict) -> Optional[ResumeTemplateDocument]:
        result = await self.collection.update_one(
            {"id": template_id}, {"$set": update_data}
        )
        if result.modified_count > 0 or result.matched_count > 0:
            return await self.get_by_id(template_id)
        return None

    async def delete(self, template_id: str) -> bool:
        result = await self.collection.delete_one({"id": template_id})
        return result.deleted_count > 0
