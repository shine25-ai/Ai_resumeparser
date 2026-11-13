"""
Companies: each has its own roles, careers page text and page address. Uses in-memory fakes, no MongoDB.
"""

import pytest

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.company import DEFAULT_COMPANY_ID, default_company_doc, slugify
from app.models.job_opening import CAREERS_PAGE_DEFAULTS
from app.services.job_opening_service import JobOpeningService
from app.services.resume_service import carry_applied_jobs, company_conditions


class FakeCompanyRepo:
    def __init__(self):
        self.docs = {DEFAULT_COMPANY_ID: default_company_doc()}

    async def ensure_default(self):
        return self.docs[DEFAULT_COMPANY_ID]

    async def get_by_id(self, id_val):
        return dict(self.docs[id_val]) if id_val in self.docs else None

    async def get_by_slug(self, slug):
        return next((dict(d) for d in self.docs.values() if d["slug"] == slug), None)

    async def create(self, data):
        self.docs[data["id"]] = dict(data)
        return dict(data)

    async def update(self, id_val, changes):
        self.docs[id_val].update(changes)
        return dict(self.docs[id_val])


class FakePageSettingsRepo:
    def __init__(self):
        self.docs = {}

    async def get_settings(self, company_id="default"):
        return dict(self.docs.get(company_id, {}))

    async def save_settings(self, data, company_id="default"):
        self.docs.setdefault(company_id, {}).update(data)


@pytest.fixture
def svc():
    service = JobOpeningService.__new__(JobOpeningService)
    service.company_repo = FakeCompanyRepo()
    service.page_settings_repo = FakePageSettingsRepo()
    return service


def test_slugify():
    assert slugify("  Acme Tech Pvt. Ltd ") == "acme-tech-pvt-ltd"
    assert slugify("!!!") == ""


@pytest.mark.asyncio
async def test_page_without_company_is_the_default_company(svc):
    assert (await svc.public_company(None))["id"] == DEFAULT_COMPANY_ID
    assert (await svc.public_company(""))["id"] == DEFAULT_COMPANY_ID


@pytest.mark.asyncio
async def test_company_by_slug_unknown_and_turned_off(svc):
    acme = await svc.create_company({"name": "Acme Tech"})
    assert acme["slug"] == "acme-tech"
    assert (await svc.public_company("ACME-tech"))["id"] == acme["id"]

    with pytest.raises(NotFoundError):
        await svc.public_company("nobody")

    await svc.update_company(acme["id"], {"status": "INACTIVE"})
    with pytest.raises(NotFoundError):
        await svc.public_company("acme-tech")


@pytest.mark.asyncio
async def test_page_address_must_be_unique(svc):
    await svc.create_company({"name": "Acme"})
    with pytest.raises(ConflictError):
        await svc.create_company({"name": "Acme Two", "slug": "acme"})
    with pytest.raises(BadRequestError):
        await svc.create_company({"name": "Beta", "slug": "***"})


@pytest.mark.asyncio
async def test_default_company_page_cannot_be_turned_off(svc):
    with pytest.raises(BadRequestError):
        await svc.update_company(DEFAULT_COMPANY_ID, {"status": "INACTIVE"})


@pytest.mark.asyncio
async def test_each_company_has_its_own_page_text(svc):
    acme = await svc.create_company({"name": "Acme"})
    page = await svc.get_public_page("acme")
    assert page["hero_eyebrow"] == "Careers at Acme"
    assert page["company"] == {"id": acme["id"], "name": "Acme", "slug": "acme"}

    await svc.update_page_settings({"hero_title": "Build with Acme"}, acme)
    assert (await svc.get_page_settings(acme))["hero_title"] == "Build with Acme"
    # The default company's page is unchanged.
    assert (await svc.get_page_settings())["hero_title"] == CAREERS_PAGE_DEFAULTS["hero_title"]


def test_company_filter_conditions():
    assert company_conditions(None) == []
    assert company_conditions("c1") == [{"company_ids": "c1"}]
    assert "$or" in company_conditions("none")[0]


def test_merging_into_an_existing_profile_keeps_every_company_and_role():
    existing = {
        "company_ids": ["default"],
        "applied_jobs": [{"company_id": "default", "job_id": "j1", "job_title": "QA"}],
        "company_id": "default", "company_name": "Shinelogics", "job_opening_id": "j1", "job_title": "QA",
    }
    new = {
        "company_ids": ["acme"],
        "applied_jobs": [{"company_id": "acme", "job_id": "j2", "job_title": "Dev"}],
        "company_id": "acme", "company_name": "Acme", "job_opening_id": "j2", "job_title": "Dev",
    }
    merged = carry_applied_jobs(existing, new)
    assert merged["company_ids"] == ["default", "acme"]
    assert [j["job_id"] for j in merged["applied_jobs"]] == ["j1", "j2"]
    assert merged["company_name"] == "Acme"

    # A staff upload (no company) merged into a careers applicant keeps the applicant's company.
    kept = carry_applied_jobs(existing, {})
    assert kept["company_name"] == "Shinelogics" and kept["company_ids"] == ["default"]
