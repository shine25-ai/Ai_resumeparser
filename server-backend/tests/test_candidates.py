"""
Unit and isolation tests for Phase 6 (Candidate Management, SRS 4.10):
- Tenant isolation (Company A vs Company B)
- Migration dry-run and idempotency
- Duplicate detection by normalized email & phone
- Merge keeps all applications, documents, notes, tags, skills and is audited
- Permissions (Viewer vs Recruiter vs Admin)
- Search, multi-field filtering, sorting, bulk actions, and CSV export
"""

import io
import pytest
from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.core.tenant import ScopedDatabase, company_scope
from app.models.candidate import (
    CandidateDocument,
    CandidateFileDocument,
    normalize_email,
    normalize_phone,
)
from app.services.candidate_service import CandidateService
from scripts.migrate_candidates import run_migration
from tests.fake_mongo import FakeDatabase

ADMIN = {"id": "u_admin", "full_name": "Admin User", "email": "admin@company-a.com", "role": "admin"}
VIEWER = {"id": "u_view", "full_name": "Viewer User", "email": "view@company-a.com", "role": "viewer", "permissions": ["candidates:view"]}
RECRUITER = {"id": "u_rec", "full_name": "Recruiter User", "email": "rec@company-a.com", "role": "recruiter", "permissions": ["candidates:view", "candidates:edit", "candidates:export"]}


@pytest.fixture
def fake_db():
    return FakeDatabase()


# ── 1. Tenant Isolation ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_tenant_isolation_candidates_and_documents(fake_db):
    """Company A cannot see, query, or merge Company B's candidates."""
    db = ScopedDatabase(fake_db)
    svc = CandidateService(db)

    # Insert candidate in company A
    with company_scope("comp_a"):
        cand_a = CandidateDocument(
            id="cand_a1",
            company_id="comp_a",
            full_name="Alice Smith",
            email="alice@example.com",
            normalized_email="alice@example.com",
            phone="9876543210",
            normalized_phone="9876543210",
            skills=["Python", "FastAPI"],
        ).to_dict()
        await db["candidates"].insert_one(cand_a)

        doc_a = CandidateFileDocument(
            id="doc_a1",
            company_id="comp_a",
            candidate_id="cand_a1",
            original_filename="alice_resume.pdf",
            filename="alice_resume.pdf",
        ).to_dict()
        await db["candidate_documents"].insert_one(doc_a)

        # Company A can see it
        res_a = await svc.list()
        assert res_a["total"] == 1
        assert res_a["items"][0]["full_name"] == "Alice Smith"

    # Company B sees nothing
    with company_scope("comp_b"):
        res_b = await svc.list()
        assert res_b["total"] == 0
        assert len(res_b["items"]) == 0

        # Company B cannot fetch Candidate A by ID
        with pytest.raises(NotFoundError):
            await svc.get("cand_a1")

        # Company B cannot export Company A's data
        csv_b = await svc.export_csv(user=ADMIN)
        assert "Alice Smith" not in csv_b


# ── 2. Duplicate Detection & Merge ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_duplicate_detection_by_email_and_phone(fake_db):
    db = ScopedDatabase(fake_db)
    svc = CandidateService(db)

    with company_scope("comp_a"):
        # Candidate 1
        c1 = CandidateDocument(
            id="c1",
            company_id="comp_a",
            full_name="Bob Jones",
            email="bob@example.com",
            normalized_email="bob@example.com",
            phone="+91 9988776655",
            normalized_phone="9988776655",
            skills=["Java"],
            tags=["Screening"],
        ).to_dict()
        await db["candidates"].insert_one(c1)

        # Candidate 2 (same normalized email)
        c2 = CandidateDocument(
            id="c2",
            company_id="comp_a",
            full_name="Robert Jones",
            email="BOB@example.com",
            normalized_email="bob@example.com",
            phone="1122334455",
            normalized_phone="1122334455",
            skills=["Kotlin"],
        ).to_dict()
        await db["candidates"].insert_one(c2)

        # Candidate 3 (different email, but matching phone)
        c3 = CandidateDocument(
            id="c3",
            company_id="comp_a",
            full_name="B. Jones",
            email="bob.jones@work.com",
            normalized_email="bob.jones@work.com",
            phone="9988776655",
            normalized_phone="9988776655",
            skills=["Spring Boot"],
        ).to_dict()
        await db["candidates"].insert_one(c3)

        dups = await svc.get_duplicates()
        assert len(dups) >= 2
        types = {d["match_type"] for d in dups}
        assert "Matching Email" in types
        assert "Matching Phone" in types


