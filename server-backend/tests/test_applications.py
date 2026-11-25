"""
Phase 5, applications (SRS 4.8 / 4.9, Screen 18): the form rules, what the AI read in the form's shape and how
sure it was, the resume draft, submitting (new profile or linked to the same resume on file) and staff review.
"""

import io
import os
from types import SimpleNamespace

import pytest
from fastapi import BackgroundTasks, UploadFile
from starlette.datastructures import Headers

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.services.application_service import (
    ApplicationService,
    clean_form,
    comparison,
    confidence_of,
    map_parsed,
    summary_of,
)
from tests.fake_mongo import FakeDatabase

EMAIL = "rakesh@example.com"
PARSED = {
    "full_name": "Rakesh Kumar", "email": EMAIL, "phone": "+91 98405 12345", "location": "Chennai, Tamil Nadu",
    "linkedin": "https://www.linkedin.com/in/rakesh", "total_experience_years": 6.2,
    "education": [{"degree": "B.E.", "specialization": "Computer Science", "institution": "Anna University", "year_of_passing": "2017", "score": "8.1"}],
    "experience": [{"company": "Acme", "designation": "Java Developer", "start_date": "2019-06", "end_date": "Present", "responsibilities": "APIs"},
                   {"company": "Old Co", "designation": "Trainee", "start_date": "2017-07", "end_date": "2019-05"}],
    "primary_skills": ["Java", "Spring Boot"], "frameworks": ["spring boot", "Hibernate"], "cloud_tech": ["AWS"],
    "certifications": [{"name": "AWS Developer", "issued_by": "AWS", "year": "2022"}],
}
FORM = {
    "personal": {"full_name": "Rakesh Kumar", "phone_code": "+91", "phone": "98405 12345", "location": "Chennai", "linkedin": "linkedin.com/in/rakesh"},
    "notice_period": "30 Days", "expected_ctc": "22,00,000", "total_experience_years": 6.2,
    "education": [{"degree": "B.E.", "institution": "Anna University", "year": "2017"}, {"degree": ""}],
    "experience": [{"company": "Acme", "designation": "Java Developer", "start": "2019-06", "current": True, "end": "2024-01"}],
    "skills": ["Java", "java", "Spring Boot"], "heard_from": "LinkedIn",
}


def test_clean_form_rules():
    out = clean_form(FORM, EMAIL)
    assert out["personal"]["email"] == EMAIL                     # always the verified email
    assert out["personal"]["linkedin"] == "https://linkedin.com/in/rakesh"
    assert out["expected_ctc"] == 2200000
    assert len(out["education"]) == 1                            # empty rows dropped
    assert out["experience"][0]["end"] == ""                     # current job has no end
    assert out["skills"] == ["Java", "Spring Boot"]
    for bad in (
        {**FORM, "personal": {**FORM["personal"], "phone": "call me"}},
        {**FORM, "education": [{"degree": "B.E.", "year": "17"}]},
        {**FORM, "experience": [{"company": "X", "start": "2020-05", "end": "2019-01"}]},
        {**FORM, "personal": {**FORM["personal"], "portfolio": "my site"}},
        {**FORM, "notice_period": ""},                           # required
    ):
        with pytest.raises(BadRequestError):
            clean_form(bad, EMAIL)
    assert clean_form({}, EMAIL, require=False)["personal"]["email"] == EMAIL


def test_ai_read_details_in_form_shape():
    f = map_parsed(PARSED)
    assert f["personal"]["phone_code"] == "+91" and f["personal"]["phone"] == "98405 12345"
    assert f["education"][0]["year"] == "2017"
    assert f["experience"][0]["current"] is True and f["experience"][0]["end"] == ""
    assert f["skills"][:4] == ["Java", "Spring Boot", "Hibernate", "AWS"]   # merged, repeats dropped
    assert f["certifications"] == ["AWS Developer"]
    c = confidence_of(f, EMAIL)
    assert c["level"] == "high" and c["score"] == 1.0 and c["email_matches"]
    assert confidence_of(map_parsed({"full_name": "X"}), EMAIL)["level"] == "low"
    assert not confidence_of(f, "someone@else.com")["email_matches"]
    s = summary_of(f)
    assert s["total_experience_years"] == 6.2 and s["highest_education"] == "B.E. – Computer Science"
    rows = {r["field"]: r for r in comparison(clean_form(FORM, EMAIL), f)}
    assert rows["phone"]["same"] and rows["full_name"]["same"]
    assert not rows["location"]["same"]                          # "Chennai" vs "Chennai, Tamil Nadu"


