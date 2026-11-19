"""
Company (tenant) isolation in the database layer. Uses a fake Motor collection that records the filters
it receives, so no MongoDB is needed.
"""

import pytest

from app.core.tenant import (
    ScopedCollection,
    ScopedDatabase,
    TenantScopeError,
    company_scope,
    system_scope,
)
from app.models.company import clean_domains, email_allowed
from app.repositories.tenant_migration import _companies_of, _domain_matches_company, _for_company


class FakeCollection:
    def __init__(self, name):
        self.name = name
        self.calls = []

    async def find_one(self, query, *a, **k):
        self.calls.append(("find_one", query))

    async def count_documents(self, query, *a, **k):
        self.calls.append(("count", query))
        return 0

    async def insert_one(self, doc, *a, **k):
        self.calls.append(("insert", doc))

    async def update_one(self, query, update, *a, **k):
        self.calls.append(("update", query, update))

    async def delete_many(self, query, *a, **k):
        self.calls.append(("delete_many", query))

    def aggregate(self, pipeline, *a, **k):
        self.calls.append(("aggregate", pipeline))


class FakeDb:
    def __getitem__(self, name):
        return FakeCollection(name)

    def get_collection(self, name):
        return FakeCollection(name)


def scoped(name="resumes"):
    raw = FakeCollection(name)
    return ScopedCollection(raw), raw


@pytest.mark.asyncio
async def test_refuses_without_a_company():
    coll, _ = scoped()
    with pytest.raises(TenantScopeError):
        await coll.find_one({"id": "r1"})
    with pytest.raises(TenantScopeError):
        await coll.insert_one({"id": "r1"})


@pytest.mark.asyncio
async def test_reads_and_writes_are_limited_to_the_company():
    coll, raw = scoped()
    with company_scope("abc"):
        await coll.find_one({"id": "r1"})
        await coll.count_documents({})
        await coll.update_one({"id": "r1"}, {"$set": {"x": 1}})
        await coll.delete_many({"status": "FAILED"})
        await coll.insert_one({"id": "r2"})
    assert raw.calls[0] == ("find_one", {"id": "r1", "company_id": "abc"})
    assert raw.calls[1] == ("count", {"company_id": "abc"})
    assert raw.calls[2][1] == {"id": "r1", "company_id": "abc"}
    assert raw.calls[3] == ("delete_many", {"status": "FAILED", "company_id": "abc"})
    assert raw.calls[4] == ("insert", {"id": "r2", "company_id": "abc"})


@pytest.mark.asyncio
async def test_a_query_naming_another_company_cannot_widen_the_scope():
    coll, raw = scoped()
    with company_scope("abc"):
        await coll.find_one({"company_id": "xyz"})
        await coll.find_one({"$or": [{"company_id": "xyz"}, {"id": "r1"}]})
    assert raw.calls[0][1] == {"$and": [{"company_id": "xyz"}, {"company_id": "abc"}]}
    assert raw.calls[1][1]["company_id"] == "abc"


@pytest.mark.asyncio
async def test_documents_cannot_be_moved_or_written_to_another_company():
    coll, _ = scoped()
    with company_scope("abc"):
        with pytest.raises(TenantScopeError):
            await coll.insert_one({"id": "r1", "company_id": "xyz"})
        with pytest.raises(TenantScopeError):
            await coll.update_one({"id": "r1"}, {"$set": {"company_id": "xyz"}})
        with pytest.raises(TenantScopeError):
            await coll.update_one({"id": "r1"}, {"$unset": {"company_id": ""}})
        # Writing the company's own id is fine.
        await coll.update_one({"id": "r1"}, {"$set": {"company_id": "abc"}})


def test_aggregate_starts_with_the_company_and_blocks_joins():
    coll, raw = scoped()
    with company_scope("abc"):
        coll.aggregate([{"$group": {"_id": "$status"}}])
        with pytest.raises(TenantScopeError):
            coll.aggregate([{"$lookup": {"from": "users"}}])
    assert raw.calls[0][1][0] == {"$match": {"company_id": "abc"}}


@pytest.mark.asyncio
async def test_built_in_roles_are_readable_by_every_company_but_not_changeable():
    coll, raw = scoped("roles")
    with company_scope("abc"):
        await coll.find_one({"slug": "admin"})
        await coll.update_one({"slug": "admin"}, {"$set": {"permissions": []}})
    assert raw.calls[0][1] == {"$and": [{"slug": "admin"}, {"$or": [{"company_id": "abc"}, {"company_id": None}]}]}
    assert raw.calls[1][1] == {"slug": "admin", "company_id": "abc"}


