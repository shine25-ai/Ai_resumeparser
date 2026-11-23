"""
Career page builder API (SRS 4.5). Staff edit a draft and publish it; the public page reads what was published.
"""

from typing import Any, Dict, Optional

import os

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings
from app.core.database import get_database
from app.core.dependencies import get_current_active_user, require_access
from app.core.exceptions import NotFoundError
from app.core.tenant import company_scope, system_scope
from app.models.company import COMPANY_STATUS_INACTIVE, DEFAULT_COMPANY_ID
from app.services.audit_service import record_audit
from app.services.branding_service import BrandingService
from app.services.career_page_service import CareerPageService
from app.services.domain_service import DomainService
from app.utils.constants import COMPANIES_COLLECTION
from app.utils.response import success_response

_ACCESS = require_access("career_page", {
    ("PUT", "/api/v1/career-page/domains/subdomain"): "settings:edit",
    ("PUT", "/api/v1/career-page/domains/custom"): "settings:edit",
    ("POST", "/api/v1/career-page/domains/custom/verify"): "settings:edit",
    ("DELETE", "/api/v1/career-page/domains/custom"): "settings:edit",
    ("PUT", "/api/v1/career-page/draft"): "career_page:edit",
    ("POST", "/api/v1/career-page/discard"): "career_page:edit",
    ("POST", "/api/v1/career-page/publish"): "career_page:publish",
})
router = APIRouter(prefix="/api/v1/career-page", tags=["Career page"], dependencies=[Depends(_ACCESS)])
public_router = APIRouter(prefix="/api/v1/public/career-page", tags=["Career page (public)"])


def get_service(db: AsyncIOMotorDatabase = Depends(get_database)) -> CareerPageService:
    return CareerPageService(db)


@router.get("", summary="This company's career page: draft and published versions")
async def get_page(user: dict = Depends(get_current_active_user), service: CareerPageService = Depends(get_service)):
    return success_response(data=await service.get(user["company_id"]), message="Career page retrieved.")


@router.put("/draft", summary="Save the draft (not visible to candidates until published)")
async def save_draft(
    body: Dict[str, Any],
    user: dict = Depends(get_current_active_user),
    service: CareerPageService = Depends(get_service),
):
    return success_response(data=await service.save_draft(user["company_id"], body), message="Draft saved.")


