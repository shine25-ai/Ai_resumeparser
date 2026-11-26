"""
User invitations (SRS 4.17 / Screen 19): a company admin invites someone by email; they open the link, choose a
password and join that company with the role and department picked for them.

The link carries a random token; only its SHA-256 is stored. Invitations expire after INVITE_DAYS and are single
use. If the company has no email settings (or sending fails), the admin gets the link to share themselves.
"""

import asyncio
import html as html_lib
import hashlib
import secrets
import smtplib
from datetime import timedelta
from email.message import EmailMessage
from typing import Any, Dict, List, Optional

from loguru import logger
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.core.tenant import company_scope, current_company_id, system_scope
from app.models.company import email_allowed
from app.repositories.role_repository import RoleRepository
from app.models.settings import EmailConfigModel
from app.repositories.user_repository import UserRepository
from app.schemas.user import UserCreate
from app.services.mailer import address, branded_html, email_context
from app.services.user_service import UserService
from app.utils.constants import COMPANIES_COLLECTION
from app.utils.encryption import decrypt_password
from app.utils.helpers import generate_uuid, utc_now

INVITATIONS_COLLECTION = "user_invitations"
INVITE_DAYS = 7
ACCEPT_PATH = "/accept-invite"


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _public(inv: Dict[str, Any]) -> Dict[str, Any]:
    out = {k: v for k, v in inv.items() if k not in ("_id", "token_hash")}
    if out.get("status") == "pending" and out.get("expires_at", "") < utc_now().isoformat():
        out["status"] = "expired"
    return out


