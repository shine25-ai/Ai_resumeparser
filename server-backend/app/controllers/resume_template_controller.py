import os
import zipfile
from typing import List, Optional, Tuple
from fastapi import HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
import io
import tempfile
from loguru import logger
from app.models.resume_template import ResumeTemplateDocument
from app.schemas.resume_template import ResumeTemplateCreate, ResumeTemplateUpdate
from app.repositories.resume_template_repository import ResumeTemplateRepository
from app.repositories.resume_repository import ResumeRepository
from app.core.database import db_manager
from jinja2 import Template
from docxtpl import DocxTemplate
import weasyprint
from app.utils.helpers import utc_now

import uuid

class ResumeTemplateController:
    def __init__(self):
        self.repository = ResumeTemplateRepository()
        self.resume_repository = ResumeRepository(db_manager.get_db())
        
        # Ensure uploads folder exists
        self.template_dir = os.path.join(os.getcwd(), "uploads", "templates")
        os.makedirs(self.template_dir, exist_ok=True)

    async def create_template(self, data: ResumeTemplateCreate, user_id: str) -> ResumeTemplateDocument:
        template = ResumeTemplateDocument(
            name=data.name,
            description=data.description,
            type=data.type,
            content=data.content,
            created_by_user_id=user_id,
        )
        return await self.repository.create(template)

    async def upload_docx_template(self, name: str, description: Optional[str], file: UploadFile, user_id: str) -> ResumeTemplateDocument:
        if not file.filename.endswith(".docx"):
            raise HTTPException(status_code=400, detail="Only .docx files are allowed")
            
        template_id = str(uuid.uuid4())
        file_path = os.path.join(self.template_dir, f"{template_id}.docx")
        
        with open(file_path, "wb") as f:
            f.write(await file.read())
            
        template = ResumeTemplateDocument(
            id=template_id,
            name=name,
            description=description,
            type="docx",
            file_path=file_path,
            created_by_user_id=user_id,
        )
        return await self.repository.create(template)

    async def get_all_templates(self) -> List[ResumeTemplateDocument]:
        return await self.repository.get_all()

    async def get_template(self, template_id: str) -> ResumeTemplateDocument:
        template = await self.repository.get_by_id(template_id)
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        return template

    async def update_template(self, template_id: str, data: ResumeTemplateUpdate) -> ResumeTemplateDocument:
        template = await self.get_template(template_id)
        update_data = data.model_dump(exclude_unset=True)
        update_data["updated_at"] = utc_now().isoformat()
        updated = await self.repository.update(template_id, update_data)
        if not updated:
            raise HTTPException(status_code=500, detail="Failed to update template")
        return updated

    async def delete_template(self, template_id: str) -> dict:
        template = await self.get_template(template_id)
        
        if template.type == "docx" and template.file_path and os.path.exists(template.file_path):
            os.remove(template.file_path)
            
        deleted = await self.repository.delete(template_id)
        if not deleted:
            raise HTTPException(status_code=500, detail="Failed to delete template")
        return {"message": "Template deleted successfully"}

    async def export_candidates(self, template_id: str, candidate_ids: List[str], format: str) -> Tuple[io.BytesIO, str, str]:
        template = await self.get_template(template_id)
        
        if format not in ["pdf", "docx"]:
            raise HTTPException(status_code=400, detail="Invalid format. Supported: pdf, docx")
            
        if template.type == "docx" and format == "pdf":
            raise HTTPException(status_code=400, detail="Cannot export DOCX template as PDF yet.")
        if template.type == "html" and format == "docx":
            raise HTTPException(status_code=400, detail="Cannot export HTML template as DOCX.")

        exported_files = []
        
        for cid in candidate_ids:
            resume_doc = await self.resume_repository.get_by_id(cid)
            logger.info(f"[EXPORT] candidate_id={cid!r}, found={resume_doc is not None}")
            if not resume_doc:
                logger.warning(f"[EXPORT] No resume found for candidate_id={cid!r}")
                continue
            
            candidate_data = resume_doc.get("parsed_data", {})
            logger.info(f"[EXPORT] candidate_data keys={list(candidate_data.keys()) if candidate_data else 'EMPTY'}")
            logger.info(f"[EXPORT] name={candidate_data.get('name') or candidate_data.get('full_name')}, email={candidate_data.get('email')}")
            
            candidate_name = candidate_data.get("full_name") or candidate_data.get("name") or "Unknown"
            safe_name = "".join(c for c in candidate_name if c.isalnum() or c in (" ", "_")).rstrip() or "candidate"
            
            if template.type == "html":
                jinja_template = Template(template.content or "")
                rendered_html = jinja_template.render(candidate=candidate_data, resume=resume_doc)
                
                if format == "pdf":
                    pdf_bytes = weasyprint.HTML(string=rendered_html).write_pdf()
                    exported_files.append((f"{safe_name}.pdf", pdf_bytes))
                    
            elif template.type == "docx":
                if not template.file_path or not os.path.exists(template.file_path):
                    raise HTTPException(status_code=500, detail="DOCX template file missing")
                    
                doc = DocxTemplate(template.file_path)
                doc.render({"candidate": candidate_data, "resume": resume_doc})
                
                mem_stream = io.BytesIO()
                doc.save(mem_stream)
                exported_files.append((f"{safe_name}.docx", mem_stream.getvalue()))

        if not exported_files:
            raise HTTPException(status_code=404, detail="No candidates found or exported")

        if len(exported_files) == 1:
            file_name, file_bytes = exported_files[0]
            mem = io.BytesIO(file_bytes)
            mime = "application/pdf" if format == "pdf" else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            return mem, file_name, mime
        else:
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
                for file_name, file_bytes in exported_files:
                    zip_file.writestr(file_name, file_bytes)
            
            zip_buffer.seek(0)
            return zip_buffer, "exported_resumes.zip", "application/zip"
