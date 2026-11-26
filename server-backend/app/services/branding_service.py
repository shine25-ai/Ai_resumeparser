"""
Reading and saving branding (app.models.branding), platform settings, and branding images.

Images (logos, favicon, login background) are small and must load on public pages and inside emails, so they
are stored in the database and served by a public, cacheable URL rather than as private S3 files.
"""

import hashlib
from typing import Any, Dict, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.exceptions import BadRequestError, NotFoundError
from app.models.branding import clean_branding, contrast_warnings, effective_branding, public_branding
from app.models.company import DEFAULT_COMPANY_ID
from app.utils.constants import COMPANIES_COLLECTION
from app.utils.helpers import generate_uuid, utc_now

PLATFORM_SETTINGS_COLLECTION = "platform_settings"
BRANDING_ASSETS_COLLECTION = "branding_assets"
PLATFORM_DOC_ID = "platform"
# Resume file types the platform can read; the super admin may allow fewer.
RESUME_TYPES = ("pdf", "doc", "docx")
ASSET_PATH = "/api/v1/public/branding/assets/"

# SVG is left out on purpose: it can carry scripts and these files are served from the API's own address.
ALLOWED_TYPES = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/x-icon": "ico", "image/vnd.microsoft.icon": "ico"}
MAX_BYTES = {
    "logo": 512_000, "logo_dark": 512_000, "favicon": 128_000, "login_background": 2_000_000,
    # Career page: banner, culture and gallery images, employee photos.
    "career_image": 2_000_000,
}
_MAGIC = {
    b"\x89PNG\r\n\x1a\n": "image/png",
    b"\xff\xd8\xff": "image/jpeg",
    b"RIFF": "image/webp",
    b"\x00\x00\x01\x00": "image/x-icon",
}


def _sniff(data: bytes) -> Optional[str]:
    for magic, ctype in _MAGIC.items():
        if data.startswith(magic):
            if ctype == "image/webp" and data[8:12] != b"WEBP":
                return None
            return ctype
    return None


DEFAULT_INTEGRATIONS = [
    {"id": "slack", "name": "Slack", "category": "messaging", "is_enabled": False, "description": "Send interview and candidate updates to Slack channels."},
    {"id": "google_meet", "name": "Google Meet", "category": "video", "is_enabled": False, "description": "Automatically generate Google Meet links for online interviews."},
    {"id": "ms_teams", "name": "Microsoft Teams", "category": "video", "is_enabled": False, "description": "Schedule video interviews with Teams links."},
    {"id": "zoom", "name": "Zoom", "category": "video", "is_enabled": False, "description": "Generate Zoom video conference meetings for scheduled rounds."},
    {"id": "linkedin", "name": "LinkedIn Job Posting", "category": "sourcing", "is_enabled": False, "description": "Sync published jobs to LinkedIn Talent Solutions."},
    {"id": "webhooks", "name": "Custom Webhooks", "category": "developer", "is_enabled": False, "description": "Post HTTP payloads on candidate and application events."},
]

DEFAULT_SECURITY = {
    "require_mfa_superadmin": False,
    "require_mfa_all_staff": False,
    "session_timeout_minutes": 1440,
}

DEFAULT_EMAIL_TEMPLATES = {
    "welcome": {"subject": "Welcome to {app_name}", "body": "Hello {user_name}, welcome to your recruitment workspace."},
    "interview_invite": {"subject": "Interview Invitation: {job_title} at {company_name}", "body": "Dear {candidate_name}, you are invited for an interview."},
    "interview_reminder": {"subject": "Reminder: Upcoming Interview for {job_title}", "body": "Your interview is scheduled shortly."},
    "application_received": {"subject": "Application Received: {job_title}", "body": "Thank you for applying to {company_name}."},
    "offer_letter": {"subject": "Offer of Employment - {job_title}", "body": "Congratulations {candidate_name}, we are pleased to extend an offer."},
    "rejection": {"subject": "Update on your application for {job_title}", "body": "Thank you for your interest. We have decided to proceed with other candidates."},
}


