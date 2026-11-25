"""
Phase 9 Comprehensive Test Suite (Skill Intelligence, Normalization, Match & Gap Engine).
Verifies:
1. Normalization and alias handling ("ReactJS", "React.js" -> "React", "golang" -> "Go").
2. Skill calculation formulas:
   - Default weights: 70% interview / 30% resume.
   - Acceptance test: Java with 6 yrs on resume (resume score = 4.5) and interview rating 4.0/5.
     Score = 0.70 * 4.0 + 0.30 * 4.5 = 2.8 + 1.35 = 4.15 -> rounded 4.2.
   - Custom weights: 50% interview / 50% resume recalculation.
     Score = 0.50 * 4.0 + 0.50 * 4.5 = 2.0 + 2.25 = 4.25 -> rounded 4.3.
3. Classification (Primary vs Secondary) and explanation string format:
   "Primary: Java — resume 6.0 yrs, interview 4/5"
4. Job match % and gap identification:
   - Primary skills: Java, Spring Boot
   - Secondary skills: Docker
   - If candidate has Java and Spring Boot, but missing Docker:
     Primary match = 100% (2/2)
     Secondary match = 0% (0/1)
     Overall match = 0.70 * 100 + 0.30 * 0 = 70.0%
     Gaps = ["Docker"]
5. HR manual edit and source tracking.
6. Admin merge duplicate skills.
7. Tenant isolation (candidate_skills collection).
"""

import pytest
from app.core.exceptions import BadRequestError, NotFoundError
from app.core.tenant import ScopedDatabase, company_scope
from app.models.candidate_skill import SKILL_CLASS_PRIMARY, SKILL_CLASS_SECONDARY
from app.services.skill_intelligence_service import (
    SkillIntelligenceService,
    SkillNormalizationEngine,
    calculate_resume_skill_score,
)
from tests.fake_mongo import FakeDatabase


# ── 1. Skill Normalization & Aliases ─────────────────────────────────────────

def test_skill_normalization_and_aliases():
    SkillNormalizationEngine.load_aliases()

    # React aliases
    canon, raw = SkillNormalizationEngine.normalize_skill("React.js")
    assert canon == "React" and raw == "React.js"

    canon, _ = SkillNormalizationEngine.normalize_skill("reactjs")
    assert canon == "React"

    canon, _ = SkillNormalizationEngine.normalize_skill("REACT JS")
    assert canon == "React"

    # Go / Golang
    canon, _ = SkillNormalizationEngine.normalize_skill("golang")
    assert canon == "Go"

    # Spring Boot
    canon, _ = SkillNormalizationEngine.normalize_skill("springboot")
    assert canon == "Spring Boot"

    # Unknown/custom skill preserves clean name
    canon, raw = SkillNormalizationEngine.normalize_skill("Custom Internal Framework")
    assert canon == "Custom Internal Framework"


# ── 2. Resume Evidence Scoring Helper ────────────────────────────────────────

def test_resume_evidence_score():
    assert calculate_resume_skill_score(None) == 3.0
    assert calculate_resume_skill_score(0.5) == 3.0
    assert calculate_resume_skill_score(2.0) == 3.5
    assert calculate_resume_skill_score(4.0) == 4.0
    assert calculate_resume_skill_score(6.0) == 4.5
    assert calculate_resume_skill_score(10.0) == 5.0


# ── 3. Candidate Skill Calculation (Acceptance Criteria) ─────────────────────

