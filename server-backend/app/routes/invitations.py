"""
User invitations. Company admins invite, resend and cancel; the invited person opens the public link to join.
"""

from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr, Field

from app.core.database import get_database
from app.core.dependencies import require_company_admin
from app.core.rate_limit import hit_ip
from app.services.audit_service import record_audit
from app.services.invitation_service import InvitationService
from app.utils.response import success_response

router = APIRouter(prefix="/api/v1/invitations", tags=["User Invitations"])
public_router = APIRouter(prefix="/api/v1/public/invitations", tags=["User Invitations (public)"])


class InviteIn(BaseModel):
    email: EmailStr
    full_name: str = Field(default="", max_length=100)
    role: str = Field(..., min_length=1, max_length=60)
    department: str = Field(default="", max_length=120)
    app_url: Optional[str] = Field(default=None, max_length=200, description="The portal address for the link; defaults to the request's Origin")


class AcceptIn(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    password: str = Field(..., min_length=8, max_length=128)


def get_service(db: AsyncIOMotorDatabase = Depends(get_database)) -> InvitationService:
    return InvitationService(db)


def _app_url(request: Request, given: Optional[str]) -> str:
    for candidate in (given, request.headers.get("origin"), str(request.base_url)):
        if not candidate:
            continue
        parsed = urlparse(candidate)
        if parsed.scheme in ("http", "https") and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}"
    return str(request.base_url).rstrip("/")


@router.get("", summary="Invitations of this company")
async def list_invitations(_admin: dict = Depends(require_company_admin), service: InvitationService = Depends(get_service)):
    return success_response(data=await service.list(), message="Invitations retrieved.")


@router.post("", status_code=status.HTTP_201_CREATED, summary="Invite someone to this company")
async def invite(
    body: InviteIn,
    request: Request,
    admin: dict = Depends(require_company_admin),
    service: InvitationService = Depends(get_service),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    data = await service.create(admin, body.email, body.full_name, body.role, body.department, _app_url(request, body.app_url))
    await record_audit(db, admin, "user.invited", "invitation", data["id"], data["email"],
                       {"role": {"to": data["role"]}}, request=request)
    msg = "Invitation emailed." if data["email_sent"] else "Invitation created. Email isn't set up, so share the link yourself."
    return success_response(data=data, message=msg, status_code=status.HTTP_201_CREATED)


@router.post("/{invitation_id}/resend", summary="Send a new link (the old one stops working)")
async def resend(
    invitation_id: str,
    request: Request,
    admin: dict = Depends(require_company_admin),
    service: InvitationService = Depends(get_service),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    data = await service.resend(invitation_id, _app_url(request, None))
    await record_audit(db, admin, "user.invitation_resent", "invitation", invitation_id, data["email"], request=request)
    return success_response(data=data, message="Invitation sent again." if data["email_sent"] else "New link created.")


@router.delete("/{invitation_id}", summary="Cancel a pending invitation")
async def revoke(
    invitation_id: str,
    request: Request,
    admin: dict = Depends(require_company_admin),
    service: InvitationService = Depends(get_service),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    data = await service.revoke(invitation_id)
    await record_audit(db, admin, "user.invitation_cancelled", "invitation", invitation_id, data["email"], request=request)
    return success_response(data=data, message="Invitation cancelled.")


@public_router.get("/{token}", summary="Who the invitation is for (no login)")
async def lookup(token: str, service: InvitationService = Depends(get_service)):
    return success_response(data=await service.lookup(token), message="Invitation found.")


@public_router.post("/{token}/accept", summary="Accept: set your name and password (no login)")
async def accept(
    token: str,
    body: AcceptIn,
    request: Request,
    service: InvitationService = Depends(get_service),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    await hit_ip(db, "invitation_accept:ip", request)
    data = await service.accept(token, body.full_name, body.password)
    await record_audit(db, {"full_name": body.full_name, "email": data["email"]}, "user.invitation_accepted", "user",
                       "", data["email"], request=request, target_company_id=await _company_of(db, data["email"]))
    return success_response(data=data, message=f"Welcome to {data['company_name']}. You can sign in now.")


async def _company_of(db: AsyncIOMotorDatabase, email: str) -> Optional[str]:
    from app.repositories.user_repository import UserRepository

    user = await UserRepository(db).get_by_email(email)
    return (user or {}).get("company_id")
