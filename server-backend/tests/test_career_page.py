"""
Career page builder: defaults from the old page text, validation, draft vs published, publish keeps the old
flat text in step, and the public page.
"""

import copy

import pytest

from app.core.exceptions import BadRequestError
from app.core.tenant import ScopedDatabase, company_scope
from app.services.career_page_service import (
    CareerPageService,
    clean_content,
    default_content,
    legacy_texts,
    new_section,
)
from tests.fake_mongo import FakeDatabase

USER = {"id": "u1", "full_name": "Asha"}


@pytest.fixture
def env():
    raw = FakeDatabase()
    raw["companies"].docs.append({"id": "acme", "name": "Acme", "slug": "acme", "website": "https://acme.com"})
    raw["careers_page_settings"].docs.append({"id": "acme", "company_id": "acme", "hero_title": "Build with Acme", "listing_title": "Open roles"})
    return raw, CareerPageService(ScopedDatabase(raw))


def test_default_content_is_valid_and_keeps_old_text():
    content = default_content("Acme", {"hero_title": "Build with Acme", "listing_title": "Open roles"})
    assert content["hero"]["title"] == "Build with Acme"
    positions = next(s for s in content["sections"] if s["type"] == "open_positions")
    assert positions["title"] == "Open roles"
    assert clean_content(content) == content


def _page(**changes):
    page = default_content("Acme")
    page.update(changes)
    return page


@pytest.mark.parametrize("bad, message", [
    ({"template": "fancy"}, "Template"),
    ({"sections": []}, "exactly one Open positions"),
    ({"sections": [{"type": "open_positions", "visible": False}]}, "can't be hidden"),
    ({"sections": [{"type": "open_positions"}, {"type": "carousel"}]}, "Unknown section"),
    ({"sections": [{"type": "open_positions"}, {"type": "video", "url": "https://evil.example.com/x"}]}, "YouTube or Vimeo"),
    ({"hero": {"title": "x", "banner_url": "javascript:alert(1)"}}, "https://"),
    ({"header": {"links": [{"label": "Blog", "url": "ftp://x"}]}}, "https://"),
])
def test_clean_content_rejects_bad_pages(bad, message):
    with pytest.raises(BadRequestError) as e:
        clean_content(_page(**bad))
    assert message in str(e.value)


def test_clean_content_trims_and_drops_empty_items():
    page = _page(sections=[
        {"type": "open_positions", "title": "Jobs"},
        {"type": "faq", "items": [{"q": "Remote?", "a": "Hybrid."}, {"q": "", "a": "orphan answer"}]},
        {"type": "testimonials", "items": [{"name": "Priya", "quote": "Great team"}, {"name": "No quote"}]},
        {"type": "video", "url": "https://www.youtube.com/embed/abc"},
        {"id": "dup", "type": "about"}, {"id": "dup", "type": "about"},
    ])
    out = clean_content(page)
    faq = next(s for s in out["sections"] if s["type"] == "faq")
    assert faq["items"] == [{"q": "Remote?", "a": "Hybrid."}]
    assert len(next(s for s in out["sections"] if s["type"] == "testimonials")["items"]) == 1
    ids = [s["id"] for s in out["sections"]]
    assert len(ids) == len(set(ids))                      # duplicate ids made unique


def test_new_section_shapes():
    assert new_section("faq")["items"] == []
    assert new_section("gallery")["images"] == []
    assert new_section("video")["url"] == ""
    with pytest.raises(BadRequestError):
        new_section("open_positions")                    # only one, already on every page


@pytest.mark.asyncio
async def test_draft_publish_discard(env):
    raw, svc = env
    with company_scope("acme"):
        first = await svc.get("acme")
        assert first["draft"]["hero"]["title"] == "Build with Acme"   # from the old page text
        assert not first["has_unpublished_changes"]

        draft = copy.deepcopy(first["draft"])
        draft["hero"]["title"] = "We're hiring"
        saved = await svc.save_draft("acme", draft)
        assert saved["has_unpublished_changes"]
        assert (await svc.public({"id": "acme", "name": "Acme", "slug": "acme"}))["content"]["hero"]["title"] == "Build with Acme"

        published = await svc.publish("acme", USER)
        assert not published["has_unpublished_changes"] and published["published_by"]["name"] == "Asha"
        assert (await svc.public({"id": "acme", "name": "Acme", "slug": "acme"}))["content"]["hero"]["title"] == "We're hiring"
        # Older embeds read the flat text: it follows the publication.
        old = next(d for d in raw["careers_page_settings"].docs if d["id"] == "acme")
        assert old["hero_title"] == "We're hiring"

        draft["hero"]["title"] = "Temporary"
        await svc.save_draft("acme", draft)
        back = await svc.discard("acme")
        assert back["draft"]["hero"]["title"] == "We're hiring" and not back["has_unpublished_changes"]


@pytest.mark.asyncio
async def test_pages_are_per_company(env):
    raw, svc = env
    raw["companies"].docs.append({"id": "globex", "name": "Globex", "slug": "globex"})
    with company_scope("acme"):
        await svc.get("acme")
    with company_scope("globex"):
        page = await svc.get("globex")
    assert page["draft"]["hero"]["eyebrow"] == "Careers at Globex"


def test_legacy_texts():
    texts = legacy_texts(default_content("Acme"))
    assert {"hero_title", "listing_title", "success_message"} <= set(texts)
