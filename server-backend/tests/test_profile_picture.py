"""
Tests for candidate profile picture upload validation and service behaviour.
"""

from io import BytesIO
import pytest
from fastapi import UploadFile
from app.core.exceptions import FileUploadError, NotFoundError
from app.services.resume_service import ResumeService
from app.utils.validators import validate_profile_picture

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
JPG_BYTES = b"\xff\xd8\xff\xe0" + b"\x00" * 32


def make_upload(filename: str, content: bytes) -> UploadFile:
    return UploadFile(filename=filename, file=BytesIO(content))


class FakeS3Service:
    def __init__(self):
        self.uploads = []

    def upload_file(self, file_content, filename, content_type="application/octet-stream", folder="resumes"):
        self.uploads.append({"filename": filename, "content_type": content_type, "folder": folder})
        return f"https://bucket.example/{folder}/{filename}"


class FakeResumeRepository:
    db = None

    def __init__(self, resume: dict):
        self.resume = resume

    async def get_by_id(self, id_val):
        return self.resume if id_val == self.resume["id"] else None

    async def update_resume_fields(self, resume_id, update_fields, hr_update=None):
        self.resume.update(update_fields)
        return self.resume


def make_service():
    resume = {
        "id": "resume-1",
        "user_id": "owner-1",
        "filename": "cv.pdf",
        "original_filename": "cv.pdf",
        "file_path": "/tmp/cv.pdf",
        "upload_date": "2026-10-12T00:00:00+00:00",
        "status": "PENDING",
    }
    s3 = FakeS3Service()
    service = ResumeService(FakeResumeRepository(resume), s3_service=s3, resume_log_repo=object())
    return service, s3


@pytest.mark.asyncio
async def test_validate_profile_picture_accepts_png_and_jpg():
    assert await validate_profile_picture(make_upload("photo.png", PNG_BYTES)) == (PNG_BYTES, "png")
    assert await validate_profile_picture(make_upload("photo.JPEG", JPG_BYTES)) == (JPG_BYTES, "jpg")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "filename, content",
    [
        ("resume.pdf", b"%PDF-1.4"),  # not an image extension
        ("photo.png", b"not really an image"),  # image extension, wrong content
        ("photo.png", b""),  # empty file
        ("photo.png", PNG_BYTES + b"\x00" * (5 * 1024 * 1024)),  # over the 5 MB limit
    ],
)
async def test_validate_profile_picture_rejects_invalid_files(filename, content):
    with pytest.raises(FileUploadError):
        await validate_profile_picture(make_upload(filename, content))


@pytest.mark.asyncio
async def test_upload_and_remove_profile_picture():
    service, s3 = make_service()

    uploaded = await service.upload_profile_picture("resume-1", "owner-1", make_upload("me.png", PNG_BYTES))
    assert s3.uploads[0]["folder"] == "profile-pictures"
    assert s3.uploads[0]["content_type"] == "image/png"
    assert uploaded.profile_picture_url == f"https://bucket.example/profile-pictures/{s3.uploads[0]['filename']}"

    removed = await service.remove_profile_picture("resume-1", "owner-1")
    assert removed.profile_picture_url is None


@pytest.mark.asyncio
async def test_upload_profile_picture_hidden_from_other_users():
    service, s3 = make_service()

    with pytest.raises(NotFoundError):
        await service.upload_profile_picture("resume-1", "someone-else", make_upload("me.png", PNG_BYTES))
    assert s3.uploads == []

    # Staff can update any candidate profile
    uploaded = await service.upload_profile_picture("resume-1", "someone-else", make_upload("me.png", PNG_BYTES), is_admin=True)
    assert uploaded.profile_picture_url
