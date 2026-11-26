"""
Signed file links (see app.core.file_access). The token is the permission: it is only handed out in responses
to signed-in users who could read the record, and it expires.
"""

from fastapi import APIRouter
from fastapi.responses import RedirectResponse

from app.core.config import settings
from app.core.exceptions import NotFoundError
from app.core.file_access import raw_url, read_token

router = APIRouter(prefix="/api/v1/files", tags=["Files"])

PRESIGN_SECONDS = 60


def presigned_url(key: str) -> str:
    """A 60-second S3 URL for a private object. Without AWS keys (local development) the stored URL is used."""
    if not (settings.AWS_ACCESS_KEY_ID and settings.AWS_SECRET_ACCESS_KEY):
        return raw_url(key)
    import boto3

    client = boto3.client(
        "s3",
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_REGION,
    )
    return client.generate_presigned_url(
        "get_object", Params={"Bucket": settings.AWS_BUCKET_NAME, "Key": key}, ExpiresIn=PRESIGN_SECONDS
    )


@router.get("/{token}", summary="Open a file from a signed link")
async def open_file(token: str):
    key = read_token(token)
    if not key:
        raise NotFoundError("This file link has expired. Reload the page to get a new one.")
    response = RedirectResponse(presigned_url(key), status_code=302)
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response