@pytest.mark.asyncio
async def test_merge_candidates_preserves_everything_and_is_audited(fake_db):
    db = ScopedDatabase(fake_db)
    svc = CandidateService(db)

    with company_scope("comp_a"):
        # Primary candidate
        c1 = CandidateDocument(
            id="cand_prim",
            company_id="comp_a",
            full_name="Carol Danvers",
            email="carol@marvel.com",
            normalized_email="carol@marvel.com",
            skills=["Leadership", "Flight"],
            tags=["Top Tier"],
            total_experience_years=5.0,
        ).to_dict()
        c1["notes"] = [{"id": "n1", "text": "Primary note"}]
        await db["candidates"].insert_one(c1)

        # Secondary candidate
        c2 = CandidateDocument(
            id="cand_sec",
            company_id="comp_a",
            full_name="Captain Marvel",
            email="captain@marvel.com",
            normalized_email="captain@marvel.com",
            skills=["Combat", "Flight"],
            tags=["Avenger"],
            total_experience_years=8.0,
        ).to_dict()
        c2["notes"] = [{"id": "n2", "text": "Secondary note"}]
        await db["candidates"].insert_one(c2)

        # Associated applications and documents
        await db["job_applications"].insert_one({"id": "app_prim", "candidate_id": "cand_prim", "opening_title": "Lead"})
        await db["job_applications"].insert_one({"id": "app_sec", "candidate_id": "cand_sec", "opening_title": "Hero"})

        await db["candidate_documents"].insert_one({"id": "doc_prim", "candidate_id": "cand_prim", "filename": "prim.pdf"})
        await db["candidate_documents"].insert_one({"id": "doc_sec", "candidate_id": "cand_sec", "filename": "sec.pdf"})

        # Perform merge
        res = await svc.merge("cand_prim", "cand_sec", RECRUITER)
        assert res["primary_id"] == "cand_prim"
        assert res["secondary_id"] == "cand_sec"

        # Verify primary candidate now has union of skills, tags, notes, and max experience
        merged_prim = await db["candidates"].find_one({"id": "cand_prim"})
        assert set(merged_prim["skills"]) == {"Leadership", "Flight", "Combat"}
        assert set(merged_prim["tags"]) == {"Top Tier", "Avenger", "Merged"}
        assert len(merged_prim["notes"]) == 2
        assert merged_prim["total_experience_years"] == 8.0

        # Verify secondary candidate is deactivated and points to primary
        sec_doc = await db["candidates"].find_one({"id": "cand_sec"})
        assert sec_doc["status"] == "merged"
        assert sec_doc["merged_into"] == "cand_prim"

        # Verify secondary applications and documents repointed to primary
        apps = await db["job_applications"].find({"candidate_id": "cand_prim"}).to_list(length=10)
        assert len(apps) == 2
        assert {a["id"] for a in apps} == {"app_prim", "app_sec"}

        docs = await db["candidate_documents"].find({"candidate_id": "cand_prim"}).to_list(length=10)
        assert len(docs) == 2
        assert {d["id"] for d in docs} == {"doc_prim", "doc_sec"}

        # Verify audit log was written
        audit = await db["audit_logs"].find_one({"action": "CANDIDATE_MERGED"})
        assert audit is not None
        assert audit["entity_id"] == "cand_prim"

        # Cannot merge with self
        with pytest.raises(BadRequestError):
            await svc.merge("cand_prim", "cand_prim", RECRUITER)


# ── 3. Search & Multi-field Filtering ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_search_and_filtering(fake_db):
    db = ScopedDatabase(fake_db)
    svc = CandidateService(db)

    with company_scope("comp_a"):
        for i, (name, email, role, exp, skills, loc, tags, src) in enumerate([
            ("Devin DevOps", "devin@cloud.io", "DevOps Engineer", 7.0, ["AWS", "Docker", "Kubernetes"], "Bangalore", ["Urgent"], "LinkedIn"),
            ("Frontend Fiona", "fiona@web.dev", "React Developer", 3.5, ["React", "TypeScript", "Tailwind"], "Chennai", ["Shortlisted"], "Careers page"),
            ("Backend Brad", "brad@server.org", "Python Architect", 10.0, ["Python", "FastAPI", "PostgreSQL"], "Remote", ["Senior"], "Referral"),
        ]):
            await db["candidates"].insert_one(CandidateDocument(
                id=f"c_{i}",
                company_id="comp_a",
                full_name=name,
                email=email,
                normalized_email=normalize_email(email),
                current_role=role,
                total_experience_years=exp,
                skills=skills,
                location=loc,
                tags=tags,
                source=src,
            ).to_dict())

        # Text search
        s_react = await svc.list(q="React")
        assert s_react["total"] == 1
        assert s_react["items"][0]["full_name"] == "Frontend Fiona"

        # Experience filter
        s_exp = await svc.list(min_experience=5.0, max_experience=8.0)
        assert s_exp["total"] == 1
        assert s_exp["items"][0]["full_name"] == "Devin DevOps"

        # Location filter
        s_loc = await svc.list(location="Chennai")
        assert s_loc["total"] == 1

        # Tags filter
        s_tag = await svc.list(tags=["Senior"])
        assert s_tag["total"] == 1
        assert s_tag["items"][0]["full_name"] == "Backend Brad"

        # Sorting
        s_sort = await svc.list(sort_by="experience_desc")
        assert s_sort["items"][0]["full_name"] == "Backend Brad"

        s_sort_name = await svc.list(sort_by="name")
        assert s_sort_name["items"][0]["full_name"] == "Backend Brad"