# ── Service ──────────────────────────────────────────────────────────────────

class FakeResumes:
    """Stands in for ResumeService: records what it was asked and makes a resume record."""

    def __init__(self, db):
        self.db = db
        self.calls = []

    async def upload_and_process_resume(self, **kw):
        content = await kw["file"].read()
        self.calls.append({**kw, "content": content})
        rid = f"r{len(self.calls)}"
        import hashlib
        await self.db["resumes"].insert_one({"id": rid, "candidate_id": f"CND{len(self.calls):04d}", "status": "PENDING",
                                             "file_hash": hashlib.sha256(content).hexdigest(), "applied_jobs": []})
        return SimpleNamespace(id=rid)


@pytest.fixture
def env(tmp_path):
    db = FakeDatabase()
    state = {"status": ("processing", {}, "")}

    async def parse(content, name, ctype):
        return "job-1", "queued"

    async def status(job_id):
        return state["status"]

    resumes = FakeResumes(db)
    svc = ApplicationService(db, resumes, upload_dir=str(tmp_path), parse=parse, status=status)
    return SimpleNamespace(db=db, svc=svc, state=state, resumes=resumes)


def _file(data=b"%PDF-1.4 resume", name="Rakesh.pdf"):
    return UploadFile(file=io.BytesIO(data), filename=name, headers=Headers({"content-type": "application/pdf"}))


OPENING = {"id": "job1", "title": "Senior Java Developer"}
COMPANY = {"id": "acme", "name": "Acme"}
STAFF = {"id": "u1", "full_name": "Asha"}


@pytest.mark.asyncio
async def test_draft_reads_the_resume_then_prefills(env):
    d = await env.svc.upload_resume(OPENING, EMAIL, _file())
    assert d["parse_status"] == "queued" and d["extracted"] is None
    assert os.path.exists((await env.db["application_drafts"].find_one({"id": d["draft_id"]}))["file_path"])
    assert (await env.svc.draft(d["draft_id"], EMAIL))["parse_status"] == "processing"
    env.state["status"] = ("done", PARSED, "")
    done = await env.svc.draft(d["draft_id"], EMAIL)
    assert done["extracted"]["personal"]["full_name"] == "Rakesh Kumar" and done["confidence"]["level"] == "high"
    assert done["summary"]["top_skills"][0] == "Java"
    with pytest.raises(NotFoundError):
        await env.svc.draft(d["draft_id"], "other@example.com")   # only the candidate who uploaded it
    again = await env.svc.upload_resume(OPENING, EMAIL, _file(b"%PDF-1.4 v2"))
    assert await env.db["application_drafts"].count_documents({}) == 1 and again["draft_id"] != d["draft_id"]


