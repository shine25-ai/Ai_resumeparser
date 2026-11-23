"""
Career page builder (SRS 4.5, Screen 15): each company's public careers page as ordered sections, edited as a
draft and published when ready.

Stored per company in `career_pages` (id = company id):
    {draft: <content>, published: <content> | None, published_at, published_by, updated_at}

Content:
    template   classic | modern | minimal
    header     {show, links: [{label, url}]}                    (logo and name come from Branding)
    hero       {eyebrow, title, subtitle, banner_url, cta_label}
    sections   [{id, type, visible, title, ...}] in page order; exactly one "open_positions"
    texts      {search_placeholder, empty_message, success_title, success_message}
    footer     {show, text, website, email, linkedin, links: [{label, url}]}
    seo        {title, description, share_image_url}

The page text saved before the builder existed (careers_page_settings) becomes the first draft and publication.
"""

import copy
import re
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.exceptions import BadRequestError, NotFoundError
from app.models.job_opening import CAREERS_PAGE_DEFAULTS
from app.utils.constants import COMPANIES_COLLECTION
from app.utils.helpers import generate_uuid, utc_now

CAREER_PAGES_COLLECTION = "career_pages"
OLD_SETTINGS_COLLECTION = "careers_page_settings"

TEMPLATES = ("classic", "modern", "minimal")
SECTION_TYPES = {
    "open_positions": "Open positions",
    "about": "About us",
    "culture": "Our culture",
    "life": "Life at the company",
    "benefits": "Benefits",
    "testimonials": "Employee stories",
    "faq": "FAQs",
    "gallery": "Workplace gallery",
    "video": "Culture video",
    "highlights": "Highlights strip",
}
ITEM_TYPES = {"life", "benefits", "testimonials", "faq", "highlights"}
ICON_TYPES = {"benefits", "highlights", "life"}
ICON = re.compile(r"^[a-z0-9-]{1,40}$")
HERO_LAYOUTS = ("background", "split")
MAX_STATS = 4
# Job page closing banner ("Be part of our journey").
EXTRA_TEXTS = {
    "job_cta_title": "Be part of our journey",
    "job_cta_text": "Work on meaningful products, grow your skills and make an impact.",
}
MAX_SECTIONS = 20
MAX_ITEMS = 12
ASSET_PREFIX = "/api/v1/public/branding/assets/"
VIDEO_HOSTS = re.compile(r"^https://(www\.)?(youtube\.com|youtu\.be|player\.vimeo\.com|vimeo\.com)/", re.I)
SLUG_CHARS = re.compile(r"[^a-z0-9_-]")


def _t(value: Any, limit: int) -> str:
    return str(value or "").strip()[:limit]


def _url(value: Any, field: str, allow_asset: bool = True) -> str:
    v = str(value or "").strip()
    if not v:
        return ""
    if allow_asset and v.startswith(ASSET_PREFIX):
        return v[:300]
    if v.startswith("https://") or v.startswith("http://"):
        return v[:500]
    if v.startswith("mailto:") and "@" in v:
        return v[:200]
    raise BadRequestError(f"{field} must be a link starting with https://.")


def _target(value: Any, field: str) -> str:
    """Where a button goes: a section on the page (#open_positions) or a link."""
    v = str(value or "").strip()
    if not v:
        return ""
    if v.startswith("#"):
        return "#" + SLUG_CHARS.sub("", v[1:].lower())[:40]
    return _url(v, field, allow_asset=False)


def _icon(value: Any) -> str:
    v = str(value or "").strip().lower()
    return v if ICON.match(v) else ""


def _stats(values: Any) -> List[Dict[str, str]]:
    out = []
    for st in list(values or [])[:MAX_STATS]:
        value, label = _t((st or {}).get("value"), 20), _t((st or {}).get("label"), 40)
        if value:
            out.append({"value": value, "label": label})
    return out


def _links(values: Any, field: str) -> List[Dict[str, str]]:
    out = []
    for link in list(values or [])[:8]:
        label = _t((link or {}).get("label"), 40)
        url = _url((link or {}).get("url"), f"{field} link", allow_asset=False)
        if label and url:
            out.append({"label": label, "url": url})
    return out