@pytest.mark.asyncio
async def test_candidate_skill_calculation_acceptance():
    """
    Acceptance:
    A candidate with Java 6 yrs on the resume and an interview rating 4/5
    shows Java as primary with the explained score;
    changing the company weights to 50/50 recalculates.
    """
    db = FakeDatabase()
    service = SkillIntelligenceService(db)

    cand_id = "cand-java-dev"
    # Seed candidate with 6 yrs experience
    await db["candidates"].insert_one({
        "id": cand_id,
        "name": "Sarah Connor",
        "current_role": "Senior Java Developer",
        "total_experience_years": 6.0,
    })

    # Seed resume with "Java" and "Spring Boot"
    await db["resumes"].insert_one({
        "id": "res-1",
        "candidate_id": cand_id,
        "parsed_data": {
            "primary_skills": ["Java", "Spring Boot", "Git"],
        },
    })

    # Seed submitted interview evaluation with Java scored 4.0
    await db["interview_evaluations"].insert_one({
        "id": "eval-1",
        "candidate_id": cand_id,
        "status": "submitted",
        "ratings": [
            {"criterion_name": "Java", "rating": 4.0, "weight": 1.0},
        ],
    })

    # Recalculate with default weights (70% interview / 30% resume)
    # Resume score for 6.0 yrs = 4.5
    # Combined score = 0.70 * 4.0 + 0.30 * 4.5 = 2.8 + 1.35 = 4.15 -> 4.2
    skills = await service.recalculate_candidate_skills(cand_id)
    java_skill = next((s for s in skills if s["skill_name"] == "Java"), None)
    assert java_skill is not None
    assert java_skill["proficiency"] == 4.2
    assert java_skill["skill_class"] == SKILL_CLASS_PRIMARY
    assert "Primary: Java" in java_skill["explanation"]
    assert "resume 6.0 yrs" in java_skill["explanation"]
    assert "interview 4/5" in java_skill["explanation"]
    assert java_skill["verified"] is True

    # Now change company weights to 50% interview / 50% resume
    # Combined score = 0.50 * 4.0 + 0.50 * 4.5 = 2.0 + 2.25 = 4.25 -> 4.3
    await service.save_company_skill_weights(interview_weight=50.0, resume_weight=50.0)

    # Re-fetch candidate skills
    recalc_skills = await service.list_candidate_skills(cand_id)
    java_updated = next((s for s in recalc_skills if s["skill_name"] == "Java"), None)
    assert java_updated is not None
    assert java_updated["proficiency"] == 4.3


# ── 4. Job Match % and Missing Gap Calculation (Acceptance Criteria) ─────────

@pytest.mark.asyncio
async def test_job_match_and_gap_analysis_acceptance():
    """
    Acceptance:
    A job requiring Java, Spring Boot (primary) and Docker (secondary).
    Candidate has Java and Spring Boot, but lacks Docker.
    Validates the exact match % and missing gap list.
    """
    db = FakeDatabase()
    service = SkillIntelligenceService(db)

    cand_id = "cand-dev-123"
    job_id = "job-backend-lead"

    # Seed job opening
    await db["job_openings"].insert_one({
        "id": job_id,
        "title": "Backend Lead",
        "primary_skills": ["Java", "Spring Boot"],
        "secondary_skills": ["Docker"],
    })

    # Seed candidate skills
    await db["candidate_skills"].insert_one({
        "id": "cs-1",
        "candidate_id": cand_id,
        "skill_name": "Java",
        "proficiency": 4.5,
        "skill_class": "primary",
    })
    await db["candidate_skills"].insert_one({
        "id": "cs-2",
        "candidate_id": cand_id,
        "skill_name": "Spring Boot",
        "proficiency": 4.0,
        "skill_class": "primary",
    })

    match_result = await service.calculate_job_skill_match(candidate_id=cand_id, job_id=job_id)

    # Primary match: 2/2 = 100%
    assert match_result["primary_match_pct"] == 100.0
    assert len(match_result["matched_primary"]) == 2
    assert len(match_result["missing_primary"]) == 0

    # Secondary match: 0/1 = 0%
    assert match_result["secondary_match_pct"] == 0.0
    assert len(match_result["matched_secondary"]) == 0
    assert match_result["missing_secondary"] == ["Docker"]

    # Overall match = 0.70 * 100 + 0.30 * 0 = 70.0%
    assert match_result["overall_match_pct"] == 70.0
    assert match_result["gaps"] == ["Docker"]


# ── 5. HR Manual Edit & Skill Weights Validation ─────────────────────────────

@pytest.mark.asyncio
async def test_hr_manual_edit_and_weight_validation():
    db = FakeDatabase()
    service = SkillIntelligenceService(db)

    # Weights validation (must sum to 100)
    with pytest.raises(BadRequestError):
        await service.save_company_skill_weights(interview_weight=80.0, resume_weight=30.0)

    # HR edit on candidate skill
    edited = await service.update_candidate_skill_hr(
        candidate_id="cand-1",
        skill_name="Python",
        payload={
            "proficiency": 4.8,
            "skill_class": "primary",
            "years_experience": 5.0,
        },
    )
    assert edited["proficiency"] == 4.8
    assert edited["verified"] is True
    assert "HR" in edited["sources"]
    assert "HR verified (4.8/5)" in edited["explanation"]


