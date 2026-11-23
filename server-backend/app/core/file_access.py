"""
Controlled file access (SRS §6: "use signed or controlled file access; avoid public resume URLs").

Files (resumes, profile pictures, interview documents) are stored in S3 as private objects. The database keeps
their S3 URL, but the API never hands that URL out: `FileLinkMiddleware` swaps every bucket URL in a JSON
response for a signed app link that expires (`/api/v1/files/<token>`). Opening the link checks the signature
and redirects to a short-lived S3 pre-signed URL.

When a screen sends a signed link back (e.g. saving an interview's document list), the middleware turns it back
into the stored S3 URL, so expiring links never end up in the database.
"""

import re
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import List, Optional

import jwt

from app.core.config import settings

FILE_LINK_PATH = "/api/v1/files/"
TOKEN_TYPE = "file"


@lru_cache(maxsize=1)
def bucket_bases() -> List[str]:
    """URL prefixes of our bucket, longest first."""
    bucket, region = settings.AWS_BUCKET_NAME, settings.AWS_REGION
    bases = {
        (settings.S3_UR or "").rstrip("/") + "/",
        f"https://{bucket}.s3.{region}.amazonaws.com/",
        f"https://{bucket}.s3.amazonaws.com/",
        f"https://s3.{region}.amazonaws.com/{bucket}/",
    }
    return sorted((b for b in bases if b.startswith("http")), key=len, reverse=True)


@lru_cache(maxsize=1)
def bucket_url_pattern() -> "re.Pattern[str]":
    alternatives = "|".join(re.escape(b) for b in bucket_bases())
    # A key runs until the end of the JSON string: no quote, backslash or whitespace.
    return re.compile(rf'(?:{alternatives})([^"\\\s]+)')


SIGNED_LINK_PATTERN = re.compile(r'https?://[^"\\\s]*?' + re.escape(FILE_LINK_PATH) + r'([A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)')


def key_of(url: str) -> Optional[str]:
    """'https://bucket.s3.../resumes/a.pdf' -> 'resumes/a.pdf'; None for anything else."""
    for base in bucket_bases():
        if url.startswith(base):
            return url[len(base):]
    return None


def raw_url(key: str) -> str:
    """The stored form of a file URL (what upload_file returns)."""
    base = (settings.S3_UR or "").rstrip("/") or bucket_bases()[-1].rstrip("/")
    return f"{base}/{key}"


def sign_key(key: str, ttl_minutes: Optional[int] = None) -> str:
    """A token for one file, valid for `ttl_minutes` (FILE_LINK_TTL_MINUTES by default)."""
    ttl = ttl_minutes if ttl_minutes is not None else int(getattr(settings, "FILE_LINK_TTL_MINUTES", 60))
    payload = {"type": TOKEN_TYPE, "k": key, "exp": datetime.now(timezone.utc) + timedelta(minutes=ttl)}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def read_token(token: str, verify_exp: bool = True) -> Optional[str]:
    """The file key in a token, or None if the token is forged, expired (when checked) or not a file token."""
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM], options={"verify_exp": verify_exp}
        )
    except jwt.PyJWTError:
        return None
    if payload.get("type") != TOKEN_TYPE or not isinstance(payload.get("k"), str):
        return None
    key = payload["k"]
    # Keys are plain object names; never a path that climbs out of the bucket.
    if not key or key.startswith("/") or ".." in key.split("/"):
        return None
    return key


def signed_link(base_url: str, key: str) -> str:
    return f"{base_url.rstrip('/')}{FILE_LINK_PATH}{sign_key(key)}"


def sign_bucket_urls(text: str, base_url: str) -> str:
    """Replace every bucket URL in a JSON text with a signed app link."""
    if not any(b in text for b in bucket_bases()):
        return text
    return bucket_url_pattern().sub(lambda m: signed_link(base_url, m.group(1)), text)


def unsign_links(text: str) -> str:
    """Replace signed app links (even expired ones) in a JSON text with the stored bucket URL."""
    if FILE_LINK_PATH not in text:
        return text

    def back(m: "re.Match[str]") -> str:
        key = read_token(m.group(1), verify_exp=False)
        return raw_url(key) if key else m.group(0)

    return SIGNED_LINK_PATTERN.sub(back, text)
