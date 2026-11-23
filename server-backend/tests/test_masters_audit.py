"""
Master data (platform + company entries) and the central audit log, through the company-scoped database.
"""

import pytest

from app.core.exceptions import BadRequestError, ConflictError
from app.core.tenant import ScopedDatabase, TENANT_COLLECTIONS, company_scope, system_scope
from app.services.audit_service import diff, list_audit_logs, record_audit, to_csv
from app.services.master_service import MasterService, bootstrap_masters
from tests.fake_mongo import FakeDatabase


@pytest.fixture
def dbs():
    raw = FakeDatabase()
    return raw, ScopedDatabase(raw)


@pytest.mark.asyncio
async def test_platform_masters_are_seeded_once(dbs):
    raw, _ = dbs
    first = await bootstrap_masters(raw)
    again = await bootstrap_masters(raw)
    assert first > 20 and again == 0
    assert all(d["company_id"] is None for d in raw["masters"].docs)


@pytest.mark.asyncio
async def test_company_sees_platform_and_own_entries_only(dbs):
    raw, db = dbs
    await bootstrap_masters(raw)
    svc = MasterService(db)
    with company_scope("acme"):
        await svc.create("industry", "Space Tech")
    with company_scope("globex"):
        await svc.create("industry", "Agritech")
        names = [m["name"] for m in await svc.list("industry")]
    assert "Agritech" in names and "Healthcare" in names
    assert "Space Tech" not in names  # acme's own entry


@pytest.mark.asyncio
async def test_company_cannot_duplicate_or_change_platform_entries(dbs):
    raw, db = dbs
    await bootstrap_masters(raw)
    svc = MasterService(db)
    with company_scope("acme"):
        with pytest.raises(ConflictError):
            await svc.create("industry", "  healthcare ")
        platform = next(m for m in await svc.list("industry") if m["name"] == "Healthcare")
        with pytest.raises(BadRequestError):
            await svc.update(platform["id"], {"name": "Health"})


@pytest.mark.asyncio
async def test_turned_off_entries_are_hidden_but_kept(dbs):
    _, db = dbs
    svc = MasterService(db)
    with company_scope("acme"):
        dept = await svc.create("department", "Engineering")
        await svc.delete(dept["id"])
        assert await svc.list("department") == []
        assert len(await svc.list("department", include_inactive=True)) == 1


@pytest.mark.asyncio
async def test_departments_cannot_be_platform_entries(dbs):
    _, db = dbs
    with pytest.raises(BadRequestError):
        await MasterService(db).create("department", "Sales", global_entry=True)


@pytest.mark.asyncio
async def test_unknown_master_type(dbs):
    _, db = dbs
    with company_scope("acme"):
        with pytest.raises(BadRequestError):
            await MasterService(db).list("planets")


# ── Audit log ──────────────────────────────────────────────────────────────

ADMIN = {"id": "u1", "full_name": "Asha", "email": "asha@acme.com", "role": "admin"}


@pytest.mark.asyncio
async def test_audit_entries_stay_in_their_company(dbs):
    _, db = dbs
    with company_scope("acme"):
        await record_audit(db, ADMIN, "role.created", "role", "r1", "Recruiter")
    with company_scope("globex"):
        await record_audit(db, ADMIN, "user.deleted", "user", "u9")
        logs = await list_audit_logs(db)
    assert [i["action"] for i in logs["items"]] == ["user.deleted"]
    assert logs["items"][0]["actor"]["email"] == "asha@acme.com"


@pytest.mark.asyncio
async def test_platform_log_is_separate_and_target_company_gets_a_copy(dbs):
    _, db = dbs
    boss = {"id": "s1", "full_name": "Root", "role": "superadmin"}
    with company_scope("default"):
        for platform in (True, False):
            await record_audit(db, boss, "workspace.opened", "company", "acme", platform=platform, target_company_id="acme")
        assert (await list_audit_logs(db))["total"] == 0  # not in the super admin's own company log
        platform_logs = await list_audit_logs(db, platform=True)
    with company_scope("acme"):
        acme_logs = await list_audit_logs(db)
    assert platform_logs["total"] == 1 and platform_logs["items"][0]["target_company_id"] == "acme"
    assert acme_logs["total"] == 1