# ── 6. Admin Merge Duplicate Skills ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_merge_skills():
    db = FakeDatabase()
    service = SkillIntelligenceService(db)

    # Seed candidate skills with "ReactJS"
    await db["candidate_skills"].insert_one({
        "id": "cs-reactjs",
        "candidate_id": "cand-1",
        "skill_name": "ReactJS",
        "proficiency": 4.0,
    })

    # Seed job with "ReactJS"
    await db["job_openings"].insert_one({
        "id": "job-1",
        "title": "Frontend Engineer",
        "primary_skills": ["ReactJS", "TypeScript"],
        "secondary_skills": [],
    })

    # Merge "ReactJS" into canonical "React"
    merge_res = await service.merge_duplicate_skills("ReactJS", "React")
    assert merge_res["status"] == "merged"

    # Verify candidate_skills updated
    cand_skill = await db["candidate_skills"].find_one({"id": "cs-reactjs"})
    assert cand_skill is not None
    assert cand_skill["skill_name"] == "React"

    # Verify job opening updated
    job_doc = await db["job_openings"].find_one({"id": "job-1"})
    assert job_doc is not None
    assert "React" in job_doc["primary_skills"]
    assert "ReactJS" not in job_doc["primary_skills"]


# ── 7. Multi-Tenant Isolation ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tenant_isolation_candidate_skills():
    raw_db = FakeDatabase()
    scoped_db = ScopedDatabase(raw_db)

    with company_scope("acme_corp"):
        acme_service = SkillIntelligenceService(scoped_db)
        await acme_service.update_candidate_skill_hr("cand-1", "Go", {"proficiency": 4.5})
        acme_skills = await acme_service.list_candidate_skills("cand-1")
        assert len(acme_skills) == 1

    with company_scope("beta_llc"):
        beta_service = SkillIntelligenceService(scoped_db)
        beta_skills = await beta_service.list_candidate_skills("cand-1")
        assert len(beta_skills) == 0


# ── Explicit P9-01 to P9-07 Acceptance Scenarios ────────────────────────────

@pytest.mark.asyncio
async def test_p9_01_resume_react_aliases():
    """P9-01: Resume lists 'ReactJS' and 'React.js' -> One skill 'React'."""
    db = FakeDatabase()
    service = SkillIntelligenceService(db)

    cand_id = "cand-p9-01"
    await db["candidates"].insert_one({"id": cand_id, "name": "Frontend Dev"})
    await db["resumes"].insert_one({
        "id": "res-p9-01",
        "candidate_id": cand_id,
        "parsed_data": {
            "primary_skills": ["ReactJS", "React.js"],
        },
    })

    skills = await service.recalculate_candidate_skills(cand_id)
    react_skills = [s for s in skills if s["skill_name"] == "React"]
    assert len(react_skills) == 1
    assert react_skills[0]["skill_name"] == "React"


@pytest.mark.asyncio
async def test_p9_02_interview_rating_recalculates_and_verifies():
    """P9-02: Submit an interview rating for a skill -> Skill score and class recalculate; marked verified."""
    db = FakeDatabase()
    service = SkillIntelligenceService(db)

    cand_id = "cand-p9-02"
    await db["candidates"].insert_one({"id": cand_id, "name": "Backend Dev", "total_experience_years": 3.0})
    await db["resumes"].insert_one({
        "id": "res-p9-02",
        "candidate_id": cand_id,
        "parsed_data": {"primary_skills": ["Python"]},
    })

    # Before interview: resume only
    initial_skills = await service.recalculate_candidate_skills(cand_id)
    py_initial = next(s for s in initial_skills if s["skill_name"] == "Python")
    assert py_initial["verified"] is False

    # Submit interview evaluation rating 4.5/5
    await db["interview_evaluations"].insert_one({
        "id": "eval-p9-02",
        "candidate_id": cand_id,
        "status": "submitted",
        "ratings": [{"criterion_name": "Python", "rating": 4.5}],
    })

    # Recalculate
    updated_skills = await service.recalculate_candidate_skills(cand_id)
    py_updated = next(s for s in updated_skills if s["skill_name"] == "Python")
    assert py_updated["verified"] is True
    assert "interview" in py_updated["sources"]
    assert py_updated["proficiency"] > py_initial["proficiency"]


@pytest.mark.asyncio
async def test_p9_03_weights_50_50_and_validation():
    """P9-03: Change weights to 50/50 -> All candidates' scores update; weights that don't sum to 100 are refused."""
    db = FakeDatabase()
    service = SkillIntelligenceService(db)

    # Validation: weights not summing to 100
    with pytest.raises(BadRequestError):
        await service.save_company_skill_weights(60.0, 50.0)

    # Valid 50/50
    saved = await service.save_company_skill_weights(50.0, 50.0)
    assert saved["interview_weight"] == 50.0
    assert saved["resume_weight"] == 50.0


