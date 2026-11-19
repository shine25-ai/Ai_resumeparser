from typing import Optional
from app.core.database import get_database
from app.core.tenant import system_scope
from app.models.settings import EmailConfigModel, AIConfigModel, AppConfigModel

class SettingsRepository:
    def __init__(self):
        self.collection = get_database().get_collection("settings")
    
    async def get_email_config(self) -> Optional[EmailConfigModel]:
        # Assuming we store a single document with type="email_config"
        doc = await self.collection.find_one({"type": "email_config"})
        if doc:
            return EmailConfigModel(**doc)
        return None

    async def save_email_config(self, config: EmailConfigModel) -> EmailConfigModel:
        config_dict = config.model_dump()
        config_dict["type"] = "email_config"
        
        await self.collection.update_one(
            {"type": "email_config"},
            {"$set": config_dict},
            upsert=True
        )
        return config

    # The AI provider settings belong to the platform (no company); email and app settings are per company.
    async def get_ai_config(self) -> Optional[AIConfigModel]:
        with system_scope():
            doc = await self.collection.find_one({"type": "ai_config", "company_id": None})
        if doc:
            return AIConfigModel(**doc)
        return None

    async def save_ai_config(self, config: AIConfigModel) -> AIConfigModel:
        config_dict = config.model_dump()
        config_dict["type"] = "ai_config"

        with system_scope():
            await self.collection.update_one(
                {"type": "ai_config", "company_id": None},
                {"$set": config_dict},
                upsert=True
            )
        return config

    async def get_app_config(self) -> Optional[AppConfigModel]:
        doc = await self.collection.find_one({"type": "app_config"})
        if doc:
            return AppConfigModel(**doc)
        return None

    async def save_app_config(self, config: AppConfigModel) -> AppConfigModel:
        config_dict = config.model_dump()
        config_dict["type"] = "app_config"
        
        await self.collection.update_one(
            {"type": "app_config"},
            {"$set": config_dict},
            upsert=True
        )
        return config
