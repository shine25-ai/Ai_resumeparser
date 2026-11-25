"""
Phase 6 review fixes:
- every parsed resume (portal single/bulk upload, careers form) belongs to a candidate
- a different email with the same phone is flagged for duplicate review, not merged (P6-05)
- resumes keep their CND code in candidate_id and point at the candidate with candidate_ref
- merge refuses already-merged records and does not hide resumes (redirect_id is left alone)
- the migration links applications only within the same company, never by a blank email,
  and leaves already-linked applications as they are
"""

import pytest

from app.core.exceptions import ConflictError
from app.core.tenant import ScopedDatabase, company_scope
from app.models.candidate import CandidateDocument
from app.services.candidate_service import CandidateService, link_resume_to_candidate
from scripts.migrate_candidates import run_migration
from tests.fake_mongo import FakeDatabase

ADMIN = {"id": "u_admin", "full_name": "Admin", "email": "admin@a.com", "role": "admin"}


def _resume(rid, code, email="", phone="", name="Asha Rao", **extra):
    return {
        "id": rid,
        "candidate_id": code,
        "original_filename": f"{rid}.pdf",
        "filename": f"{rid}.pdf",
        "file_path": f"/tmp/{rid}.pdf",
        "status": "PARSED",
        "uploaded_by_email": "recruiter@a.com",
        "parsed_data": {"full_name": name, "email": email, "phone": phone, "primary_skills": ["Python"]},
        **extra,
    }


@pytest.fixture
def db():
    return ScopedDatabase(FakeDatabase())


@pytest.mark.asyncio
async def test_portal_upload_creates_and_reuses_candidate(db):
    with company_scope("comp_a"):
        await db["resumes"].insert_one(_resume("r1", "CND0001", email="Asha@Mail.com", phone="+91 98765 43210"))
        await db["resumes"].insert_one(_resume("r2", "CND0002", email="asha@mail.com"))

        cid = await link_resume_to_candidate(db, "r1")
        assert cid
        cand = await db["candidates"].find_one({"id": cid})
        assert cand["normalized_email"] == "asha@mail.com"
        assert cand["candidate_id_display"] == "CND0001"
        assert cand["company_id"] == "comp_a"

        r1 = await db["resumes"].find_one({"id": "r1"})
        assert r1["candidate_id"] == "CND0001"      # the CND code stays
        assert r1["candidate_ref"] == cid
        doc = await db["candidate_documents"].find_one({"id": "r1"})
        assert doc["candidate_id"] == cid

        # Same email again: the same candidate, with both documents
        assert await link_resume_to_candidate(db, "r2") == cid
        assert await db["candidates"].count_documents({}) == 1
        assert await db["candidate_documents"].count_documents({"candidate_id": cid}) == 2

        # Linking twice changes nothing
        assert await link_resume_to_candidate(db, "r1") == cid
        assert await db["candidates"].count_documents({}) == 1


@pytest.mark.asyncio
async def test_uploader_email_is_never_used_to_match(db):
    """Resumes with no email of their own are separate candidates, even from the same recruiter."""
    with company_scope("comp_a"):
        await db["resumes"].insert_one(_resume("r1", "CND0001", name="One"))
        await db["resumes"].insert_one(_resume("r2", "CND0002", name="Two"))
        a = await link_resume_to_candidate(db, "r1")
        b = await link_resume_to_candidate(db, "r2")
        assert a != b


@pytest.mark.asyncio
async def test_same_phone_different_email_is_flagged_not_merged(db):
    with company_scope("comp_a"):
        await db["resumes"].insert_one(_resume("r1", "CND0001", email="one@mail.com", phone="9876543210"))
        await db["resumes"].insert_one(_resume("r2", "CND0002", email="two@mail.com", phone="+91 98765 43210"))
        first = await link_resume_to_candidate(db, "r1")
        second = await link_resume_to_candidate(db, "r2")
        assert first != second
        cand = await db["candidates"].find_one({"id": second})
        assert cand["possible_duplicate_of"] == [first]

        groups = await CandidateService(db).get_duplicates()
        assert any(g["match_type"] == "Matching Phone" and {c["id"] for c in g["candidates"]} == {first, second}
                   for g in groups)


@pytest.mark.asyncio
async def test_careers_details_override_the_parse(db):
    with company_scope("comp_a"):
        await db["resumes"].insert_one(_resume("r1", "CND0001", email="old@mail.com", name="Parsed Name",
                                               applicant_email="applicant@mail.com"))
        cid = await link_resume_to_candidate(
            db, "r1", source="Careers page",
            details={"email": "applicant@mail.com", "full_name": "Entered Name", "current_role": "Engineer"},
        )
        cand = await db["candidates"].find_one({"id": cid})
        assert cand["full_name"] == "Entered Name"
        assert cand["normalized_email"] == "applicant@mail.com"
        assert cand["current_role"] == "Engineer"
        assert cand["source"] == "Careers page"


