"""
Branding API (plan §3): the signed-in company's branding, the public branding for login/careers pages,
branding images, and the super admin's platform settings.
"""

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_database
from app.core.dependencies import get_current_active_user, require_can, require_superadmin
from app.core.tenant import system_scope
from app.services.audit_service import record_audit
from app.services.branding_service import BrandingService
from app.utils.response import success_response

router = APIRouter(prefix="/api/v1/branding", tags=["Branding"])
public_router = APIRouter(prefix="/api/v1/public/branding", tags=["Branding (public)"])
platform_router = APIRouter(prefix="/api/v1/platform", tags=["Platform settings"])


def get_service(db: AsyncIOMotorDatabase = Depends(get_database)) -> BrandingService:
    return BrandingService(db)


def _changed_keys(body: Dict[str, Any]) -> Dict[str, Any]:
    return {k: {"to": v} for k, v in body.items()}


@router.get("", summary="This company's branding (merged with the platform defaults)")
async def get_branding(user: dict = Depends(get_current_active_user), service: BrandingService = Depends(get_service)):
    return success_response(data=await service.for_company(user["company_id"]), message="Branding retrieved.")


@router.put("", summary="Change this company's branding (empty values go back to the default)")
async def save_branding(
    body: Dict[str, Any],
    request: Request,
    user: dict = Depends(require_can("settings:edit")),
    service: BrandingService = Depends(get_service),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    data = await service.save_company(user["company_id"], body)
    await record_audit(db, user, "branding.updated", "branding", user["company_id"], user.get("company_name", ""),
                       _changed_keys(body), request=request)
    return success_response(data=data, message="Branding saved.")


@router.delete("", summary="Go back to the platform's default branding")
async def reset_branding(
    request: Request,
    user: dict = Depends(require_can("settings:edit")),
    service: BrandingService = Depends(get_service),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    data = await service.reset_company(user["company_id"])
    await record_audit(db, user, "branding.reset", "branding", user["company_id"], user.get("company_name", ""), request=request)
    return success_response(data=data, message="Branding reset to the default.")


@router.post("/assets", summary="Upload a logo, dark logo, favicon or login background")
async def upload_asset(
    request: Request,
    kind: str = Form(..., max_length=30),
    file: UploadFile = File(...),
    scope: str = Query("company", pattern="^(company|platform)$"),
    user: dict = Depends(require_can("settings:edit")),
    service: BrandingService = Depends(get_service),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    if scope == "platform" and not user.get("is_superadmin"):
        from app.core.exceptions import AuthorizationError

        raise AuthorizationError("Only the platform super admin can upload platform images.")
    data = await file.read(2_000_001)
    owner = "platform" if scope == "platform" else user["company_id"]
    asset = await service.save_asset(owner, kind, file.content_type or "", data)
    await record_audit(db, user, "branding.image_uploaded", "branding", asset["id"], kind, request=request,
                       platform=scope == "platform")
    return success_response(data=asset, message="Image uploaded.")


# ── Public ─────────────────────────────────────────────────────────────────

@public_router.get("", summary="Branding for the login, careers and invitation pages (no login)")
async def public_branding(company: Optional[str] = Query(None, max_length=60), service: BrandingService = Depends(get_service)):
    with system_scope():
        data = await service.public_for_slug(company)
    return success_response(data=data, message="Branding retrieved.")


@public_router.get("/assets/{asset_id}", summary="A branding image (no login, cached)")
async def get_asset(asset_id: str, service: BrandingService = Depends(get_service)):
    doc = await service.get_asset(asset_id)
    return Response(
        content=bytes(doc["data"]),
        media_type=doc["content_type"],
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'",
        },
    )


# ── Platform (super admin) ───────────────────────────────────────────────────

@platform_router.get("/settings", summary="Platform name, support contact and default branding")
async def get_platform_settings(_user: dict = Depends(require_superadmin), service: BrandingService = Depends(get_service)):
    return success_response(data=await service.platform_settings(), message="Platform settings retrieved.")


@platform_router.put("/settings", summary="Change platform settings (super admin)")
async def save_platform_settings(
    body: Dict[str, Any],
    request: Request,
    user: dict = Depends(require_superadmin),
    service: BrandingService = Depends(get_service),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    data = await service.save_platform_settings(body)
    await record_audit(db, user, "platform.settings_updated", "platform", "platform", data["platform_name"],
                       _changed_keys(body), request=request, platform=True)
    return success_response(data=data, message="Platform settings saved.")
