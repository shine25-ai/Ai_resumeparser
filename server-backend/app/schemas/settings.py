from pydantic import BaseModel, EmailStr
from typing import Optional

class EmailConfigBase(BaseModel):
    smtp_server: str
    smtp_port: int
    smtp_username: str
    sender_name: str
    sender_email: EmailStr
    use_tls: bool = True
    use_ssl: bool = False

class EmailConfigCreate(EmailConfigBase):
    smtp_password: str

class EmailConfigResponse(EmailConfigBase):
    smtp_password_set: bool  # Indicates if a password is saved, without returning the actual password

class AIConfigBase(BaseModel):
    provider: str  # 'groq', 'ollama', 'openrouter'
    base_url: Optional[str] = None
    model_name: str

class AIConfigCreate(AIConfigBase):
    api_key: Optional[str] = None

class AIConfigResponse(AIConfigBase):
    api_key_set: bool
