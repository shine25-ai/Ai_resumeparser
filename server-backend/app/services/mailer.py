"""
Branded email (plan §3.5): every email a company sends carries its logo, brand colour, sender name, reply-to
address and footer.

- `email_context(db)`    the request company's email branding.
- `branded_html(...)`    a simple branded layout for emails that have none (invitations, codes, test sends).
- `brandify(html, ctx)`  re-colours the older built-in layouts (interview emails) with the brand and app name.
- `address(msg, ...)`    From (company sender name + the SMTP sender address) and Reply-To.
"""

import html as html_lib
import re
from contextvars import ContextVar
from typing import Any, Dict, Optional

from loguru import logger
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings
from app.core.tenant import current_company_id
from app.models.company import DEFAULT_COMPANY_ID

# The address callers used to reach the API, set per request (FileLinkMiddleware); emails need absolute logo URLs.
request_base_url: ContextVar[str] = ContextVar("request_base_url", default="")

DEFAULT_CONTEXT: Dict[str, Any] = {
    "app_name": "HireLogics",
    "company_name": "",
    "primary": "#1c7975",
    "accent": "#3b82f6",
    "logo_url": "",
    "from_name": "",
    "reply_to": "",
    "footer_text": "",
}


def _absolute(url: str) -> str:
    if not url:
        return ""
    if url.startswith("https://"):
        return url
    base = (getattr(settings, "PUBLIC_API_BASE_URL", "") or request_base_url.get() or "").rstrip("/")
    return f"{base}{url}" if base and url.startswith("/") else ""


async def email_context(db: AsyncIOMotorDatabase, company_id: Optional[str] = None) -> Dict[str, Any]:
    """The company's email branding. Never fails: on any problem the platform defaults are used."""
    from app.services.branding_service import BrandingService

    try:
        if db is None:
            from app.core.database import get_database

            db = get_database()
        data = await BrandingService(db).for_company(company_id or current_company_id() or DEFAULT_COMPANY_ID)
        b = data["effective"]
        return {
            "app_name": b.get("app_name") or DEFAULT_CONTEXT["app_name"],
            "company_name": data.get("company_name") or "",
            "primary": b["colors"]["primary"],
            "accent": b["colors"]["accent"],
            "logo_url": _absolute(b.get("logo_url", "")),
            "from_name": b["email"].get("from_name") or data.get("company_name") or "",
            "reply_to": b["email"].get("reply_to") or "",
            "footer_text": b["email"].get("footer_text") or "",
        }
    except Exception as e:
        logger.warning(f"Email branding unavailable, using defaults: {e}")
        return dict(DEFAULT_CONTEXT)


def address(msg: Any, config: Any, ctx: Dict[str, Any]) -> None:
    """From: '<company sender name> <smtp sender address>' and Reply-To, on an EmailMessage."""
    name = (ctx.get("from_name") or getattr(config, "sender_name", "") or "").replace('"', "").strip()
    sender = getattr(config, "sender_email", "")
    if "From" in msg:
        del msg["From"]
    msg["From"] = f"{name} <{sender}>" if name else sender
    if ctx.get("reply_to"):
        if "Reply-To" in msg:
            del msg["Reply-To"]
        msg["Reply-To"] = ctx["reply_to"]


def _darker(hex_color: str, factor: float = 0.82) -> str:
    rgb = [int(hex_color[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{max(0, int(c * factor)):02x}" for c in rgb)


def _rgba(hex_color: str, alpha: float) -> str:
    r, g, b = (int(hex_color[i:i + 2], 16) for i in (1, 3, 5))
    return f"rgba({r}, {g}, {b}, {alpha})"


def _header(ctx: Dict[str, Any]) -> str:
    name = html_lib.escape(ctx.get("app_name") or "")
    logo = ctx.get("logo_url")
    logo_html = (
        f'<img src="{html_lib.escape(logo)}" alt="{name}" height="32" '
        f'style="height:32px;max-width:160px;vertical-align:middle;border:0;background:#ffffff;border-radius:6px;padding:3px;">'
        if logo else ""
    )
    return (
        f'<td style="background:{ctx["primary"]};padding:20px 32px;">'
        f'{logo_html}<span style="color:#ffffff;font-size:17px;font-weight:800;vertical-align:middle;'
        f'{"margin-left:10px;" if logo else ""}">{name}</span></td>'
    )


def _footer(ctx: Dict[str, Any]) -> str:
    text = html_lib.escape(ctx.get("footer_text") or "").replace("\n", "<br>")
    name = html_lib.escape(ctx.get("company_name") or ctx.get("app_name") or "")
    return (
        '<td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px;line-height:1.5;">'
        f'<div style="font-weight:700;color:#475569;">{name}</div>'
        f'{f"<div>{text}</div>" if text else ""}</td>'
    )


def branded_html(ctx: Dict[str, Any], body_html: str, button: Optional[Dict[str, str]] = None) -> str:
    """A branded email around `body_html` (already safe HTML). `button`: {"label", "url"}."""
    cta = ""
    if button and button.get("url"):
        cta = (
            f'<tr><td style="padding:0 32px 28px 32px;"><a href="{html_lib.escape(button["url"])}" '
            f'style="display:inline-block;background:{ctx["primary"]};color:#ffffff;font-weight:700;font-size:14px;'
            f'text-decoration:none;padding:12px 24px;border-radius:8px;">{html_lib.escape(button.get("label", "Open"))}</a></td></tr>'
        )
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f1f5f9;padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:580px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
<tr>{_header(ctx)}</tr>
<tr><td style="padding:28px 32px 20px 32px;color:#334155;font-size:14px;line-height:1.6;">{body_html}</td></tr>
{cta}
<tr>{_footer(ctx)}</tr>
</table></td></tr></table></body></html>"""


_OLD_BRAND = {
    "#4f46e5": "primary",
    "#4338ca": "primary_dark",
    "#6366f1": "primary",
    "#3b82f6": "accent",
}


def brandify(html: str, ctx: Dict[str, Any]) -> str:
    """Re-colour a built-in layout (indigo) with the company brand and put the app name in its footer."""
    colors = {"primary": ctx["primary"], "primary_dark": _darker(ctx["primary"]), "accent": ctx["accent"]}
    out = re.sub(
        "|".join(re.escape(k) for k in _OLD_BRAND),
        lambda m: colors[_OLD_BRAND[m.group(0).lower()]],
        html,
        flags=re.IGNORECASE,
    )
    out = out.replace("rgba(79, 70, 229, 0.3)", _rgba(ctx["primary"], 0.3))
    out = out.replace("AI Recruiter", html_lib.escape(ctx.get("app_name") or "HireLogics"))
    # Logo above the header title, when the company has one.
    if ctx.get("logo_url") and "<!-- Header Banner -->" in out:
        logo = (
            f'<img src="{html_lib.escape(ctx["logo_url"])}" alt="" height="28" '
            'style="height:28px;max-width:140px;border:0;background:#ffffff;border-radius:6px;padding:3px;margin-bottom:10px;display:block;">'
        )
        out = re.sub(r'(<!-- Header Banner -->\s*<tr>\s*<td[^>]*>)', r"\1" + logo.replace("\\", "\\\\"), out, count=1)
    if ctx.get("footer_text"):
        footer = html_lib.escape(ctx["footer_text"]).replace("\n", "<br>")
        out = out.replace("</body>", f'<div style="text-align:center;color:#94a3b8;font-size:11px;padding:0 12px 24px;">{footer}</div></body>', 1)
    return out
