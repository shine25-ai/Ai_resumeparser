"""
Resume controller handling HTTP requests for resume upload, retrieval, text extraction, and deletion.
"""

from typing import Optional
from fastapi import UploadFile, status, BackgroundTasks
from fastapi.responses import JSONResponse
from app.schemas.resume import ResumeUpdateRequest
from app.services.resume_service import ResumeService
from app.utils.response import success_response


class ResumeController:
    """Controller orchestrating resume management API endpoints."""

    def __init__(self, resume_service: ResumeService):
        self.resume_service = resume_service

    async def upload_resume(
        self,
        user_id: str,
        file: UploadFile,
        background_tasks: BackgroundTasks,
        resume_source: Optional[str] = None,
        resume_source_informer_name: Optional[str] = None,
        uploaded_by_name: Optional[str] = None,
        uploaded_by_email: Optional[str] = None,
    ) -> JSONResponse:
        """Process resume file upload and text extraction with uploader details."""
        resume_response = await self.resume_service.upload_and_process_resume(
            user_id,
            file,
            background_tasks,
            resume_source=resume_source,
            resume_source_informer_name=resume_source_informer_name,
            uploaded_by_name=uploaded_by_name,
            uploaded_by_email=uploaded_by_email,
        )
        return success_response(
            data=resume_response.model_dump(),
            message="Resume uploaded and processed successfully.",
            status_code=status.HTTP_201_CREATED,
        )

    async def list_resumes(
        self,
        user_id: str,
        skip: int = 0,
        limit: int = 10,
        page: int = 1,
        search: Optional[str] = None,
        is_admin: bool = False,
    ) -> JSONResponse:
        """Process request to list uploaded resumes."""
        resume_list_response = await self.resume_service.get_user_resumes(
            user_id, skip=skip, limit=limit, page=page, search=search, is_admin=is_admin
        )
        return success_response(
            data=resume_list_response.model_dump(),
            message="Resumes retrieved successfully.",
        )

    async def filter_resumes(
        self,
        user_id: str,
        job_title: Optional[list[str]] = None,
        min_experience: Optional[float] = None,
        max_experience: Optional[float] = None,
        location: Optional[list[str]] = None,
        employment_type: Optional[list[str]] = None,
        year_of_passing: Optional[list[str]] = None,
        skills: Optional[list[str]] = None,
        keywords: Optional[list[str]] = None,
        search: Optional[str] = None,
        name: Optional[str] = None,
        email: Optional[str] = None,
        role: Optional[str] = None,
        experience: Optional[float] = None,
        skip: int = 0,
        limit: int = 10,
        page: int = 1,
        is_admin: bool = False,
    ) -> JSONResponse:
        """Process request to filter resumes based on criteria."""
        filtered_response = await self.resume_service.filter_resumes(
            user_id=user_id,
            job_title=job_title,
            min_experience=min_experience,
            max_experience=max_experience,
            location=location,
            employment_type=employment_type,
            year_of_passing=year_of_passing,
            skills=skills,
            keywords=keywords,
            search=search,
            name=name,
            email=email,
            role=role,
            experience=experience,
            skip=skip,
            limit=limit,
            page=page,
            is_admin=is_admin,
        )
        return success_response(
            data=filtered_response.model_dump(),
            message="Filtered resumes retrieved successfully.",
        )

    async def get_resume(self, resume_id: str, user_id: str, is_admin: bool = False) -> JSONResponse:
        """Process request to get details for single resume."""
        resume_response = await self.resume_service.get_resume_by_id(resume_id, user_id, is_admin=is_admin)
        return success_response(
            data=resume_response.model_dump(),
            message="Resume retrieved successfully.",
        )

    async def update_resume(self, resume_id: str, update_payload: ResumeUpdateRequest, user_id: str, is_admin: bool = False) -> JSONResponse:
        """Process request to update resume fields and append HR update."""
        resume_response = await self.resume_service.update_resume(resume_id, user_id, update_payload, is_admin=is_admin)
        return success_response(
            data=resume_response.model_dump(),
            message="Resume updated successfully.",
        )

    async def extract_text(self, resume_id: str, user_id: str, is_admin: bool = False) -> JSONResponse:
        """Process request to extract formatted text prepared for AI parsing."""
        extraction_response = await self.resume_service.extract_resume_text_for_ai(resume_id, user_id, is_admin=is_admin)
        return success_response(
            data=extraction_response.model_dump(),
            message="Resume text extracted successfully.",
        )

    async def delete_resume(self, resume_id: str, user_id: str, is_admin: bool = False) -> JSONResponse:
        """Process request to delete resume file and record."""
        await self.resume_service.delete_resume(resume_id, user_id, is_admin=is_admin)
        return success_response(
            data={},
            message="Resume deleted successfully.",
        )


    async def parsed_resume_summary(
        self,
        user_id: str,
        skip: int = 0,
        limit: int = 100,
        is_admin: bool = False,
    ):
        """
        Get parsed resume summary.
        """
        resumes = await self.resume_service.get_parsed_resume_summary(
            user_id=user_id,
            skip=skip,
            limit=limit,
            is_admin=is_admin,
        )

        return success_response(
            data=resumes,
            message="Parsed resume summary retrieved successfully.",
        )

    async def merge_resume(self, new_resume_id: str, existing_resume_id: str, user_id: str, is_admin: bool = False) -> JSONResponse:
        """Process request to merge a new resume into an existing candidate profile."""
        resume_response = await self.resume_service.merge_resume(new_resume_id, existing_resume_id, user_id, is_admin=is_admin)
        return success_response(
            data=resume_response.model_dump(),
            message="Resumes merged successfully.",
        )

    async def add_document(self, resume_id: str, file: UploadFile, doc_type: str, user_id: str, doc_title: Optional[str] = None, is_admin: bool = False) -> JSONResponse:
        """Process request to upload an additional document to a candidate profile."""
        resume_response = await self.resume_service.upload_additional_document(resume_id, user_id, file, doc_type, doc_title=doc_title, is_admin=is_admin)
        return success_response(
            data=resume_response.model_dump(),
            message="Document added successfully.",
        )

    async def get_resume_logs(self, resume_id: str, user_id: str, is_admin: bool = False) -> JSONResponse:
        """Process request to fetch version logs for a resume."""
        logs_response = await self.resume_service.get_resume_logs(resume_id, user_id, is_admin=is_admin)
        return success_response(
            data=logs_response.model_dump(),
            message="Resume logs retrieved successfully.",
        )
