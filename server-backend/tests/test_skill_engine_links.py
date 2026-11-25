"""
Skill engine review fixes (PR #73):
- reads Phase 6 candidate fields (current_role, total_experience_years)
- finds the candidate's resumes through candidate_ref (resumes keep their CND code in candidate_id)
- reads Phase 8 evaluations: ratings {criterion_id: score} with the criteria copied in, status "SUBMITTED",
  candidate_id = a resume's CND code; scores on other scales count as out of 5
- recalculates on its own (resume parsed, feedback saved, evaluation submitted)
"""

import pytest

from app.core.tenant import ScopedDatabase, company_scope
from app.services.skill_intelligence_service import SkillIntelligenceService, recalculate_skills_for
from tests.fake_mongo import FakeDatabase


async def _seed(db):
    await db["candidates"].insert_one({
        "id": "cand-1", "full_name": "Asha Rao", "current_role": "Java Developer",
        "total_experience_years": 6.0, "candidate_id_display": "CND0001", "merged_into": None,
    })
    await db["resumes"].insert_one({
        "id": "res-1", "candidate_id": "CND0001", "candidate_ref": "cand-1",
        "parsed_data": {"primary_skills": ["Java", "Spring Boot"]},
    })
    await db["interview_evaluations"].insert_one({
        "id": "ev-1", "interview_id": "int-1", "candidate_id": "CND0001", "status": "SUBMITTED",
        "scale_max": 10,
        "criteria": [{"id": "c1", "label": "Java"}, {"id": "c2", "label": "Communication"}],
        "ratings": {"c1": 8, "c2": 6},
    })
    await db["interview_evaluations"].insert_one({
        "id": "ev-draft", "interview_id": "int-2", "candidate_id": "cand-1", "status": "DRAFT",
        "criteria": [{"id": "c1", "label": "Python"}], "ratings": {"c1": 5}, "scale_max": 5,
    })


@pytest.mark.asyncio
async def test_phase8_evaluation_and_phase6_fields_are_used():
    db = ScopedDatabase(FakeDatabase())
    with company_scope("comp_a"):
        await _seed(db)
        skills = await SkillIntelligenceService(db).recalculate_candidate_skills("cand-1")
        by_name = {s["skill_name"].lower(): s for s in skills}

        assert "java" in by_name and "spring boot" in by_name           # resume skills, via candidate_ref
        assert "communication" in by_name                                # interview-only skill
        assert "python" not in by_name                                   # drafts don't count
        java = by_name["java"]
        assert java.get("interview_score") == 4.0 or "4" in str(java.get("explanation", ""))  # 8/10 -> 4/5


@pytest.mark.asyncio
async def test_recalculation_runs_from_any_id():
    db = ScopedDatabase(FakeDatabase())
    with company_scope("comp_a"):
        await _seed(db)
        await recalculate_skills_for(db, "CND0001")                      # a CND code (interviews, evaluations)
        assert await db["candidate_skills"].count_documents({"candidate_id": "cand-1"}) >= 3

        await db["candidate_skills"].delete_many({})
        await recalculate_skills_for(db, None, resume_id="res-1")       # only a resume ID
        assert await db["candidate_skills"].count_documents({"candidate_id": "cand-1"}) >= 3

        await recalculate_skills_for(db, "nobody")                       # unknown: nothing happens, no error