class BrandingService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    # ── Platform ─────────────────────────────────────────────────────────────

    async def platform_settings(self) -> Dict[str, Any]:
        doc = await self.db[PLATFORM_SETTINGS_COLLECTION].find_one({"id": PLATFORM_DOC_ID}) or {}
        return {
            "platform_name": doc.get("platform_name") or "HireLogics",
            "support_email": doc.get("support_email") or "",
            "platform_url": doc.get("platform_url") or "",
            "default_timezone": doc.get("default_timezone") or "Asia/Kolkata",
            "default_language": doc.get("default_language") or "en",
            "allowed_resume_types": doc.get("allowed_resume_types") or list(RESUME_TYPES),
            "branding": doc.get("branding") or {},
            "security": {
                **DEFAULT_SECURITY,
                **(doc.get("security") or {}),
            },
            "email_templates": doc.get("email_templates") or DEFAULT_EMAIL_TEMPLATES,
            "integrations": doc.get("integrations") or DEFAULT_INTEGRATIONS,
        }

    async def save_platform_settings(self, changes: Dict[str, Any]) -> Dict[str, Any]:
        current = await self.platform_settings()
        update: Dict[str, Any] = {"updated_at": utc_now().isoformat()}
        if "platform_name" in changes:
            name = str(changes["platform_name"] or "").strip()[:60]
            if not name:
                raise BadRequestError("Platform name is required.")
            update["platform_name"] = name
        for key, limit in (("support_email", 120), ("platform_url", 200)):
            if key in changes:
                update[key] = str(changes[key] or "").strip()[:limit]
        for key, limit in (("default_timezone", 60), ("default_language", 10)):
            if key in changes:
                update[key] = str(changes[key] or "").strip()[:limit]
        if "allowed_resume_types" in changes:
            types = [str(t).strip().lower().lstrip(".") for t in (changes["allowed_resume_types"] or [])]
            bad = [t for t in types if t not in RESUME_TYPES]
            if bad or not types:
                raise BadRequestError(f"Resume file types must be some of: {', '.join(RESUME_TYPES)}.")
            update["allowed_resume_types"] = list(dict.fromkeys(types))
        if isinstance(changes.get("branding"), dict):
            update["branding"] = _merge_partial(current["branding"], clean_branding(changes["branding"]))
        if "security" in changes and isinstance(changes["security"], dict):
            sec = dict(current.get("security") or DEFAULT_SECURITY)
            sec.update(changes["security"])
            for key in ("require_mfa_superadmin", "require_mfa_all_staff"):
                sec[key] = bool(sec.get(key, False))
            update["security"] = sec
        if "email_templates" in changes and isinstance(changes["email_templates"], dict):
            tmpl = dict(current.get("email_templates") or {})
            tmpl.update(changes["email_templates"])
            update["email_templates"] = tmpl
        if "integrations" in changes and isinstance(changes["integrations"], list):
            update["integrations"] = changes["integrations"]

        await self.db[PLATFORM_SETTINGS_COLLECTION].update_one(
            {"id": PLATFORM_DOC_ID}, {"$set": update, "$setOnInsert": {"id": PLATFORM_DOC_ID}}, upsert=True
        )
        return await self.platform_settings()

    # ── Company ──────────────────────────────────────────────────────────────

    async def _company(self, company_id: str) -> Dict[str, Any]:
        company = await self.db[COMPANIES_COLLECTION].find_one({"id": company_id})
        if not company:
            raise NotFoundError("Company not found.")
        return company

    async def for_company(self, company_id: str) -> Dict[str, Any]:
        """Everything the branding screens need: the merged result, the company's own changes and the defaults."""
        platform = await self.platform_settings()
        company = await self._company(company_id)
        own = company.get("branding") or {}
        platform_branding = {"app_name": platform["platform_name"], **platform["branding"]}
        merged = effective_branding(platform_branding, own)
        # A company that set no app name shows its own name rather than the platform's.
        if not own.get("app_name"):
            merged["app_name"] = company.get("name") or merged["app_name"]
        if not merged.get("logo_url") and company.get("logo_url"):
            merged["logo_url"] = company["logo_url"]
        if not merged["email"].get("from_name"):
            merged["email"]["from_name"] = company.get("name", "")
        # What each field falls back to when the company leaves it empty (shown as placeholders).
        defaults = effective_branding(platform_branding, None)
        defaults["app_name"] = company.get("name") or defaults["app_name"]
        defaults["email"]["from_name"] = company.get("name", "")
        if company.get("logo_url"):
            defaults["logo_url"] = company["logo_url"]
        return {
            "effective": merged,
            "company": own,
            "defaults": defaults,
            "warnings": contrast_warnings(merged),
            "platform_name": platform["platform_name"],
            "company_name": company.get("name"),
            "company_slug": company.get("slug"),
        }

    async def save_company(self, company_id: str, changes: Dict[str, Any]) -> Dict[str, Any]:
        company = await self._company(company_id)
        own = _merge_partial(company.get("branding") or {}, clean_branding(changes))
        await self.db[COMPANIES_COLLECTION].update_one(
            {"id": company_id}, {"$set": {"branding": own, "updated_at": utc_now().isoformat()}}
        )
        return await self.for_company(company_id)

    async def reset_company(self, company_id: str) -> Dict[str, Any]:
        await self._company(company_id)
        await self.db[COMPANIES_COLLECTION].update_one({"id": company_id}, {"$set": {"branding": {}}})
        return await self.for_company(company_id)

    async def public_for_slug(self, slug: Optional[str]) -> Dict[str, Any]:
        """Login page, careers page, invitations. Unknown or turned-off companies get the platform's branding."""
        company = None
        if slug:
            company = await self.db[COMPANIES_COLLECTION].find_one({"slug": slug.strip().lower()})
            if company and (company.get("is_active") is False or company.get("archived_at")):
                company = None
        data = await self.for_company(company["id"] if company else DEFAULT_COMPANY_ID)
        if not company:
            platform = await self.platform_settings()
            data["effective"]["app_name"] = platform["platform_name"]
        return {
            "branding": public_branding(data["effective"]),
            "company_name": data["company_name"] if company else None,
            "company_slug": company.get("slug") if company else None,
            "platform_name": data["platform_name"],
        }

    # ── Images ───────────────────────────────────────────────────────────────

    async def save_asset(self, owner: str, kind: str, content_type: str, data: bytes) -> Dict[str, Any]:
        if kind not in MAX_BYTES:
            raise BadRequestError(f"Image kind must be one of: {', '.join(MAX_BYTES)}.")
        if not data:
            raise BadRequestError("The file is empty.")
        if len(data) > MAX_BYTES[kind]:
            raise BadRequestError(f"The image is too large (max {MAX_BYTES[kind] // 1000} KB).")
        sniffed = _sniff(data)
        if not sniffed or sniffed not in ALLOWED_TYPES:
            raise BadRequestError("Upload a PNG, JPG, WebP or ICO image.")
        digest = hashlib.sha256(data).hexdigest()
        asset_id = f"{generate_uuid().replace('-', '')[:16]}.{ALLOWED_TYPES[sniffed]}"
        await self.db[BRANDING_ASSETS_COLLECTION].insert_one({
            "id": asset_id, "owner": owner, "kind": kind, "content_type": sniffed,
            "size": len(data), "sha256": digest, "data": data, "created_at": utc_now().isoformat(),
        })
        return {"id": asset_id, "url": f"{ASSET_PATH}{asset_id}", "content_type": sniffed, "size": len(data)}

    async def get_asset(self, asset_id: str) -> Dict[str, Any]:
        doc = await self.db[BRANDING_ASSETS_COLLECTION].find_one({"id": asset_id})
        if not doc:
            raise NotFoundError("Image not found.")
        return doc


def _merge_partial(current: Dict[str, Any], changes: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(current)
    for k, v in changes.items():
        if isinstance(v, dict):
            out[k] = {**(out.get(k) or {}), **v}
        else:
            out[k] = v
    return out
