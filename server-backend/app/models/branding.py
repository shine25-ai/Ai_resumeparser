"""
White-label branding (plan §3).

Three layers, each filling what the one above leaves empty:
  1. PLATFORM_DEFAULT_BRANDING - built in; the look of the HireLogics mockups (navy sidebar, teal primary).
  2. The platform's branding   - Platform Settings, set by the super admin (platform name, logo, colours).
  3. A company's branding      - companies.branding, set by that company's admin.
Each user then picks light or dark, when the company allows it.

Stored documents only hold what was changed (partial); `effective_branding` merges the layers.
"""

import re
from typing import Any, Dict, Optional

from app.core.exceptions import BadRequestError

HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
FONTS = ("Inter", "Roboto", "Poppins", "Open Sans", "Lato", "Nunito", "Source Sans 3")
RADII = ("sm", "md", "lg")
DARK_MODES = ("off", "user_choice", "system")

PLATFORM_DEFAULT_BRANDING: Dict[str, Any] = {
    "app_name": "HireLogics",
    "colors": {
        "primary": "#1c7975",      # buttons, links, active items (the mockups' teal button; 5.2:1 with white text)
        "secondary": "#2563eb",    # second buttons, tags, highlights on the careers page
        "accent": "#3b82f6",       # charts, badges
        "text": "#111827",         # body text on the careers page
        "sidebar_bg": "#0b2240",   # navy sidebar
        "sidebar_text": "#cbd5e1",
        "background": "#f4f7fb",   # page background
    },
    "dark": {
        "primary": "",             # empty: the light primary, lightened for dark backgrounds
        "background": "#0b1120",
        "surface": "#111827",
        "sidebar_bg": "#070f1f",
    },
    "dark_mode": "user_choice",
    "font_family": "Inter",
    "radius": "md",
    "logo_url": "",
    "logo_dark_url": "",
    "favicon_url": "",
    "login": {
        "background_url": "",
        "welcome_title": "Welcome back",
        "welcome_text": "Sign in to manage jobs, candidates and interviews.",
    },
    "email": {
        "from_name": "",           # empty: the company name
        "reply_to": "",
        "footer_text": "",
    },
}

COLOR_FIELDS = ("primary", "secondary", "accent", "text", "sidebar_bg", "sidebar_text", "background")
DARK_FIELDS = ("primary", "background", "surface", "sidebar_bg")
ASSET_FIELDS = ("logo_url", "logo_dark_url", "favicon_url")


def _deep_merge(base: Dict[str, Any], over: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    out = dict(base)
    for k, v in (over or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        elif v not in (None, ""):
            out[k] = v
    return out


def effective_branding(platform: Optional[Dict[str, Any]], company: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    return _deep_merge(_deep_merge(PLATFORM_DEFAULT_BRANDING, platform), company)


def _color(value: Any, field: str, allow_empty: bool = True) -> str:
    v = (value or "").strip()
    if not v and allow_empty:
        return ""
    if not HEX.match(v):
        raise BadRequestError(f"{field} must be a colour like #0d9488.")
    return v.lower()


def _text(value: Any, limit: int) -> str:
    return str(value or "").strip()[:limit]


def clean_branding(data: Dict[str, Any]) -> Dict[str, Any]:
    """Validate a (partial) branding update. Empty strings mean 'use the default'."""
    out: Dict[str, Any] = {}
    if "app_name" in data:
        out["app_name"] = _text(data["app_name"], 60)
    if isinstance(data.get("colors"), dict):
        out["colors"] = {k: _color(v, k) for k, v in data["colors"].items() if k in COLOR_FIELDS}
    if isinstance(data.get("dark"), dict):
        out["dark"] = {k: _color(v, f"dark {k}") for k, v in data["dark"].items() if k in DARK_FIELDS}
    if "dark_mode" in data:
        if data["dark_mode"] not in DARK_MODES:
            raise BadRequestError("Dark mode must be off, user_choice or system.")
        out["dark_mode"] = data["dark_mode"]
    if "font_family" in data:
        if data["font_family"] and data["font_family"] not in FONTS:
            raise BadRequestError(f"Font must be one of: {', '.join(FONTS)}.")
        out["font_family"] = data["font_family"] or ""
    if "radius" in data:
        if data["radius"] and data["radius"] not in RADII:
            raise BadRequestError("Corner style must be sm, md or lg.")
        out["radius"] = data["radius"] or ""
    for k in ASSET_FIELDS:
        if k in data:
            out[k] = _asset_url(data[k], k)
    if isinstance(data.get("login"), dict):
        login = data["login"]
        out["login"] = {
            **({"background_url": _asset_url(login["background_url"], "login background")} if "background_url" in login else {}),
            **({"welcome_title": _text(login["welcome_title"], 80)} if "welcome_title" in login else {}),
            **({"welcome_text": _text(login["welcome_text"], 240)} if "welcome_text" in login else {}),
        }
    if isinstance(data.get("email"), dict):
        email = data["email"]
        clean: Dict[str, Any] = {}
        if "from_name" in email:
            clean["from_name"] = _text(email["from_name"], 80)
        if "reply_to" in email:
            reply = _text(email["reply_to"], 120).lower()
            if reply and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", reply):
                raise BadRequestError("Reply-to must be an email address.")
            clean["reply_to"] = reply
        if "footer_text" in email:
            clean["footer_text"] = _text(email["footer_text"], 500)
        out["email"] = clean
    return out


def _asset_url(value: Any, field: str) -> str:
    """Branding images are uploaded through the API (or are https links)."""
    v = str(value or "").strip()
    if not v:
        return ""
    if v.startswith("/api/v1/public/branding/assets/") or v.startswith("https://"):
        return v[:500]
    raise BadRequestError(f"{field} must be an uploaded image or an https:// link.")


# ── Contrast (WCAG 2.1) ───────────────────────────────────────────────────────

def _luminance(hex_color: str) -> float:
    rgb = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    lin = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def contrast_ratio(a: str, b: str) -> float:
    la, lb = sorted((_luminance(a), _luminance(b)), reverse=True)
    return round((la + 0.05) / (lb + 0.05), 2)


def contrast_warnings(branding: Dict[str, Any]) -> list:
    """Readability warnings (WCAG AA: 4.5 for text). Advice only; saving is never blocked."""
    c = branding["colors"]
    checks = [
        ("White text on the primary colour", "#ffffff", c["primary"], 4.5),
        ("Primary colour as link text on the page background", c["primary"], c["background"], 3.0),
        ("Sidebar text on the sidebar", c["sidebar_text"], c["sidebar_bg"], 4.5),
        ("Text colour on the page background", c["text"], c["background"], 4.5),
    ]
    out = []
    for label, fg, bg, need in checks:
        ratio = contrast_ratio(fg, bg)
        if ratio < need:
            out.append({"check": label, "ratio": ratio, "needed": need})
    return out


def public_branding(branding: Dict[str, Any]) -> Dict[str, Any]:
    """What pages without sign-in (login, careers, invitations) may see: no email settings."""
    return {k: v for k, v in branding.items() if k != "email"}
