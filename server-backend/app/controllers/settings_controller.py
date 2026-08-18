from fastapi import HTTPException
from app.services.settings_service import SettingsService
from app.schemas.settings import EmailConfigCreate, EmailConfigResponse
from app.utils.encryption import decrypt_password
import smtplib
from email.message import EmailMessage

class SettingsController:
    def __init__(self):
        self.service = SettingsService()

    async def get_email_config(self) -> EmailConfigResponse:
        config = await self.service.get_email_config()
        if not config:
            raise HTTPException(status_code=404, detail="Email configuration not found")
        return config

    async def update_email_config(self, config_data: EmailConfigCreate) -> EmailConfigResponse:
        return await self.service.save_email_config(config_data)

    async def test_email_config(self, email_to: str) -> dict:
        config_model = await self.service.repository.get_email_config()
        if not config_model:
            raise HTTPException(status_code=400, detail="Email configuration not set")
            
        try:
            password = decrypt_password(config_model.smtp_password)
            msg = EmailMessage()
            msg.set_content(f"This is a test email to verify your SMTP settings for AI Resume Parser.")
            msg["Subject"] = "Test Email Configuration"
            msg["From"] = f"{config_model.sender_name} <{config_model.sender_email}>"
            msg["To"] = email_to

            if config_model.use_ssl:
                server = smtplib.SMTP_SSL(config_model.smtp_server, config_model.smtp_port)
            else:
                server = smtplib.SMTP(config_model.smtp_server, config_model.smtp_port)
                if config_model.use_tls:
                    server.starttls()
            
            server.login(config_model.smtp_username, password)
            server.send_message(msg)
            server.quit()
            
            return {"status": "success", "message": "Test email sent successfully"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")

    async def get_ai_config(self) -> "AIConfigResponse":
        config = await self.service.get_ai_config()
        if not config:
            raise HTTPException(status_code=404, detail="AI configuration not found")
        return config

    async def update_ai_config(self, config_data: "AIConfigCreate") -> "AIConfigResponse":
        return await self.service.save_ai_config(config_data)

    async def get_ai_usage(self) -> dict:
        config_model = await self.service.repository.get_ai_config()
        if not config_model:
            raise HTTPException(status_code=400, detail="AI configuration not set")
            
        provider = config_model.provider
        
        # Local stats can be aggregated here in a complete implementation
        # For now, fetching provider specific usage if available
        if provider == "openrouter":
            import httpx
            api_key = decrypt_password(config_model.api_key) if config_model.api_key else ""
            if not api_key:
                return {"provider": provider, "message": "API Key not set for OpenRouter"}
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.get(
                        "https://openrouter.ai/api/v1/auth/key",
                        headers={"Authorization": f"Bearer {api_key}"}
                    )
                    response.raise_for_status()
                    data = response.json()
                    limit = data.get("data", {}).get("limit")
                    usage = data.get("data", {}).get("usage")
                    is_free_tier = data.get("data", {}).get("is_free_tier")
                    
                    return {
                        "provider": provider,
                        "limit": limit,
                        "usage": usage,
                        "remaining": limit - usage if limit is not None else "Unlimited",
                        "is_free_tier": is_free_tier
                    }
            except Exception as e:
                return {"provider": provider, "error": f"Failed to fetch OpenRouter usage: {str(e)}"}
        elif provider in ["groq", "ollama"]:
            from app.core.database import get_database
            db = get_database()
            pipeline = [
                {"$match": {"ai_evaluation.ai_metadata.provider": provider}},
                {"$group": {
                    "_id": None,
                    "total_prompt": {"$sum": "$ai_evaluation.token_usage.prompt_tokens"},
                    "total_completion": {"$sum": "$ai_evaluation.token_usage.completion_tokens"},
                    "total_tokens": {"$sum": "$ai_evaluation.token_usage.total_tokens"}
                }}
            ]
            result = await db["resumes"].aggregate(pipeline).to_list(1)
            usage_data = result[0] if result else {"total_prompt": 0, "total_completion": 0, "total_tokens": 0}
            
            latest_resume = await db["resumes"].find_one(
                {"ai_evaluation.rate_limits": {"$exists": True}, "ai_evaluation.ai_metadata.provider": provider},
                sort=[("_id", -1)]
            )
            latest_rate_limits = latest_resume.get("ai_evaluation", {}).get("rate_limits") if latest_resume else None
            
            groq_limits = {}
            if provider == "groq":
                try:
                    import httpx
                    api_key = decrypt_password(config_model.api_key) if config_model.api_key else ""
                    if api_key:
                        model = config_model.model_name or "gpt-oss:120b"
                        async with httpx.AsyncClient() as client:
                            response = await client.post(
                                "https://api.groq.com/openai/v1/chat/completions",
                                headers={"Authorization": f"Bearer {api_key}"},
                                json={"model": model, "messages": [{"role": "user", "content": "hi"}], "max_tokens": 1}
                            )
                            if response.status_code == 200:
                                headers = response.headers
                                groq_limits = {
                                    "limit_requests": headers.get("x-ratelimit-limit-requests"),
                                    "limit_tokens": headers.get("x-ratelimit-limit-tokens"),
                                    "remaining_requests": headers.get("x-ratelimit-remaining-requests"),
                                    "remaining_tokens": headers.get("x-ratelimit-remaining-tokens"),
                                    "reset_requests": headers.get("x-ratelimit-reset-requests"),
                                    "reset_tokens": headers.get("x-ratelimit-reset-tokens"),
                                }
                except Exception as e:
                    pass

            return {
                "provider": provider,
                "usage": usage_data.get("total_tokens", 0),
                "total_prompt": usage_data.get("total_prompt", 0),
                "total_completion": usage_data.get("total_completion", 0),
                "remaining": "See dashboard",
                "message": f"Local Usage: {usage_data.get('total_tokens', 0)} total tokens processed.",
                "groq_limits": groq_limits,
                "latest_rate_limits": latest_rate_limits
            }
            
        return {"provider": provider, "message": "Usage info not available for this provider."}