@pytest.mark.asyncio
async def test_p9_04_hand_calculated_match_and_gap():
    """
    P9-04: Job with 2 primary + 1 secondary skill; candidate has 1 primary + the secondary.
    Match % equals the hand calculation; the missing primary is listed as a gap.
    Hand calculation:
      Primary match: 1 of 2 = 50.0%
      Secondary match: 1 of 1 = 100.0%
      Overall match: (0.70 * 50.0) + (0.30 * 100.0) = 35.0 + 30.0 = 65.0%
      Gaps: ['TypeScript']
    """
    db = FakeDatabase()
    service = SkillIntelligenceService(db)

    cand_id = "cand-p9-04"
    job_id = "job-p9-04"

    await db["job_openings"].insert_one({
        "id": job_id,
        "title": "Full Stack Dev",
        "primary_skills": ["React", "TypeScript"],
        "secondary_skills": ["Node.js"],
    })

    # Candidate has 1 primary ("React") and 1 secondary ("Node.js")
    await db["candidate_skills"].insert_one({
        "id": "cs-p9-4a",
        "candidate_id": cand_id,
        "skill_name": "React",
        "proficiency": 4.5,
    })
    await db["candidate_skills"].insert_one({
        "id": "cs-p9-4b",
        "candidate_id": cand_id,
        "skill_name": "Node.js",
        "proficiency": 4.0,
    })

    match = await service.calculate_job_skill_match(cand_id, job_id)
    assert match["primary_match_pct"] == 50.0
    assert match["secondary_match_pct"] == 100.0
    assert match["overall_match_pct"] == 65.0
    assert match["missing_primary"] == ["TypeScript"]
    assert match["missing_secondary"] == []
    assert match["gaps"] == ["TypeScript"]


@pytest.mark.asyncio
async def test_p9_05_explanation_details():
    """P9-05: Hover an explanation -> Shows sources and numbers used."""
    db = FakeDatabase()
    service = SkillIntelligenceService(db)

    cand_id = "cand-p9-05"
    await db["candidates"].insert_one({"id": cand_id, "name": "Java Lead", "total_experience_years": 6.0})
    await db["resumes"].insert_one({
        "id": "res-p9-05",
        "candidate_id": cand_id,
        "parsed_data": {"primary_skills": ["Java"]},
    })
    await db["interview_evaluations"].insert_one({
        "id": "eval-p9-05",
        "candidate_id": cand_id,
        "status": "submitted",
        "ratings": [{"criterion_name": "Java", "rating": 4.0}],
    })

    skills = await service.recalculate_candidate_skills(cand_id)
    java_skill = next(s for s in skills if s["skill_name"] == "Java")
    assert "resume 6.0 yrs" in java_skill["explanation"]
    assert "interview 4/5" in java_skill["explanation"]


@pytest.mark.asyncio
async def test_p9_06_heatmap_20_candidates():
    """P9-06: Heatmap for a job with 20 candidates."""
    db = FakeDatabase()
    service = SkillIntelligenceService(db)

    for i in range(20):
        c_id = f"cand-{i}"
        await db["candidates"].insert_one({"id": c_id, "name": f"Candidate {i}", "total_experience_years": 4.0})
        await db["candidate_skills"].insert_one({
            "id": f"cs-{i}",
            "candidate_id": c_id,
            "skill_name": "Python",
            "proficiency": 4.0,
            "skill_class": "primary",
        })

    analytics = await service.get_skill_matrix_analytics()
    assert len(analytics["matrix_rows"]) == 20
    for row in analytics["matrix_rows"]:
        assert "Python" in row["skills"]


@pytest.mark.asyncio
async def test_p9_07_company_b_tenant_isolation():
    """P9-07: Company B -> Its own weights, skills and data only."""
    raw_db = FakeDatabase()
    scoped_db = ScopedDatabase(raw_db)

    # Company A configures 60/40 weights and adds a skill
    with company_scope("comp_a"):
        srv_a = SkillIntelligenceService(scoped_db)
        await srv_a.save_company_skill_weights(60.0, 40.0)
        await srv_a.update_candidate_skill_hr("cand-1", "Kotlin", {"proficiency": 4.5})

        weights_a = await srv_a.get_company_skill_weights()
        assert weights_a["interview_weight"] == 60.0
        skills_a = await srv_a.list_candidate_skills("cand-1")
        assert len(skills_a) == 1

    # Company B has its own weights (defaults 70/30) and 0 candidate skills for cand-1
    with company_scope("comp_b"):
        srv_b = SkillIntelligenceService(scoped_db)
        weights_b = await srv_b.get_company_skill_weights()
        assert weights_b["interview_weight"] == 70.0
        skills_b = await srv_b.list_candidate_skills("cand-1")
        assert len(skills_b) == 0


