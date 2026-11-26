"""
Validation utility functions for uploaded files (file size, extensions, emptiness).
"""

from fastapi import UploadFile
from app.core.exceptions import FileUploadError
from app.utils.constants import (
    ALLOWED_EXTENSIONS,
    ALLOWED_IMAGE_EXTENSIONS,
    MAX_FILE_SIZE_BYTES,
    MAX_PROFILE_PICTURE_SIZE_BYTES,
)


def validate_file_extension(filename: str) -> str:
    """
    Validate and return the lowercased file extension.
    Raises FileUploadError if the extension is unsupported.
    """
    if "." not in filename:
        raise FileUploadError("Uploaded file has no extension.")
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise FileUploadError(
            f"Extension '.{ext}' is not supported. Allowed formats: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    return ext


async def validate_uploaded_file(file: UploadFile) -> bytes:
    """
    Read and validate uploaded file content for size and empty checks.
    Returns the file content bytes.
    Raises FileUploadError on validation failure.
    """
    if not file.filename:
        raise FileUploadError("Filename is missing.")

    validate_file_extension(file.filename)

    content = await file.read()
    if len(content) == 0:
        raise FileUploadError("Uploaded file is empty.")

    if len(content) > MAX_FILE_SIZE_BYTES:
        raise FileUploadError("Uploaded file size exceeds the 10 MB limit.")

    ext = validate_file_extension(file.filename)
    if not content_matches_extension(content, ext):
        raise FileUploadError(f"This file isn't a real .{ext} document. Please upload a PDF or Word resume.")

    # Reset file seek cursor for subsequent operations if needed
    await file.seek(0)
    return content


def content_matches_extension(content: bytes, ext: str) -> bool:
    """
    The file's own bytes agree with its extension (Phase 12): a renamed executable or script is refused.
    PDF has %PDF in its first 1 KB (where readers look for it); .docx is a ZIP holding word/;
    .doc is an OLE2 compound file.
    """
    head = content[:1024]
    if ext == "pdf":
        return b"%PDF" in head
    if ext == "docx":
        if not content.startswith(b"PK\x03\x04"):
            return False
        import io
        import zipfile
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as z:
                return any(n.startswith("word/") for n in z.namelist())
        except zipfile.BadZipFile:
            return False
    if ext == "doc":
        return content.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1")
    return False


def _detect_image_type(content: bytes) -> str:
    """Return the image type from the file signature, or an empty string if unrecognised."""
    if content.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "webp"
    return ""


async def validate_profile_picture(file: UploadFile) -> tuple[bytes, str]:
    """
    Read and validate an uploaded candidate profile picture (JPG, PNG or WEBP, up to 5 MB).
    Returns the file content bytes and the image type detected from its content.
    Raises FileUploadError on validation failure.
    """
    if not file.filename:
        raise FileUploadError("Filename is missing.")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise FileUploadError("Profile picture must be a JPG, PNG, or WEBP image.")

    content = await file.read()
    if len(content) == 0:
        raise FileUploadError("Uploaded file is empty.")

    if len(content) > MAX_PROFILE_PICTURE_SIZE_BYTES:
        raise FileUploadError("Profile picture size exceeds the 5 MB limit.")

    image_type = _detect_image_type(content)
    if not image_type:
        raise FileUploadError("Uploaded file is not a valid JPG, PNG, or WEBP image.")

    return content, image_type