# ── 4. Bulk Actions & CSV Export ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_bulk_actions_and_csv_export(fake_db):
    db = ScopedDatabase(fake_db)
    svc = CandidateService(db)

    with company_scope("comp_a"):
        c1 = CandidateDocument(id="b1", company_id="comp_a", full_name="User 1", email="u1@test.com", normalized_email="u1@test.com").to_dict()
        c2 = CandidateDocument(id="b2", company_id="comp_a", full_name="User 2", email="u2@test.com", normalized_email="u2@test.com").to_dict()
        await db["candidates"].insert_one(c1)
        await db["candidates"].insert_one(c2)

        # Bulk tag
        res_tag = await svc.bulk_action(["b1", "b2"], "add_tags", ["Batch2026"], ADMIN)
        assert res_tag["updated"] == 2

        c1_updated = await db["candidates"].find_one({"id": "b1"})
        assert "Batch2026" in c1_updated["tags"]

        # Bulk assign owner
        res_owner = await svc.bulk_action(["b1", "b2"], "assign_owner", {"owner_id": "u_rec", "owner_name": "Recruiter User"}, ADMIN)
        assert res_owner["updated"] == 2

        c2_updated = await db["candidates"].find_one({"id": "b2"})
        assert c2_updated["owner_id"] == "u_rec"
        assert c2_updated["owner_name"] == "Recruiter User"

        # CSV Export
        csv_str = await svc.export_csv(user=RECRUITER)
        assert "User 1" in csv_str
        assert "User 2" in csv_str
        assert "Batch2026" in csv_str


# ── 5. Migration Script Idempotency & Dry-Run ──────────────────────────────────


@pytest.mark.asyncio
async def test_migration_dry_run_and_idempotency(fake_db):
    # Setup company and resumes in raw fake_db
    fake_db["companies"].docs.append({"id": "comp_m", "name": "Migrate Co"})
    fake_db["resumes"].docs.append({
        "id": "res_1",
        "company_id": "comp_m",
        "filename": "john_doe.pdf",
        "original_filename": "john_doe.pdf",
        "applicant_email": "john@doe.com",
        "parsed_data": {"full_name": "John Doe", "email": "john@doe.com", "phone": "1234567890", "total_experience_years": 4.0},
        "tags": ["Applicant"],
        "upload_date": "2026-11-20T10:00:00Z",
    })
    # Same person second resume
    fake_db["resumes"].docs.append({
        "id": "res_2",
        "company_id": "comp_m",
        "filename": "john_doe_v2.pdf",
        "original_filename": "john_doe_v2.pdf",
        "applicant_email": "john@doe.com",
        "parsed_data": {"full_name": "John Doe", "email": "john@doe.com", "phone": "1234567890", "primary_skills": ["Go", "Docker"]},
        "upload_date": "2026-11-22T10:00:00Z",
    })
    # Application for res_1
    fake_db["job_applications"].docs.append({
        "id": "app_1",
        "company_id": "comp_m",
        "resume_id": "res_1",
        "applicant_email": "john@doe.com",
        "candidate_id": None,
    })

    # Dry-run first
    dry_stats = await run_migration(fake_db, apply=False)
    assert dry_stats["resumes_processed"] == 2
    assert dry_stats["candidates_created"] == 1  # 2 resumes deduplicated into 1 candidate
    assert len(fake_db["candidates"].docs) == 0  # no records written in dry-run

    # Apply migration
    apply_stats = await run_migration(fake_db, apply=True)
    assert apply_stats["candidates_created"] == 1
    assert apply_stats["candidate_documents_created"] == 2
    assert apply_stats["applications_linked"] == 1
    assert len(fake_db["candidates"].docs) == 1
    assert len(fake_db["candidate_documents"].docs) == 2

    # Verify application is linked with candidate_id
    linked_app = fake_db["job_applications"].docs[0]
    cand_id = fake_db["candidates"].docs[0]["id"]
    assert linked_app["candidate_id"] == cand_id

    # Run migration a second time (IDEMPOTENCY CHECK)
    repeat_stats = await run_migration(fake_db, apply=True)
    assert repeat_stats["candidates_created"] == 0  # none created because already exists!
    assert len(fake_db["candidates"].docs) == 1     # still exactly 1
    assert len(fake_db["candidate_documents"].docs) == 2  # still exactly 2