@pytest.mark.asyncio
async def test_audit_filters_and_csv(dbs):
    _, db = dbs
    with company_scope("acme"):
        await record_audit(db, ADMIN, "role.created", "role", "r1", "Recruiter")
        await record_audit(db, ADMIN, "user.created", "user", "", "ravi@acme.com")
        await record_audit(db, ADMIN, "master.created", "master:department", "m1", "Engineering")
        only_roles = await list_audit_logs(db, entity_type="role")
        masters = await list_audit_logs(db, entity_type="master")
        assert masters["total"] == 1
        by_search = await list_audit_logs(db, search="ravi")
    assert only_roles["total"] == 1 and by_search["items"][0]["action"] == "user.created"
    csv_text = to_csv(by_search["items"])
    assert csv_text.splitlines()[0].startswith("When,Action") and "ravi@acme.com" in csv_text


def test_diff_masks_secrets():
    changes = diff({"name": "A", "password": "x"}, {"name": "B", "password": "y"})
    assert changes == {"name": {"from": "A", "to": "B"}, "password": {"from": "***", "to": "***"}}


@pytest.mark.asyncio
async def test_audit_write_never_raises():
    class Broken:
        def __getitem__(self, name):
            raise RuntimeError("db down")

    await record_audit(Broken(), ADMIN, "x", "y")  # logged, not raised


def test_new_collections_are_company_scoped():
    for name in ("masters", "audit_logs", "ats_offers", "ats_onboarding", "ats_scorecards",
                 "ats_audit_logs", "ats_automation_templates"):
        assert name in TENANT_COLLECTIONS


@pytest.mark.asyncio
async def test_ats_offers_do_not_leak_between_companies(dbs):
    _, db = dbs
    with company_scope("acme"):
        await db["ats_offers"].insert_one({"id": "o1", "candidate_name": "A"})
    with company_scope("globex"):
        assert await db["ats_offers"].find({}).to_list(length=10) == []
    with system_scope():
        assert len(await db["ats_offers"].find({}).to_list(length=10)) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("name", sorted(TENANT_COLLECTIONS))
async def test_no_company_collection_leaks(name):
    """Every company collection: what one company writes, another cannot read, count or change."""
    db = ScopedDatabase(FakeDatabase())
    with company_scope("acme"):
        await db[name].insert_one({"id": "doc-1", "secret": "acme only"})
    with company_scope("globex"):
        assert await db[name].find_one({"id": "doc-1"}) is None
        assert await db[name].count_documents({}) == 0
        await db[name].update_one({"id": "doc-1"}, {"$set": {"secret": "changed"}})
    with company_scope("acme"):
        assert (await db[name].find_one({"id": "doc-1"}))["secret"] == "acme only"


@pytest.mark.asyncio
async def test_dashboard_cache_is_per_company():
    from app.services.dashboard_service import DashboardService

    DashboardService.invalidate_cache()
    svc = DashboardService.__new__(DashboardService)
    calls = []

    def fetcher(value):
        async def run():
            calls.append(value)
            return value
        return run

    with company_scope("acme"):
        assert await svc._swr_fetch("stats:x", fetcher("acme numbers")) == "acme numbers"
    with company_scope("globex"):
        assert await svc._swr_fetch("stats:x", fetcher("globex numbers")) == "globex numbers"
    with company_scope("acme"):
        assert await svc._swr_fetch("stats:x", fetcher("again")) == "acme numbers"  # cached, own company
    assert calls == ["acme numbers", "globex numbers"]
    DashboardService.invalidate_cache("stats:x")
    assert not DashboardService._cache


@pytest.mark.asyncio
async def test_dashboard_cache_refuses_without_company():
    from app.core.tenant import TenantScopeError
    from app.services.dashboard_service import DashboardService

    svc = DashboardService.__new__(DashboardService)

    async def run():
        return 1

    with pytest.raises(TenantScopeError):
        await svc._swr_fetch("stats:y", run)