def default_content(company_name: str, old: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """A new company's page; `old` is the text saved before the builder existed."""
    old = {k: v for k, v in (old or {}).items() if isinstance(v, str) and v.strip()}
    base = {**CAREERS_PAGE_DEFAULTS, **old}
    name = company_name or "us"
    return {
        "template": "classic",
        "header": {"show": True, "links": [], "cta": {"label": "", "target": ""}},
        "hero": {
            "eyebrow": old.get("hero_eyebrow") or f"Careers at {name}",
            "title": base["hero_title"],
            "subtitle": base["hero_subtitle"],
            "banner_url": "",
            "cta_label": "Explore open positions",
            "secondary_cta_label": "",
            "secondary_cta_target": "",
            "badge_text": "",
            "layout": "background",
        },
        "sections": [
            {"id": "about", "type": "about", "visible": False, "title": f"About {name}",
             "text": f"Tell candidates what {name} does and why it matters.", "stats": [], "image_url": "", "video_url": ""},
            {"id": "open_positions", "type": "open_positions", "visible": True,
             "title": base["listing_title"], "subtitle": base["listing_subtitle"]},
            {"id": "benefits", "type": "benefits", "visible": False, "title": "Why work with us", "items": [
                {"title": "Learning budget", "text": "Courses, books and conferences, paid for.", "icon": "graduation-cap"},
                {"title": "Health cover", "text": "Medical insurance for you and your family.", "icon": "shield-check"},
                {"title": "Flexible work", "text": "Hybrid working and flexible hours.", "icon": "laptop"},
            ]},
        ],
        "texts": {
            "search_placeholder": base["search_placeholder"],
            "empty_message": base["empty_message"],
            "success_title": base["success_title"],
            "success_message": base["success_message"],
            **EXTRA_TEXTS,
        },
        "footer": {"show": True, "text": "", "website": "", "email": "", "linkedin": "", "links": []},
        "seo": {"title": f"Careers at {name}", "description": base["hero_subtitle"], "share_image_url": ""},
    }


def new_section(section_type: str) -> Dict[str, Any]:
    if section_type not in SECTION_TYPES or section_type == "open_positions":
        raise BadRequestError("Unknown section type.")
    section: Dict[str, Any] = {"id": f"{section_type}-{generate_uuid()[:8]}", "type": section_type, "visible": True,
                               "title": SECTION_TYPES[section_type]}
    if section_type in ITEM_TYPES:
        section["items"] = []
    elif section_type == "gallery":
        section["images"] = []
    elif section_type == "video":
        section["url"] = ""
    else:
        section["text"] = ""
        if section_type == "about":
            section.update({"stats": [], "image_url": "", "video_url": ""})
    return section


def _clean_item(section_type: str, item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    item = item or {}
    if section_type == "faq":
        q, a = _t(item.get("q"), 200), _t(item.get("a"), 1500)
        return {"q": q, "a": a} if q else None
    if section_type == "testimonials":
        quote = _t(item.get("quote"), 600)
        if not quote:
            return None
        return {"name": _t(item.get("name"), 80), "role": _t(item.get("role"), 80), "quote": quote,
                "photo_url": _url(item.get("photo_url"), "Photo")}
    title = _t(item.get("title"), 80)
    if not title:
        return None
    out = {"title": title, "text": _t(item.get("text"), 600)}
    if section_type in ICON_TYPES:
        out["icon"] = _icon(item.get("icon"))
    if section_type == "life":
        out["image_url"] = _url(item.get("image_url"), "Image")
    return out


def clean_content(data: Dict[str, Any]) -> Dict[str, Any]:
    """Validate a whole page. Raises BadRequestError with a message people can act on."""
    if not isinstance(data, dict):
        raise BadRequestError("The page content is not valid.")
    template = data.get("template") or "classic"
    if template not in TEMPLATES:
        raise BadRequestError("Template must be classic, modern or minimal.")
    header = data.get("header") or {}
    hero = data.get("hero") or {}
    texts = data.get("texts") or {}
    footer = data.get("footer") or {}
    seo = data.get("seo") or {}

    sections_in = list(data.get("sections") or [])[:MAX_SECTIONS]
    sections: List[Dict[str, Any]] = []
    seen_ids = set()
    for raw in sections_in:
        raw = raw or {}
        stype = raw.get("type")
        if stype not in SECTION_TYPES:
            raise BadRequestError(f"Unknown section type '{stype}'.")
        sid = SLUG_CHARS.sub("", str(raw.get("id") or "").lower())[:40] or f"{stype}-{generate_uuid()[:8]}"
        if sid in seen_ids:
            sid = f"{sid}-{generate_uuid()[:4]}"
        seen_ids.add(sid)
        section: Dict[str, Any] = {"id": sid, "type": stype, "visible": bool(raw.get("visible", True)),
                                   "title": _t(raw.get("title"), 120) or SECTION_TYPES[stype]}
        if stype == "open_positions":
            section["subtitle"] = _t(raw.get("subtitle"), 300)
        elif stype in ("about", "culture"):
            section["text"] = _t(raw.get("text"), 5000)
            if stype == "about":
                section["stats"] = _stats(raw.get("stats"))
                section["image_url"] = _url(raw.get("image_url"), "About image")
                video = _url(raw.get("video_url"), "Video link", allow_asset=False)
                if video and not VIDEO_HOSTS.match(video):
                    raise BadRequestError("Video must be a YouTube or Vimeo link.")
                section["video_url"] = video
            if stype == "culture":
                section["image_url"] = _url(raw.get("image_url"), "Culture image")
        elif stype in ITEM_TYPES:
            items = [_clean_item(stype, i) for i in list(raw.get("items") or [])[:MAX_ITEMS]]
            section["items"] = [i for i in items if i]
        elif stype == "gallery":
            section["images"] = [u for u in (_url(i, "Gallery image") for i in list(raw.get("images") or [])[:MAX_ITEMS]) if u]
        elif stype == "video":
            url = _url(raw.get("url"), "Video link", allow_asset=False)
            if url and not VIDEO_HOSTS.match(url):
                raise BadRequestError("Video must be a YouTube or Vimeo link.")
            section["url"] = url
        sections.append(section)
    positions = [s for s in sections if s["type"] == "open_positions"]
    if len(positions) != 1:
        raise BadRequestError("The page needs exactly one Open positions section.")
    if not positions[0]["visible"]:
        raise BadRequestError("The Open positions section can't be hidden: candidates apply from it.")

    return {
        "template": template,
        "header": {
            "show": bool(header.get("show", True)),
            "links": _links(header.get("links"), "Header"),
            "cta": {"label": _t((header.get("cta") or {}).get("label"), 30),
                    "target": _target((header.get("cta") or {}).get("target"), "Header button")},
        },
        "hero": {
            "eyebrow": _t(hero.get("eyebrow"), 100),
            "title": _t(hero.get("title"), 150) or "Join our team",
            "subtitle": _t(hero.get("subtitle"), 300),
            "banner_url": _url(hero.get("banner_url"), "Banner"),
            "cta_label": _t(hero.get("cta_label"), 40) or "Explore open positions",
            "secondary_cta_label": _t(hero.get("secondary_cta_label"), 40),
            "secondary_cta_target": _target(hero.get("secondary_cta_target"), "Second button"),
            "badge_text": _t(hero.get("badge_text"), 60),
            "layout": hero.get("layout") if hero.get("layout") in HERO_LAYOUTS else "background",
        },
        "sections": sections,
        "texts": {
            **{k: _t(texts.get(k), 300) or CAREERS_PAGE_DEFAULTS[k]
               for k in ("search_placeholder", "empty_message", "success_title", "success_message")},
            **{k: _t(texts.get(k), 300) or v for k, v in EXTRA_TEXTS.items()},
        },
        "footer": {
            "show": bool(footer.get("show", True)),
            "text": _t(footer.get("text"), 300),
            "website": _url(footer.get("website"), "Website", allow_asset=False),
            "email": _t(footer.get("email"), 120),
            "linkedin": _url(footer.get("linkedin"), "LinkedIn", allow_asset=False),
            "links": _links(footer.get("links"), "Footer"),
        },
        "seo": {
            "title": _t(seo.get("title"), 70),
            "description": _t(seo.get("description"), 160),
            "share_image_url": _url(seo.get("share_image_url"), "Share image"),
        },
    }


def with_content_defaults(content: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Pages saved before a field existed get its default, so the API shape is always the same."""
    if not content:
        return content
    out = copy.deepcopy(content)
    header = out.setdefault("header", {})
    header.setdefault("cta", {"label": "", "target": ""})
    hero = out.setdefault("hero", {})
    for k, v in (("secondary_cta_label", ""), ("secondary_cta_target", ""), ("badge_text", ""), ("layout", "background")):
        hero.setdefault(k, v)
    texts = out.setdefault("texts", {})
    for k, v in EXTRA_TEXTS.items():
        texts.setdefault(k, v)
    for section in out.get("sections") or []:
        if section.get("type") == "about":
            section.setdefault("stats", [])
            section.setdefault("image_url", "")
            section.setdefault("video_url", "")
        if section.get("type") in ICON_TYPES:
            for item in section.get("items") or []:
                item.setdefault("icon", "")
    return out


def legacy_texts(content: Dict[str, Any]) -> Dict[str, str]:
    """The old flat page text (GET /public/jobs/page), for careers pages embedded before the builder."""
    positions = next(s for s in content["sections"] if s["type"] == "open_positions")
    return {
        "hero_eyebrow": content["hero"]["eyebrow"],
        "hero_title": content["hero"]["title"],
        "hero_subtitle": content["hero"]["subtitle"],
        "listing_title": positions["title"],
        "listing_subtitle": positions.get("subtitle", ""),
        **content["texts"],
    }


class CareerPageService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    @property
    def col(self):
        return self.db[CAREER_PAGES_COLLECTION]

    async def _company(self, company_id: str) -> Dict[str, Any]:
        company = await self.db[COMPANIES_COLLECTION].find_one({"id": company_id})
        if not company:
            raise NotFoundError("Company not found.")
        return company

    async def _doc(self, company_id: str) -> Dict[str, Any]:
        """The company's page, made from its older page text the first time."""
        doc = await self.col.find_one({"id": company_id})
        if doc:
            return doc
        company = await self._company(company_id)
        old = await self.db[OLD_SETTINGS_COLLECTION].find_one({"id": company_id}) or {}
        content = default_content(company.get("name", ""), old)
        now = utc_now().isoformat()
        doc = {"id": company_id, "draft": content, "published": copy.deepcopy(content), "published_at": now,
               "published_by": {"name": "System"}, "updated_at": now}
        await self.col.update_one({"id": company_id}, {"$setOnInsert": doc}, upsert=True)
        return await self.col.find_one({"id": company_id}) or doc

    @staticmethod
    def _view(doc: Dict[str, Any]) -> Dict[str, Any]:
        draft, published = doc.get("draft"), doc.get("published")
        return {
            "draft": with_content_defaults(draft),
            "published": with_content_defaults(published),
            "has_unpublished_changes": draft != published,
            "published_at": doc.get("published_at"),
            "published_by": doc.get("published_by"),
            "updated_at": doc.get("updated_at"),
            "section_types": SECTION_TYPES,
            "templates": list(TEMPLATES),
        }

    async def get(self, company_id: str) -> Dict[str, Any]:
        return self._view(await self._doc(company_id))

    async def save_draft(self, company_id: str, content: Dict[str, Any]) -> Dict[str, Any]:
        await self._doc(company_id)
        clean = clean_content(content)
        await self.col.update_one({"id": company_id}, {"$set": {"draft": clean, "updated_at": utc_now().isoformat()}})
        return await self.get(company_id)

    async def publish(self, company_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
        doc = await self._doc(company_id)
        clean = clean_content(doc["draft"])
        now = utc_now().isoformat()
        await self.col.update_one({"id": company_id}, {"$set": {
            "draft": clean, "published": copy.deepcopy(clean), "published_at": now,
            "published_by": {"id": user.get("id"), "name": user.get("full_name") or user.get("email")},
        }})
        # Older embeds read the flat page text: keep it in step with what was published.
        await self.db[OLD_SETTINGS_COLLECTION].update_one(
            {"id": company_id}, {"$set": {**legacy_texts(clean), "id": company_id, "updated_at": now}}, upsert=True
        )
        return await self.get(company_id)

    async def discard(self, company_id: str) -> Dict[str, Any]:
        doc = await self._doc(company_id)
        await self.col.update_one({"id": company_id}, {"$set": {"draft": copy.deepcopy(doc.get("published") or doc["draft"])}})
        return await self.get(company_id)

    async def public(self, company: Dict[str, Any]) -> Dict[str, Any]:
        """What visitors see: the published page and the company's public profile."""
        doc = await self._doc(company["id"])
        content = with_content_defaults(doc.get("published") or doc["draft"])
        return {
            "content": content,
            "company": {
                "id": company["id"], "name": company.get("name"), "slug": company.get("slug"),
                "short_name": company.get("short_name", ""), "company_size": company.get("company_size", ""),
                "website": company.get("website", ""), "industry": company.get("industry", ""),
                "description": company.get("description", ""),
                "city": (company.get("address") or {}).get("city", ""),
            },
            "published_at": doc.get("published_at"),
        }


async def record_embed_seen(db: AsyncIOMotorDatabase, company_id: Optional[str], origin: str) -> None:
    """Remember the website that loaded the company's jobs through the embed (at most every 10 minutes)."""
    from datetime import datetime, timedelta, timezone

    from app.core.tenant import system_scope

    if not company_id:
        return
    origin = origin.strip().lower()[:200]
    try:
        with system_scope():
            company = await db[COMPANIES_COLLECTION].find_one({"id": company_id}, {"careers_integration": 1})
            seen = (company or {}).get("careers_integration") or {}
            last = seen.get("last_seen_at")
            recent = last and datetime.fromisoformat(last) > datetime.now(timezone.utc) - timedelta(minutes=10)
            if seen.get("origin") == origin and recent:
                return
            now = utc_now().isoformat()
            await db[COMPANIES_COLLECTION].update_one({"id": company_id}, {"$set": {"careers_integration": {
                "origin": origin, "last_seen_at": now, "first_seen_at": seen.get("first_seen_at") if seen.get("origin") == origin else now,
            }}})
    except Exception:  # never break the public page over this
        return