@pytest.mark.asyncio
async def test_system_scope_sees_everything():
    coll, raw = scoped()
    with system_scope():
        await coll.find_one({"id": "r1"})
        await coll.insert_one({"id": "r2"})
    assert raw.calls == [("find_one", {"id": "r1"}), ("insert", {"id": "r2"})]


def test_only_company_collections_are_wrapped():
    db = ScopedDatabase(FakeDb())
    assert isinstance(db["resumes"], ScopedCollection)
    assert isinstance(db.get_collection("mail_templates"), ScopedCollection)
    assert not isinstance(db["companies"], ScopedCollection)
    assert not isinstance(db["counters"], ScopedCollection)


def test_scope_is_restored_after_a_block():
    coll, _ = scoped()
    with company_scope("abc"):
        with system_scope():
            pass
        with company_scope("xyz"):
            pass
    with pytest.raises(TenantScopeError):
        coll._read({})


def test_email_domains():
    assert clean_domains(["@ABC.com ", "abc.com", ""]) == ["abc.com"]
    with pytest.raises(ValueError):
        clean_domains(["not a domain"])
    assert email_allowed({"email_domains": ["abc.com"]}, "Ravi@ABC.com")
    assert not email_allowed({"email_domains": ["abc.com"]}, "ravi@gmail.com")
    assert email_allowed({"email_domains": []}, "ravi@gmail.com")


def test_migration_gives_each_company_its_own_copy():
    staff_then_applied = {"user_id": "hr-1", "company_ids": ["acme"]}
    assert _companies_of(staff_then_applied) == ["default", "acme"]
    applied_twice = {"user_id": "public-applicant", "company_ids": ["acme", "beta"]}
    assert _companies_of(applied_twice) == ["acme", "beta"]
    assert _companies_of({"user_id": "public-applicant"}) == ["default"]

    resume = {"applied_jobs": [
        {"company_id": "acme", "company_name": "Acme", "job_id": "j1", "job_title": "QA"},
        {"company_id": "beta", "company_name": "Beta", "job_id": "j2", "job_title": "Dev"},
    ]}
    beta = _for_company(resume, "beta")
    assert beta["company_ids"] == ["beta"] and [j["job_id"] for j in beta["applied_jobs"]] == ["j2"]
    assert beta["job_title"] == "Dev"


def test_work_email_domains_are_matched_to_companies_by_name():
    dp = {"name": "DataPattern", "slug": "data-pattern"}
    assert _domain_matches_company("datapattern.ai", dp)
    assert _domain_matches_company("shinelogics.com", {"name": "Shinelogics", "slug": "shinelogics"})
    assert not _domain_matches_company("gmail.com", dp)
    assert not _domain_matches_company("pattern.ai", dp)


@pytest.mark.asyncio
async def test_super_admin_role_is_listed_only_for_the_super_admin():
    from app.core.exceptions import NotFoundError
    from app.services.role_service import RoleService

    roles = [
        {"id": "r1", "name": "Super Admin", "slug": "superadmin", "permissions": [], "is_system": True, "created_at": "2026-11-17", "updated_at": "2026-11-17"},
        {"id": "r2", "name": "Administrator", "slug": "admin", "permissions": [], "is_system": True, "created_at": "2026-11-17", "updated_at": "2026-11-17"},
    ]

    class Repo:
        async def find_active_roles(self, skip=0, limit=100):
            return roles

        async def get_by_id(self, role_id):
            return next((r for r in roles if r["id"] == role_id), None)

    service = RoleService(Repo())
    assert [r.slug for r in await service.list_roles()] == ["admin"]
    assert [r.slug for r in await service.list_roles(include_superadmin=True)] == ["superadmin", "admin"]
    with pytest.raises(NotFoundError):
        await service.get_role("r1")
    assert (await service.get_role("r1", include_superadmin=True)).slug == "superadmin"


@pytest.mark.asyncio
async def test_default_admin_with_the_public_password_is_skipped_on_a_remote_database(monkeypatch):
    from app.core import bootstrap

    monkeypatch.setattr(bootstrap.settings, "DEFAULT_ADMIN_PASSWORD", bootstrap.BUILT_IN_ADMIN_PASSWORD)
    monkeypatch.setattr(bootstrap.settings, "DATABASE_URL", "mongodb+srv://u:p@cluster0.example.mongodb.net/db")

    class Coll:
        def __init__(self, name):
            self.name = name

        async def create_index(self, *a, **k):
            pass

        async def find_one(self, *a, **k):
            if self.name == "users":
                raise AssertionError("must not look up or create the default admin")
            return {"slug": "x"}  # roles already exist

        async def update_one(self, *a, **k):
            pass

    class Db:
        def __getitem__(self, name):
            return Coll(name)

    await bootstrap.bootstrap_default_admin(Db())
