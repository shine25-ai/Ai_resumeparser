"""
Retention review fixes (PR #73):
- only rejected or withdrawn candidates are deleted, never archived ones
- no 1,000-candidate cap
- resumes are found through candidate_ref, and their stored files (local and S3) are deleted too
- another company's data is never touched
"""

from datetime import timedelta

import pytest

from app.services.retention_service import RetentionService
from app.utils.helpers import utc_now
from tests.fake_mongo import FakeDatabase

OLD = (utc_now() - timedelta(days=400)).isoformat()
NEW = utc_now().isoformat()


def _cand(cid, company="comp_a", updated=OLD, status="active", **extra):
    return {"id": cid, "company_id": company, "full_name": cid, "email": f"{cid}@mail.com",
            "status": status, "updated_at": updated, "merged_into": None, **extra}


async def _setup(n_extra=0):
    db = FakeDatabase()
    await db["companies"].insert_one({"id": "comp_a", "name": "A", "tenant_settings": {"data_retention_months": 6}})
    await db["companies"].insert_one({"id": "comp_b", "name": "B", "tenant_settings": {"data_retention_months": 6}})

    await db["candidates"].insert_one(_cand("rejected"))
    await db["job_applications"].insert_one({"id": "a1", "company_id": "comp_a", "candidate_id": "rejected", "stage": "REJECTED"})
    await db["resumes"].insert_one({"id": "r1", "company_id": "comp_a", "candidate_id": "CND0001", "candidate_ref": "rejected",
                                    "file_path": "/files/r1.pdf", "s3_url": "https://bucket/resumes/r1.pdf",
                                    "other_documents": [{"s3_url": "https://bucket/resumes/r1-cert.pdf"}]})
    await db["candidate_documents"].insert_one({"id": "r1", "company_id": "comp_a", "candidate_id": "rejected",
                                                "file_path": "/files/r1.pdf"})

    await db["candidates"].insert_one(_cand("withdrawn_no_apps", status="withdrawn"))
    await db["candidates"].insert_one(_cand("archived", status="archived"))
    await db["candidates"].insert_one(_cand("archived_app"))
    await db["job_applications"].insert_one({"id": "a2", "company_id": "comp_a", "candidate_id": "archived_app", "stage": "ARCHIVED"})
    await db["candidates"].insert_one(_cand("open_app"))
    await db["job_applications"].insert_one({"id": "a3", "company_id": "comp_a", "candidate_id": "open_app", "stage": "APPLIED"})
    await db["candidates"].insert_one(_cand("recent", updated=NEW, status="rejected"))
    await db["candidates"].insert_one(_cand("other_company", company="comp_b", status="rejected"))
    for i in range(n_extra):
        await db["candidates"].insert_one(_cand(f"bulk{i}", status="rejected"))
    return db


@pytest.mark.asyncio
async def test_only_rejected_or_withdrawn_and_files_deleted():
    db = await _setup()
    removed = []
    svc = RetentionService(db, remove_local=lambda p: removed.append(p) or True,
                           remove_stored=lambda u: removed.append(u) or True)

    preview = await svc.run_retention_job("comp_a", dry_run=True)
    assert {c["id"] for c in preview["candidates"]} == {"rejected", "withdrawn_no_apps"}
    assert removed == [] and await db["candidates"].count_documents({}) == 7

    done = await svc.run_retention_job("comp_a", dry_run=False, actor={"id": "admin"})
    assert done["deleted"]["candidates"] == 2 and done["deleted"]["resumes"] == 1
    assert set(removed) == {"/files/r1.pdf", "https://bucket/resumes/r1.pdf", "https://bucket/resumes/r1-cert.pdf"}
    assert not await db["resumes"].find_one({"id": "r1"})
    assert not await db["candidate_documents"].find_one({"id": "r1"})
    assert not await db["job_applications"].find_one({"id": "a1"})
    for kept in ("archived", "archived_app", "open_app", "recent", "other_company"):
        assert await db["candidates"].find_one({"id": kept}), kept


@pytest.mark.asyncio
async def test_no_thousand_candidate_cap():
    db = await _setup(n_extra=1005)
    svc = RetentionService(db, remove_local=lambda p: False, remove_stored=lambda u: False)
    preview = await svc.run_retention_job("comp_a", dry_run=True)
    assert preview["eligible_count"] == 1005 + 2


@pytest.mark.asyncio
async def test_erasure_request_removes_files_and_stays_in_company():
    db = await _setup()
    removed = []
    svc = RetentionService(db, remove_local=lambda p: removed.append(p) or True, remove_stored=lambda u: removed.append(u) or True)
    res = await svc.request_candidate_deletion("rejected", "Candidate asked", {"id": "admin"}, company_id="comp_a")
    assert res["deleted"]["files"] == 3
    with pytest.raises(Exception):
        await svc.request_candidate_deletion("other_company", "x", {"id": "admin"}, company_id="comp_a")
