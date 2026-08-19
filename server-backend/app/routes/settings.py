from fastapi import APIRouter, Depends
from typing import Optional
from app.schemas.settings import EmailConfigCreate, EmailConfigResponse
from app.controllers.settings_controller import SettingsController
from pydantic import BaseModel, EmailStr

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])

def get_controller():
    return SettingsController()

@router.get("/email", response_model=EmailConfigResponse)
async def get_email_config(controller: SettingsController = Depends(get_controller)):
    return await controller.get_email_config()

@router.put("/email", response_model=EmailConfigResponse)
async def update_email_config(
    config: EmailConfigCreate,
    controller: SettingsController = Depends(get_controller)
):
    return await controller.update_email_config(config)

class TestEmailRequest(BaseModel):
    email: EmailStr

@router.post("/email/test")
async def test_email_config(
    request: TestEmailRequest,
    controller: SettingsController = Depends(get_controller)
):
    return await controller.test_email_config(request.email)

from app.schemas.settings import AIConfigCreate, AIConfigResponse

@router.get("/ai", response_model=AIConfigResponse)
async def get_ai_config(controller: SettingsController = Depends(get_controller)):
    return await controller.get_ai_config()

@router.put("/ai", response_model=AIConfigResponse)
async def update_ai_config(
    config: AIConfigCreate,
    controller: SettingsController = Depends(get_controller)
):
    return await controller.update_ai_config(config)

@router.get("/ai/usage")
async def get_ai_usage(controller: SettingsController = Depends(get_controller)):
    return await controller.get_ai_usage()

from app.schemas.settings import AppConfigCreate, AppConfigResponse

@router.get("/app", response_model=AppConfigResponse)
async def get_app_config(controller: SettingsController = Depends(get_controller)):
    return await controller.get_app_config()

@router.put("/app", response_model=AppConfigResponse)
async def update_app_config(
    config: AppConfigCreate,
    controller: SettingsController = Depends(get_controller)
):
    return await controller.update_app_config(config)