@pytest.mark.asyncio
async def test_linking_stays_inside_the_company(db):
    with company_scope("comp_a"):
        await db["resumes"].insert_one(_resume("ra", "CND0001", email="same@mail.com"))
        a = await link_resume_to_candidate(db, "ra")
    with company_scope("comp_b"):
        await db["resumes"].insert_one(_resume("rb", "CND0002", email="same@mail.com"))
        b = await link_resume_to_candidate(db, "rb")
        assert await link_resume_to_candidate(db, "ra") is None   # company A's resume is not visible here
    assert a != b


@pytest.mark.asyncio
async def test_link_follows_a_merge(db):
    with company_scope("comp_a"):
        await db["candidates"].insert_one(CandidateDocument(
            id="keep", company_id="comp_a", full_name="Keep", email="keep@mail.com", normalized_email="keep@mail.com").to_dict())
        await db["candidates"].insert_one({**CandidateDocument(
            id="gone", company_id="comp_a", full_name="Gone", email="gone@mail.com", normalized_email="gone@mail.com").to_dict(),
            "merged_into": "keep", "status": "merged"})
        await db["resumes"].insert_one(_resume("r1", "CND0001", email="gone@mail.com"))
        assert await link_resume_to_candidate(db, "r1") == "keep"


@pytest.mark.asyncio
async def test_merge_moves_resumes_and_refuses_merged_records(db):
    svc = CandidateService(db)
    with company_scope("comp_a"):
        await db["resumes"].insert_one(_resume("r1", "CND0001", email="p@mail.com"))
        await db["resumes"].insert_one(_resume("r2", "CND0002", email="s@mail.com"))
        primary = await link_resume_to_candidate(db, "r1")
        secondary = await link_resume_to_candidate(db, "r2")

        await svc.merge(primary, secondary, ADMIN)
        r2 = await db["resumes"].find_one({"id": "r2"})
        assert r2["candidate_ref"] == primary
        assert not r2.get("redirect_id")            # still listed with the other resumes

        with pytest.raises(ConflictError):
            await svc.merge(primary, secondary, ADMIN)


@pytest.mark.asyncio
async def test_migration_links_applications_only_within_the_company():
    raw = FakeDatabase()
    await raw["resumes"].insert_one({**_resume("ra", "CND0001", email="shared@mail.com"), "company_id": "comp_a"})
    await raw["resumes"].insert_one({**_resume("rx", "CND0002", email=""), "company_id": "comp_a"})
    await raw["resumes"].insert_one({**_resume("rn", "CND0003", email="x@mail.com")})   # no company
    await raw["job_applications"].insert_one({"id": "app_a", "company_id": "comp_a", "applicant_email": "shared@mail.com", "resume_id": "other"})
    await raw["job_applications"].insert_one({"id": "app_b", "company_id": "comp_b", "applicant_email": "shared@mail.com", "resume_id": "other"})
    await raw["job_applications"].insert_one({"id": "app_blank", "company_id": "comp_a", "applicant_email": "", "resume_id": "other2"})
    await raw["job_applications"].insert_one({"id": "app_done", "company_id": "comp_a", "applicant_email": "shared@mail.com",
                                              "resume_id": "ra", "candidate_id": "already"})

    stats = await run_migration(raw, apply=True)
    assert stats["resumes_without_company"] == 1

    ra = await raw["resumes"].find_one({"id": "ra"})
    assert ra["candidate_id"] == "CND0001" and ra["candidate_ref"]
    assert (await raw["job_applications"].find_one({"id": "app_a"}))["candidate_id"] == ra["candidate_ref"]
    assert not (await raw["job_applications"].find_one({"id": "app_b"})).get("candidate_id")      # other company
    assert not (await raw["job_applications"].find_one({"id": "app_blank"})).get("candidate_id")  # blank email
    assert (await raw["job_applications"].find_one({"id": "app_done"}))["candidate_id"] == "already"

    # Running again creates nothing new
    again = await run_migration(raw, apply=True)
    assert again["candidates_created"] == 0 and again["applications_linked"] == 0


@pytest.mark.asyncio
async def test_profile_opens_from_a_resume_id_or_cnd_code(db):
    """Old links (applications, interviews, /evaluation/:id) pass a resume ID or a CND code."""
    svc = CandidateService(db)
    with company_scope("comp_a"):
        await db["resumes"].insert_one(_resume("r1", "CND0007", email="link@mail.com"))
        by_resume = await svc.get("r1")                  # not linked yet: linked on the way
        assert by_resume["candidate_id_display"] == "CND0007"
        by_code = await svc.get("CND0007")
        by_id = await svc.get(by_resume["id"])
        assert by_resume["id"] == by_code["id"] == by_id["id"]
        await svc.update_tags("CND0007", ["java"], ADMIN)
        assert (await svc.get(by_resume["id"]))["tags"] == ["java"]