@router.post("/publish", summary="Publish the draft on the public careers page")
async def publish(
    request: Request,
    user: dict = Depends(get_current_active_user),
    service: CareerPageService = Depends(get_service),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    data = await service.publish(user["company_id"], user)
    await record_audit(db, user, "career_page.published", "career_page", user["company_id"], user.get("company_name", ""), request=request)
    return success_response(data=data, message="Career page published.")


@router.post("/discard", summary="Throw away draft changes (back to what is published)")
async def discard(user: dict = Depends(get_current_active_user), service: CareerPageService = Depends(get_service)):
    return success_response(data=await service.discard(user["company_id"]), message="Draft changes discarded.")


@public_router.get("", summary="A company's published careers page with its branding (no login)")
async def public_page(
    company: Optional[str] = Query(None, max_length=60, description="Company page address (slug); empty = the platform company"),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    slug = (company or "").strip().lower()
    with system_scope():
        doc = await db[COMPANIES_COLLECTION].find_one({"slug": slug} if slug else {"id": DEFAULT_COMPANY_ID})
        if not doc or doc.get("status") == COMPANY_STATUS_INACTIVE or doc.get("is_active") is False or doc.get("archived_at"):
            raise NotFoundError("This careers page was not found.")
        branding = await BrandingService(db).public_for_slug(doc.get("slug"))
    with company_scope(doc["id"]):
        data = await CareerPageService(db).public(doc)
    return success_response(data={**data, "branding": branding["branding"]}, message="Career page retrieved.")


# ── Domains ──────────────────────────────────────────────────────────────────

class SubdomainIn(BaseModel):
    enabled: bool


class CustomDomainIn(BaseModel):
    domain: str = Field(..., min_length=4, max_length=253)


def get_domains(db: AsyncIOMotorDatabase = Depends(get_database)) -> DomainService:
    return DomainService(db)


@router.get("/domains", summary="Where the career page lives: platform subdomain and custom domain")
async def get_domains_view(user: dict = Depends(get_current_active_user), domains: DomainService = Depends(get_domains)):
    return success_response(data=await domains.get(user["company_id"]), message="Domains retrieved.")


@router.put("/domains/subdomain", summary="Turn the platform subdomain on or off")
async def set_subdomain(body: SubdomainIn, request: Request, user: dict = Depends(get_current_active_user),
                        domains: DomainService = Depends(get_domains), db: AsyncIOMotorDatabase = Depends(get_database)):
    data = await domains.set_subdomain(user["company_id"], body.enabled)
    await record_audit(db, user, "career_page.subdomain", "career_page", user["company_id"], data["subdomain"],
                       {"subdomain_enabled": {"to": body.enabled}}, request=request)
    return success_response(data=data, message="Subdomain updated.")


@router.put("/domains/custom", summary="Set the custom domain (then add the DNS records and verify)")
async def set_custom(body: CustomDomainIn, request: Request, user: dict = Depends(get_current_active_user),
                     domains: DomainService = Depends(get_domains), db: AsyncIOMotorDatabase = Depends(get_database)):
    data = await domains.set_custom(user["company_id"], body.domain)
    await record_audit(db, user, "career_page.custom_domain", "career_page", user["company_id"], data["custom_domain"], request=request)
    return success_response(data=data, message="Custom domain saved. Add the DNS records, then verify.")


@router.post("/domains/custom/verify", summary="Check the DNS records of the custom domain")
async def verify_custom(request: Request, user: dict = Depends(get_current_active_user),
                        domains: DomainService = Depends(get_domains), db: AsyncIOMotorDatabase = Depends(get_database)):
    data = await domains.verify(user["company_id"])
    await record_audit(db, user, "career_page.domain_verified" if not data["problems"] else "career_page.domain_check_failed",
                       "career_page", user["company_id"], data["custom_domain"], details="; ".join(data["problems"]), request=request)
    return success_response(data=data, message="Domain verified." if not data["problems"] else "Not verified yet.")


@router.delete("/domains/custom", summary="Stop using the custom domain")
async def remove_custom(request: Request, user: dict = Depends(get_current_active_user),
                        domains: DomainService = Depends(get_domains), db: AsyncIOMotorDatabase = Depends(get_database)):
    data = await domains.remove_custom(user["company_id"])
    await record_audit(db, user, "career_page.custom_domain_removed", "career_page", user["company_id"], request=request)
    return success_response(data=data, message="Custom domain removed.")


@public_router.get("/resolve-host", summary="Which company's careers page a host shows (no login)")
async def resolve_host(host: str = Query(..., max_length=253), db: AsyncIOMotorDatabase = Depends(get_database)):
    with system_scope():
        slug = await DomainService(db).resolve_host(host)
    return success_response(data={"slug": slug}, message="Host resolved." if slug else "Not a careers host.")


@public_router.get("/tls-allowed", summary="For on-demand TLS (e.g. Caddy 'ask'): 200 only for verified careers hosts")
async def tls_allowed(domain: str = Query(..., max_length=253), db: AsyncIOMotorDatabase = Depends(get_database)):
    with system_scope():
        ok = await DomainService(db).tls_allowed(domain)
    if not ok:
        raise NotFoundError("Not a careers domain.")
    return success_response(data={"domain": domain}, message="Allowed.")



@router.get("/integration", summary="The website the embed was last seen on (Test my integration)")
async def integration_status(user: dict = Depends(get_current_active_user), db: AsyncIOMotorDatabase = Depends(get_database)):
    company = await db[COMPANIES_COLLECTION].find_one({"id": user["company_id"]}, {"careers_integration": 1}) or {}
    embed_ready = os.path.isfile(settings.CAREERS_EMBED_FILE)
    return success_response(data={"seen": company.get("careers_integration"), "embed_script_available": embed_ready},
                            message="Integration status retrieved.")


@public_router.get("/embed.js", summary="The embeddable careers script (build with npm run build:careers)")
async def embed_script():
    if not os.path.isfile(settings.CAREERS_EMBED_FILE):
        raise NotFoundError("The careers script hasn't been built on this server yet.")
    return FileResponse(
        settings.CAREERS_EMBED_FILE,
        media_type="application/javascript",
        headers={"Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*"},
    )