@pytest.mark.asyncio
async def test_submit_creates_profile_once_and_links_the_same_resume(env):
    env.state["status"] = ("done", PARSED, "")
    d = await env.svc.upload_resume(OPENING, EMAIL, _file())
    await env.svc.draft(d["draft_id"], EMAIL)
    with pytest.raises(BadRequestError):
        await env.svc.submit(OPENING, COMPANY, EMAIL, {"draft_id": d["draft_id"], "form": FORM, "consent": False}, BackgroundTasks())
    out = await env.svc.submit(OPENING, COMPANY, EMAIL, {"draft_id": d["draft_id"], "form": FORM, "consent": True}, BackgroundTasks(), ip="1.2.3.4")
    assert out["opening_title"] == "Senior Java Developer"
    assert env.resumes.calls[0]["parser_job_id"] == "job-1"     # the resume is not parsed twice
    app = await env.db["job_applications"].find_one({"id": out["application_id"]})
    assert app["stage"] == "APPLIED" and app["consent"]["accepted"] and app["consent"]["ip"] == "1.2.3.4"
    assert app["form"]["notice_period"] == "30 Days" and app["extracted"]["personal"]["full_name"] == "Rakesh Kumar"
    assert app["history"][0]["action"] == "submitted" and not app["linked_existing_profile"]
    assert await env.db["application_drafts"].count_documents({}) == 0
    with pytest.raises(ConflictError):
        d2 = await env.svc.upload_resume(OPENING, EMAIL, _file())
        await env.svc.submit(OPENING, COMPANY, EMAIL, {"draft_id": d2["draft_id"], "form": FORM, "consent": True}, BackgroundTasks())

    # The same resume for another job: linked to the profile on file, no second profile.
    other = {"id": "job2", "title": "Tech Lead"}
    d3 = await env.svc.upload_resume(other, EMAIL, _file())
    out2 = await env.svc.submit(other, COMPANY, EMAIL, {"draft_id": d3["draft_id"], "form": FORM, "consent": True}, BackgroundTasks())
    app2 = await env.db["job_applications"].find_one({"id": out2["application_id"]})
    assert app2["linked_existing_profile"] and app2["resume_id"] == app["resume_id"] and len(env.resumes.calls) == 1


@pytest.mark.asyncio
async def test_staff_list_review_and_corrections(env):
    env.state["status"] = ("done", PARSED, "")
    d = await env.svc.upload_resume(OPENING, EMAIL, _file())
    await env.svc.draft(d["draft_id"], EMAIL)
    out = await env.svc.submit(OPENING, COMPANY, EMAIL, {"draft_id": d["draft_id"], "form": FORM, "consent": True}, BackgroundTasks())
    aid = out["application_id"]
    listed = await env.svc.list(review="pending")
    assert listed["total"] == 1 and listed["items"][0]["full_name"] == "Rakesh Kumar" and listed["items"][0]["candidate_code"] == "CND0001"
    assert (await env.svc.list(q="nobody"))["total"] == 0
    detail = await env.svc.get(aid)
    assert {r["field"] for r in detail["comparison"]} >= {"full_name", "phone", "location"}
    reviewed = await env.svc.set_review(aid, "reviewed", STAFF, "Looks good")
    assert reviewed["review_status"] == "reviewed" and reviewed["history"][-1]["action"] == "reviewed"
    assert (await env.svc.list(review="pending"))["total"] == 0
    with pytest.raises(BadRequestError):
        await env.svc.apply_corrections(aid, ["nonsense"], STAFF)
    await env.svc.apply_corrections(aid, ["location", "phone"], STAFF)
    resume = await env.db["resumes"].find_one({"id": detail["resume"]["id"]})
    assert resume["parsed_data"]["location"] == "Chennai" and resume["parsed_data"]["phone"] == "+91 98405 12345"
    assert resume["hr_updates"][-1]["fields"] == ["location", "phone"]


@pytest.mark.asyncio
async def test_same_file_again_reuses_the_parse_and_quota(tmp_path):
    """PR #73 review: re-uploading the same resume must not use another AI parse (or more storage)."""
    db = FakeDatabase()
    await db["companies"].insert_one({"id": "acme", "name": "Acme", "plan_limits": {"ai_parses_per_month": 100}})
    parses = []

    async def parse(content, name, ctype):
        parses.append(content)
        return f"job-{len(parses)}", "queued"

    async def status(job_id):
        return ("done", PARSED, "")

    svc = ApplicationService(db, FakeResumes(db), upload_dir=str(tmp_path), parse=parse, status=status)
    opening = {**OPENING, "company_id": "acme"}

    first = await svc.upload_resume(opening, EMAIL, _file())
    await svc.draft(first["draft_id"], EMAIL)                   # the parse finishes
    again = await svc.upload_resume(opening, EMAIL, _file())    # the same file
    assert len(parses) == 1
    assert again["extracted"]["personal"]["full_name"] == "Rakesh Kumar"   # pre-fill kept, no new parse

    await svc.upload_resume(opening, EMAIL, _file(b"%PDF-1.4 a different resume"))
    assert len(parses) == 2
