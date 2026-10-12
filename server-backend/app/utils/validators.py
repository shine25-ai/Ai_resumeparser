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

    # Reset file seek cursor for subsequent operations if needed
    await file.seek(0)
    return content


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
