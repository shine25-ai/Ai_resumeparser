from typing import List, Optional
from fastapi import APIRouter, Depends, Form, UploadFile, File
from app.schemas.mail_template import MailTemplateCreate, MailTemplateUpdate, MailTemplateResponse
from app.controllers.template_controller import TemplateController
import json

from app.core.dependencies import get_current_active_user

# Logged-in users only (this router can also send test emails)
router = APIRouter(prefix="/api/v1/templates", tags=["mail_templates"], dependencies=[Depends(get_current_active_user)])

def get_controller():
    return TemplateController()

@router.get("", response_model=List[MailTemplateResponse])
async def list_templates(controller: TemplateController = Depends(get_controller)):
    return await controller.get_all_templates()

@router.get("/{template_id}", response_model=MailTemplateResponse)
async def get_template(template_id: str, controller: TemplateController = Depends(get_controller)):
    return await controller.get_template(template_id)

@router.post("", response_model=MailTemplateResponse)
async def create_template(data: MailTemplateCreate, controller: TemplateController = Depends(get_controller)):
    return await controller.create_template(data)

@router.put("/{template_id}", response_model=MailTemplateResponse)
async def update_template(template_id: str, data: MailTemplateUpdate, controller: TemplateController = Depends(get_controller)):
    return await controller.update_template(template_id, data)

@router.delete("/{template_id}")
async def delete_template(template_id: str, controller: TemplateController = Depends(get_controller)):
    return await controller.delete_template(template_id)

@router.post("/{template_id}/send-test")
async def send_test_email(
    template_id: str,
    to: str = Form(...),
    cc: Optional[str] = Form(None),
    bcc: Optional[str] = Form(None),
    attachments: Optional[List[UploadFile]] = File(None),
    controller: TemplateController = Depends(get_controller)
):
    to_emails = [email.strip() for email in to.split(",") if email.strip()]
    cc_emails = [email.strip() for email in cc.split(",") if email.strip()] if cc else []
    bcc_emails = [email.strip() for email in bcc.split(",") if email.strip()] if bcc else []
    
    return await controller.send_test_email(
        template_id=template_id,
        to_emails=to_emails,
        cc_emails=cc_emails,
        bcc_emails=bcc_emails,
        attachments=attachments
    )