class InvitationService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.users = UserService(UserRepository(db), RoleRepository(db))

    @property
    def col(self):
        return self.db[INVITATIONS_COLLECTION]

    async def _company(self, company_id: Optional[str] = None) -> Dict[str, Any]:
        company = await self.db[COMPANIES_COLLECTION].find_one({"id": company_id or current_company_id()})
        if not company:
            raise NotFoundError("Company not found.")
        return company

    async def list(self) -> List[Dict[str, Any]]:
        docs = await self.col.find({"status": {"$in": ["pending", "accepted", "revoked"]}}).sort("created_at", -1).to_list(length=500)
        return [_public(d) for d in docs]

    async def create(
        self, actor: Dict[str, Any], email: str, full_name: str, role: str, department: str, app_url: str
    ) -> Dict[str, Any]:
        email = (email or "").strip().lower()
        company = await self._company()
        if not email_allowed(company, email):
            domains = ", ".join("@" + d for d in company.get("email_domains") or [])
            raise BadRequestError(f"{company.get('name', 'This company')} only allows email addresses at {domains}.")
        UserService._check_role_change(actor, role)
        if await self.users.user_repo.get_by_email(email):
            raise ConflictError(f"{email} already has an account.")
        if await self.col.find_one({"email": email, "status": "pending", "expires_at": {"$gt": utc_now().isoformat()}}):
            raise ConflictError(f"{email} already has a pending invitation. Resend it instead.")
        pending = await self.col.count_documents({"status": "pending", "expires_at": {"$gt": utc_now().isoformat()}})
        await self.users.check_user_limit(extra=pending)

        token = secrets.token_urlsafe(32)
        now = utc_now()
        doc = {
            "id": generate_uuid(),
            "email": email,
            "full_name": (full_name or "").strip(),
            "role": (role or "user").strip(),
            "department": (department or "").strip(),
            "status": "pending",
            "token_hash": _hash(token),
            "invited_by": {"id": actor.get("id"), "name": actor.get("full_name") or actor.get("email")},
            "created_at": now.isoformat(),
            "expires_at": (now + timedelta(days=INVITE_DAYS)).isoformat(),
        }
        await self.col.insert_one(doc)
        return await self._deliver(doc, token, company, app_url)

    async def resend(self, invitation_id: str, app_url: str) -> Dict[str, Any]:
        doc = await self.col.find_one({"id": invitation_id})
        if not doc or doc.get("status") not in ("pending",):
            raise NotFoundError("Pending invitation not found.")
        token = secrets.token_urlsafe(32)
        now = utc_now()
        changes = {"token_hash": _hash(token), "expires_at": (now + timedelta(days=INVITE_DAYS)).isoformat(), "updated_at": now.isoformat()}
        await self.col.update_one({"id": invitation_id}, {"$set": changes})
        return await self._deliver({**doc, **changes}, token, await self._company(), app_url)

    async def revoke(self, invitation_id: str) -> Dict[str, Any]:
        doc = await self.col.find_one({"id": invitation_id, "status": "pending"})
        if not doc:
            raise NotFoundError("Pending invitation not found.")
        await self.col.update_one({"id": invitation_id}, {"$set": {"status": "revoked", "updated_at": utc_now().isoformat()}})
        return _public({**doc, "status": "revoked"})

    async def _deliver(self, doc: Dict[str, Any], token: str, company: Dict[str, Any], app_url: str) -> Dict[str, Any]:
        link = f"{app_url.rstrip('/')}{ACCEPT_PATH}?token={token}"
        sent = False
        doc_config = await self.db["settings"].find_one({"type": "email_config"})
        config = EmailConfigModel(**doc_config) if doc_config else None
        if config:
            try:
                ctx = await email_context(self.db, company["id"])
                await asyncio.to_thread(self._send, config, doc, company, link, ctx)
                sent = True
            except Exception as e:
                logger.warning(f"Could not email invitation to {doc['email']}: {e}")
        # The link is returned only when it could not be emailed, so the admin can share it another way.
        return {**_public(doc), "email_sent": sent, "invite_link": None if sent else link}

    @staticmethod
    def _send(config: Any, doc: Dict[str, Any], company: Dict[str, Any], link: str, ctx: Dict[str, Any]) -> None:
        msg = EmailMessage()
        msg["Subject"] = f"You're invited to join {company.get('name', 'the team')} on {ctx.get('app_name') or 'the recruitment portal'}"
        address(msg, config, ctx)
        msg["To"] = doc["email"]
        who = doc.get("invited_by", {}).get("name") or "Your administrator"
        text = (
            f"Hello {doc.get('full_name') or ''},\n\n"
            f"{who} invited you to {company.get('name')}'s recruitment workspace.\n\n"
            f"Accept the invitation and choose your password:\n{link}\n\n"
            f"The link works once and expires in {INVITE_DAYS} days."
        )
        msg.set_content(text)
        body = (
            f"<p>Hello {html_lib.escape(doc.get('full_name') or '')},</p>"
            f"<p><b>{html_lib.escape(who)}</b> invited you to <b>{html_lib.escape(company.get('name', ''))}</b>'s recruitment workspace.</p>"
            f"<p>Accept the invitation and choose your password. The link works once and expires in {INVITE_DAYS} days.</p>"
        )
        msg.add_alternative(branded_html(ctx, body, {"label": "Accept invitation", "url": link}), subtype="html")
        if config.use_ssl:
            server = smtplib.SMTP_SSL(config.smtp_server, config.smtp_port, timeout=30)
        else:
            server = smtplib.SMTP(config.smtp_server, config.smtp_port, timeout=30)
            if config.use_tls:
                server.starttls()
        try:
            server.login(config.smtp_username, decrypt_password(config.smtp_password))
            server.send_message(msg)
        finally:
            server.quit()

    # ── Public (no login): the person who was invited ──────────────────────────

    async def _by_token(self, token: str) -> Dict[str, Any]:
        if not token or len(token) < 20:
            raise NotFoundError("This invitation link is not valid.")
        with system_scope():
            doc = await self.col.find_one({"token_hash": _hash(token)})
        if not doc or doc.get("status") != "pending":
            raise NotFoundError("This invitation has already been used or was cancelled.")
        if doc.get("expires_at", "") < utc_now().isoformat():
            raise BadRequestError("This invitation has expired. Ask your administrator to send a new one.")
        return doc

    async def lookup(self, token: str) -> Dict[str, Any]:
        doc = await self._by_token(token)
        company = await self._company(doc["company_id"])
        if company.get("is_active") is False or company.get("archived_at"):
            raise BadRequestError("This company's workspace is turned off.")
        return {
            "email": doc["email"],
            "full_name": doc.get("full_name", ""),
            "role": doc.get("role"),
            "department": doc.get("department", ""),
            "company_name": company.get("name"),
            "company_logo_url": company.get("logo_url", ""),
            "expires_at": doc["expires_at"],
        }

    async def accept(self, token: str, full_name: str, password: str) -> Dict[str, Any]:
        doc = await self._by_token(token)
        info = await self.lookup(token)
        with company_scope(doc["company_id"]):
            user = await self.users.create_user(
                UserCreate(
                    full_name=(full_name or doc.get("full_name") or "").strip(),
                    email=doc["email"],
                    password=password,
                    role=doc.get("role") or "user",
                    department=doc.get("department", ""),
                ),
                actor=None,
            )
            await self.col.update_one(
                {"id": doc["id"]},
                {"$set": {"status": "accepted", "accepted_at": utc_now().isoformat(), "user_id": user.id}, "$unset": {"token_hash": ""}},
            )
        return {"email": user.email, "company_name": info["company_name"]}
