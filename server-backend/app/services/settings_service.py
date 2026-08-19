from typing import Optional
from app.repositories.settings_repository import SettingsRepository
from app.models.settings import EmailConfigModel, AIConfigModel, AppConfigModel
from app.schemas.settings import EmailConfigCreate, EmailConfigResponse, AIConfigCreate, AIConfigResponse, AppConfigCreate, AppConfigResponse
from app.utils.encryption import encrypt_password

class SettingsService:
    def __init__(self):
        self.repository = SettingsRepository()
        
    async def get_email_config(self) -> Optional[EmailConfigResponse]:
        config = await self.repository.get_email_config()
        if not config:
            return None
            
        return EmailConfigResponse(
            smtp_server=config.smtp_server,
            smtp_port=config.smtp_port,
            smtp_username=config.smtp_username,
            sender_name=config.sender_name,
            sender_email=config.sender_email,
            use_tls=config.use_tls,
            use_ssl=config.use_ssl,
            smtp_password_set=bool(config.smtp_password)
        )

    async def save_email_config(self, config_data: EmailConfigCreate) -> EmailConfigResponse:
        encrypted_password = encrypt_password(config_data.smtp_password)
        
        model = EmailConfigModel(
            smtp_server=config_data.smtp_server,
            smtp_port=config_data.smtp_port,
            smtp_username=config_data.smtp_username,
            smtp_password=encrypted_password,
            sender_name=config_data.sender_name,
            sender_email=config_data.sender_email,
            use_tls=config_data.use_tls,
            use_ssl=config_data.use_ssl
        )
        
        saved_config = await self.repository.save_email_config(model)
        
        return EmailConfigResponse(
            smtp_server=saved_config.smtp_server,
            smtp_port=saved_config.smtp_port,
            smtp_username=saved_config.smtp_username,
            sender_name=saved_config.sender_name,
            sender_email=saved_config.sender_email,
            use_tls=saved_config.use_tls,
            use_ssl=saved_config.use_ssl,
            smtp_password_set=True
        )

    async def get_ai_config(self) -> Optional[AIConfigResponse]:
        config = await self.repository.get_ai_config()
        if not config:
            return None
            
        return AIConfigResponse(
            provider=config.provider,
            base_url=config.base_url,
            model_name=config.model_name,
            api_key_set=bool(config.api_key)
        )

    async def save_ai_config(self, config_data: AIConfigCreate) -> AIConfigResponse:
        encrypted_key = encrypt_password(config_data.api_key) if config_data.api_key else ""
        
        model = AIConfigModel(
            provider=config_data.provider,
            api_key=encrypted_key,
            base_url=config_data.base_url,
            model_name=config_data.model_name
        )
        
        saved_config = await self.repository.save_ai_config(model)
        
        return AIConfigResponse(
            provider=saved_config.provider,
            base_url=saved_config.base_url,
            model_name=saved_config.model_name,
            api_key_set=bool(saved_config.api_key)
        )

    async def get_app_config(self) -> Optional[AppConfigResponse]:
        config = await self.repository.get_app_config()
        if not config:
            return AppConfigResponse(enable_bulk_parsing=True, bulk_parsing_limit=5)
            
        return AppConfigResponse(
            enable_bulk_parsing=config.enable_bulk_parsing,
            bulk_parsing_limit=config.bulk_parsing_limit
        )

    async def save_app_config(self, config_data: AppConfigCreate) -> AppConfigResponse:
        model = AppConfigModel(
            enable_bulk_parsing=config_data.enable_bulk_parsing,
            bulk_parsing_limit=config_data.bulk_parsing_limit
        )
        
        saved_config = await self.repository.save_app_config(model)
        
        return AppConfigResponse(
            enable_bulk_parsing=saved_config.enable_bulk_parsing,
            bulk_parsing_limit=saved_config.bulk_parsing_limit
        )
