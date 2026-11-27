"""
Development → staging copy (scripts/migrate_dev_to_staging.py): jobs and applications from before workspaces go
to the company they name, older job skill fields are carried over, and parsed experience text doesn't break the
candidate step. Uses an in-memory database.
"""

import pytest

from scripts.migrate_candidates import _years
from scripts.migrate_dev_to_staging import gap_report, normalise_jobs, split_companies
from tests.fake_mongo import FakeDatabase

DP = "co-dp"


@pytest.fixture(autouse=True)
def _no_index_work(monkeypatch):
    """The start-up split also rebuilds indexes, which the in-memory database can't; it is run for real against
    MongoDB by the script's rehearsal. Here only the company-name matching in front of it is under test."""
    import app.repositories.tenant_migration as tm

    async def none(db):
        return {}

    monkeypatch.setattr(tm, "migrate_to_companies", none)


def _db():
    db = FakeDatabase()
    db["companies"].docs = [
        {"id": "default", "name": "Shinelogics", "email_domains": []},
        {"id": DP, "name": "DataPattern", "email_domains": ["datapattern.ai"]},
    ]
    db["job_openings"].docs = [
        {"id": "j1", "title": "Service Desk Analyst", "company_name": "DataPattern", "required_skills": ["ITIL"],
         "preferred_skills": ["ServiceNow"]},
        {"id": "j2", "title": "QA Engineer", "company_name": "Shinelogics", "required_skills": []},
        {"id": "j3", "title": "Lead", "company_id": DP, "company_name": "DataPattern", "primary_skills": ["Go"],
         "required_skills": ["Java"]},
    ]
    db["job_applications"].docs = [
        {"id": "a1", "opening_id": "j1", "resume_id": "r1", "company_name": "datapattern ", "applicant_email": "x@gmail.com"},
        {"id": "a2", "opening_id": "j2", "resume_id": "r2", "company_name": "Unknown Co", "applicant_email": "y@gmail.com"},
    ]
    for coll in ("companies", "job_openings", "job_applications"):  # real documents always have an _id
        for n, d in enumerate(db[coll].docs):
            d["_id"] = f"{coll}-{n}"
    return db


@pytest.mark.asyncio
async def test_jobs_and_applications_go_to_the_company_they_name():
    db = _db()
    stats = await split_companies(db)
    jobs = {j["id"]: j["company_id"] for j in db["job_openings"].docs}
    apps = {a["id"]: a["company_id"] for a in db["job_applications"].docs}
    assert jobs == {"j1": DP, "j2": "default", "j3": DP}
    assert apps == {"a1": DP, "a2": "default"}  # an unknown name falls back to the default company
    assert stats["job_openings matched by company name"] == 2


@pytest.mark.asyncio
async def test_old_skill_fields_are_copied_once_and_never_overwrite():
    db = _db()
    assert await normalise_jobs(db) == {"primary_skills": 1, "secondary_skills": 1}
    jobs = {j["id"]: j for j in db["job_openings"].docs}
    assert jobs["j1"]["primary_skills"] == ["ITIL"] and jobs["j1"]["secondary_skills"] == ["ServiceNow"]
    assert jobs["j3"]["primary_skills"] == ["Go"]  # already set: kept
    assert "primary_skills" not in jobs["j2"]  # nothing to copy
    assert await normalise_jobs(db) == {}


@pytest.mark.asyncio
async def test_gap_report_flags_a_job_in_the_wrong_company():
    db = _db()
    await split_companies(db)
    db["job_openings"].docs[1]["company_id"] = DP  # QA Engineer says Shinelogics but sits in DataPattern
    gaps = (await gap_report(db))["gaps"]
    wrong = gaps["job_openings_in_wrong_company"]
    assert wrong["count"] == 1 and wrong["examples"][0]["title"] == "QA Engineer"


@pytest.mark.parametrize("raw,expected", [(5, 5.0), ("5", 5.0), ("5.5 years", 5.5), ("", None), (None, None), ("n/a", None)])
def test_parsed_experience_becomes_a_number_or_nothing(raw, expected):
    assert _years(raw) == expected
