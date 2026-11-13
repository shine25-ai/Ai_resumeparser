"""
Resume category and profile source fields on the resume update endpoint.
Uses an in-memory resume store, so no MongoDB is needed.
"""

import pytest

from app.schemas.resume import ResumeUpdateRequest
from app.services.resume_service import ResumeService


class FakeResumeRepo:
    def __init__(self, doc):
        self.doc = doc

    async def get_by_id(self, id_val):
        return dict(self.doc) if id_val == self.doc["id"] else None

    async def update_resume_fields(self, resume_id, update_fields, hr_update=None):
        self.doc.update(update_fields)
        return dict(self.doc)


@pytest.fixture
def service():
    svc = ResumeService.__new__(ResumeService)
    svc.resume_repo = FakeResumeRepo({
        "id": "r1", "user_id": "u1", "filename": "a.pdf", "original_filename": "a.pdf",
        "file_path": "a.pdf", "upload_date": "2026-11-13T00:00:00", "status": "PARSED",
        "resume_source": "Careers page", "applicant_heard_from": "LinkedIn",
    })

    async def _enrich(docs):
        return docs

    svc.enrich_resumes_with_interviews = _enrich
    return svc


@pytest.mark.asyncio
async def test_category_is_saved_trimmed_and_returned(service):
    result = await service.update_resume("r1", "u1", ResumeUpdateRequest(category="  AI / ML "), is_admin=True)
    assert result.category == "AI / ML"
    assert result.applicant_heard_from == "LinkedIn"
    assert result.resume_source == "Careers page"  # not sent, so unchanged


@pytest.mark.asyncio
async def test_empty_string_clears_category_and_source_edits_now_save(service):
    await service.update_resume("r1", "u1", ResumeUpdateRequest(category="Fresher"), is_admin=True)
    result = await service.update_resume(
        "r1", "u1",
        ResumeUpdateRequest(category="", resume_source="Referral", resume_source_informer_name="Priya"),
        is_admin=True,
    )
    assert result.category is None
    assert result.resume_source == "Referral"
    assert result.resume_source_informer_name == "Priya"


def test_category_longer_than_60_characters_is_rejected():
    with pytest.raises(ValueError):
        ResumeUpdateRequest(category="x" * 61)
