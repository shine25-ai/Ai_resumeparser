from typing import List, Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form, Query
from fastapi.responses import StreamingResponse
from app.schemas.resume_template import ResumeTemplateCreate, ResumeTemplateUpdate, ResumeTemplateResponse
from app.controllers.resume_template_controller import ResumeTemplateController
from app.core.dependencies import get_current_active_user

router = APIRouter(prefix="/api/v1/resume-templates", tags=["resume_templates"])

def get_controller():
    return ResumeTemplateController()

@router.get("", response_model=List[ResumeTemplateResponse])
async def list_templates(controller: ResumeTemplateController = Depends(get_controller)):
    return await controller.get_all_templates()

@router.get("/{template_id}", response_model=ResumeTemplateResponse)
async def get_template(template_id: str, controller: ResumeTemplateController = Depends(get_controller)):
    return await controller.get_template(template_id)

@router.post("", response_model=ResumeTemplateResponse)
async def create_template(
    data: ResumeTemplateCreate,
    current_user: dict = Depends(get_current_active_user),
    controller: ResumeTemplateController = Depends(get_controller)
):
    return await controller.create_template(data, current_user["id"])

@router.post("/upload", response_model=ResumeTemplateResponse)
async def upload_docx_template(
    name: str = Form(...),
    description: Optional[str] = Form(None),
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_active_user),
    controller: ResumeTemplateController = Depends(get_controller)
):
    return await controller.upload_docx_template(name, description, file, current_user["id"])

@router.put("/{template_id}", response_model=ResumeTemplateResponse)
async def update_template(
    template_id: str,
    data: ResumeTemplateUpdate,
    controller: ResumeTemplateController = Depends(get_controller)
):
    return await controller.update_template(template_id, data)

@router.delete("/{template_id}")
async def delete_template(template_id: str, controller: ResumeTemplateController = Depends(get_controller)):
    return await controller.delete_template(template_id)

from fastapi.responses import Response

@router.get("/{template_id}/export")
async def export_candidates(
    template_id: str,
    candidate_ids: List[str] = Query(...),
    format: str = Query("pdf"),
    controller: ResumeTemplateController = Depends(get_controller)
):
    mem_stream, filename, mime_type = await controller.export_candidates(template_id, candidate_ids, format)
    
    headers = {
        'Content-Disposition': f'attachment; filename="{filename}"'
    }
    return Response(content=mem_stream.getvalue(), media_type=mime_type, headers=headers)
