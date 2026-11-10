"""Tests for JD Match prompt mode (phase 1): the match score, ranking, the plan cache and widening the pool.
The MongoDB tests use a throwaway database on localhost and are skipped when MongoDB isn't running."""

import asyncio
import os
import uuid
from unittest import mock

import httpx
import pytest
from motor.motor_asyncio import AsyncIOMotorClient

from app.core.exceptions import AppException, BadRequestError
from app.repositories.resume_repository import ResumeRepository
from app.services.prompt_match_service import (PromptMatchService, match_score, normalise_plan, rank_candidates,
                                               title_matches)

MONGO_URL = os.getenv("TEST_MONGO_URL", "mongodb://localhost:27017")


def cand(cid, skills=(), years=None, role=None, location=None, text="", ai=None, past_roles=(), family=None, education=()):
    return {"id": cid, "status": "PARSED", "redirect_id": None, "user_id": "u1", "filename": f"{cid}.pdf",
            "original_filename": f"{cid}.pdf", "file_path": f"/tmp/{cid}.pdf", "file_size": 1, "content_type": "application/pdf",
            "upload_date": "2026-10-01T00:00:00", "extracted_text": text,
            "parsed_data": {"full_name": cid, "primary_skills": list(skills), "total_experience_years": years,
                            "current_role": role, "location": location,
                            "experience": [{"designation": r} for r in past_roles],
                            "education": [{"degree": d} for d in education]},
            "ai_evaluation": {"ai_technical_score": ai, "role_family": family}}


JAVA_PLAN = normalise_plan({"role_titles": ["Java Developer"], "must_have_skills": ["Java", "Spring Boot", "Kafka"],
                            "nice_to_have_skills": ["AWS"], "min_experience": 5, "max_experience": 8, "locations": ["Chennai"]})


# ---------------------------------------------------------------- the score (no database)

def test_perfect_match_scores_high_and_lists_skills():
    m = match_score(cand("a", ["Java", "Spring Boot", "Kafka", "AWS"], 6, "Senior Java Developer", "Chennai", ai=80), JAVA_PLAN)
    assert m["match_score"] == 99          # everything but 1 of the 5 general-AI-score points
    assert m["matched_skills"] == ["Java", "Spring Boot", "Kafka"] and m["missing_skills"] == []
    assert m["role_match"] == "current role"


def test_missing_skill_and_experience_outside_range_cost_points():
    full = match_score(cand("a", ["Java", "Spring Boot", "Kafka"], 6, "Java Developer", "Chennai"), JAVA_PLAN)["match_score"]
    missing = match_score(cand("b", ["Java", "Spring Boot"], 6, "Java Developer", "Chennai"), JAVA_PLAN)
    junior = match_score(cand("c", ["Java", "Spring Boot", "Kafka"], 3, "Java Developer", "Chennai"), JAVA_PLAN)["match_score"]
    assert missing["missing_skills"] == ["Kafka"] and missing["match_score"] < full
    assert junior < full


def test_skill_only_in_resume_text_gets_half_credit():
    listed = match_score(cand("a", ["Java", "Spring Boot", "Kafka"]), JAVA_PLAN)["score_parts"]["must_have"]
    in_text = match_score(cand("b", ["Java", "Spring Boot"], text="Built Kafka consumers"), JAVA_PLAN)
    assert "Kafka" in in_text["matched_skills"] and in_text["score_parts"]["must_have"] == pytest.approx(listed - 50 / 3 / 2, abs=0.1)


def test_whole_word_skills_java_is_not_javascript():
    m = match_score(cand("a", ["JavaScript", "Spring Boot", "Kafka"]), JAVA_PLAN)
    assert "Java" in m["missing_skills"]


def test_parts_not_in_plan_are_left_out():
    plan = normalise_plan({"role_titles": ["HR Generalist"], "min_experience": 3})
    m = match_score(cand("hr", [], 4, "HR Generalist", ai=70), plan)
    assert set(m["score_parts"]) == {"experience", "role", "ai_score"}
    assert m["match_score"] == round(100 * (15 + 10 + 3.5) / 30)


def test_title_matching():
    assert title_matches("Backend Engineer", "Software Engineer - Backend")
    assert title_matches("Java Developer", "Sr. Java Developer")
    assert not title_matches("Java Developer", "JavaScript Developer")
    assert not title_matches("Data Engineer", "Data Analyst")


def test_role_from_earlier_job_or_family():
    plan = normalise_plan({"role_titles": ["Team Lead"], "role_family": "Software Engineering"})
    assert match_score(cand("a", role="Engineering Manager", past_roles=["Team Lead"]), plan)["role_match"] == "earlier role"
    assert match_score(cand("b", role="Developer", family="Software Engineering"), plan)["role_match"] == "same role family"


def test_remote_location_counts_for_everyone():
    plan = normalise_plan({"must_have_skills": ["Go"], "locations": ["Bengaluru", "Remote"]})
    assert match_score(cand("a", ["Go"], location="Pune"), plan)["score_parts"]["location"] == 5


def test_ranking_order_and_tie_break():
    pool = [cand("weak", ["Java"], 6, ai=90), cand("best", ["Java", "Spring Boot", "Kafka"], 6, "Java Developer", "Chennai", ai=50),
            cand("tie_low", ["Java", "Spring Boot"], 6, ai=40), cand("tie_high", ["Java", "Spring Boot"], 6, ai=60)]
    assert [r["id"] for r, _ in rank_candidates(pool, JAVA_PLAN)] == ["best", "tie_high", "tie_low", "weak"]


def test_edited_plan_is_cleaned():
    plan = normalise_plan({"must_have_skills": "Java", "nice_to_have_skills": ["java", "AWS"], "min_experience": "8", "max_experience": 5})
    assert plan["must_have_skills"] == ["Java"] and plan["nice_to_have_skills"] == ["AWS"]
    assert (plan["min_experience"], plan["max_experience"]) == (5, 8)


# ---------------------------------------------------------------- the search, against MongoDB

def with_service(test):
    async def run():
        client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=1500)
        try:
            await client.admin.command("ping")
        except Exception:
            pytest.skip("MongoDB is not running on localhost")
        name = f"prompt_match_tests_{uuid.uuid4().hex[:8]}"
        try:
            repo = ResumeRepository(client[name])
            return await test(repo, PromptMatchService(repo))
        finally:
            await client.drop_database(name)
            client.close()
    return asyncio.run(run())


def fake_parser(plan, calls, status_code=200):
    def handler(request):
        calls.append(request.url.path)
        if status_code != 200:
            return httpx.Response(status_code, json={"detail": "LLM rate limit (429)"})
        return httpx.Response(200, json={"status": "success", "plan": plan})
    real = httpx.AsyncClient
    return mock.patch.object(httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))


def no_ai_settings():
    return mock.patch("app.services.prompt_match_service.PromptMatchService._ai_config", mock.AsyncMock(return_value={}))


async def seed(repo):
    for c in [cand("best", ["Java", "Spring Boot", "Kafka"], 6, "Java Developer", "Chennai", ai=70),
              cand("no_kafka", ["Java", "Spring Boot"], 7, "Backend Developer", "Chennai", ai=80),
              cand("js_dev", ["JavaScript", "React"], 6, "Frontend Developer", ai=90),
              cand("hr", [], 6, "HR Manager", ai=60)]:
        await repo.create(c)


def test_prompt_search_ranks_and_caches_plan():
    async def t(repo, service):
        await seed(repo)
        calls = []
        with no_ai_settings(), fake_parser(JAVA_PLAN, calls):
            first = await service.search("Senior Java dev with Spring Boot and Kafka, 5-8 yrs, Chennai", None, "u1", True)
            again = await service.search("senior java dev with spring boot and kafka,  5-8 yrs, chennai", None, "u1", True, page=1)
        assert calls == ["/api/search-plan"]                    # second search used the cached plan
        assert first["plan_cached"] is False and again["plan_cached"] is True
        ids = [r["id"] for r in first["resumes"]]
        assert ids[:2] == ["best", "no_kafka"]
        # Only 2 have a requested skill, so others with the right years are added below them, with a note.
        assert sorted(ids[2:]) == ["hr", "js_dev"] and all(r["match"]["match_score"] < 40 for r in first["resumes"][2:])
        assert any("Few candidates have the requested skills" in n for n in first["notes"])
        assert first["resumes"][0]["match"]["missing_skills"] == []
        assert "1 candidate has every must-have skill." in first["notes"]
    with_service(t)


def test_edited_plan_skips_the_ai():
    async def t(repo, service):
        await seed(repo)
        calls = []
        with no_ai_settings(), fake_parser({}, calls):
            res = await service.search(None, {"must_have_skills": ["React"]}, "u1", True)
        assert calls == [] and [r["id"] for r in res["resumes"]] == ["js_dev"]
    with_service(t)


def test_pool_widens_with_a_note_when_too_few():
    async def t(repo, service):
        await seed(repo)
        with no_ai_settings():
            res = await service.search(None, {"must_have_skills": ["Rust"], "min_experience": 5}, "u1", True)
        assert len(res["resumes"]) == 4 and all(r["match"]["missing_skills"] == ["Rust"] for r in res["resumes"])
        assert any("Few candidates have the requested skills" in n for n in res["notes"])
    with_service(t)


def test_paging():
    async def t(repo, service):
        await seed(repo)
        with no_ai_settings():
            res = await service.search(None, {"min_experience": 5}, "u1", True, page=2, limit=3)
        assert res["total"] == 4 and res["total_pages"] == 2 and len(res["resumes"]) == 1
    with_service(t)


def test_errors():
    async def t(repo, service):
        with pytest.raises(BadRequestError):
            await service.search("   ", None, "u1", True)
        with pytest.raises(BadRequestError):
            await service.search(None, {"keywords": []}, "u1", True)
        with no_ai_settings(), fake_parser({}, [], status_code=429), pytest.raises(AppException) as err:
            await service.search("Java developer", None, "u1", True)
        assert err.value.status_code == 429 and "busy" in err.value.message
    with_service(t)


def test_other_word_forms_for_non_technology_skills():
    plan = normalise_plan({"must_have_skills": ["Product Roadmaps", "Business Requirements", "Java", "Recruitment"]})
    m = match_score(cand("pm", ["Product Roadmapping", "Business Requirement", "JavaScript", "Recruiter"]), plan)
    assert m["matched_skills"] == ["Product Roadmaps", "Business Requirements"]
    assert m["missing_skills"] == ["Java", "Recruitment"]


def test_too_few_years_lowers_the_whole_score():
    # The live case: a 0-year candidate with both skills ranked above a 4-year one for a 3-6 year role.
    plan = normalise_plan({"must_have_skills": ["Java", "Spring Boot"], "min_experience": 3, "max_experience": 6,
                           "locations": ["Chennai"]})
    fresher = match_score(cand("fresher", ["Java", "Spring Boot"], 0, location="Chennai", ai=38), plan)
    in_range = match_score(cand("mid", ["Java"], 4, location="Chennai", ai=78), plan)
    assert fresher["score_parts"]["below_min_years_factor"] == 0.55
    assert fresher["match_score"] < 60 and fresher["match_score"] < in_range["match_score"]
    one_short = match_score(cand("a", ["Java", "Spring Boot"], 2, location="Chennai"), plan)
    assert one_short["score_parts"]["below_min_years_factor"] == 0.85
    assert "below_min_years_factor" not in in_range["score_parts"]
    unknown = match_score(cand("b", ["Java", "Spring Boot"], None, location="Chennai"), plan)
    assert "below_min_years_factor" not in unknown["score_parts"]   # unknown years: only the 15 points are lost


def test_resume_response_carries_parse_error():
    from app.schemas.resume import ResumeResponse
    doc = cand("bad")
    doc.update(status="FAILED", parse_error="The file looks damaged or is not a real PDF.")
    assert ResumeResponse.model_validate(doc).model_dump()["parse_error"] == "The file looks damaged or is not a real PDF."


# ---------------------------------------------------------------- phase 2: AI re-rank

from app.services.prompt_match_service import apply_rerank, blend_scores, candidate_summary, RERANK_TOP


def test_summary_has_work_facts_but_no_contact_details():
    r = cand("a", ["Java", "Kafka"], 6, "Java Developer", "Chennai", text="call 9845012345")
    r["parsed_data"].update(email="a@x.com", phone="+919845012345", full_name="Arjun Ramesh",
                            experience=[{"designation": "Java Developer", "company": "Acme", "duration": "2020 - Present",
                                         "technologies_used": ["Kafka"], "responsibilities": "Built payment APIs"}])
    s = candidate_summary(r, {"matched_skills": ["Java"], "missing_skills": ["Spring Boot"]})
    text = str(s)
    assert "Arjun" not in text and "a@x.com" not in text and "9845012345" not in text
    assert s["recent_jobs"][0]["company"] == "Acme" and "Kafka" in s["skills"] and s["total_years"] == 6
    assert s["code_check"]["missing_must_haves"] == ["Spring Boot"]


def test_blend_reorders_only_the_top_block():
    ranked = [(cand(f"c{i}"), {"match_score": 90 - i}) for i in range(RERANK_TOP + 2)]
    ai = {"c0": {"fit_score": 20, "why": "Mostly QA work", "gaps": "No Java"},
          "c1": {"fit_score": 95, "why": "7 yrs Java at two jobs", "gaps": ""}}
    out = apply_rerank(ranked, ai)
    assert [r["id"] for r, _ in out[:2]] == ["c1", "c2"]                 # c0 fell to blend(90, 20) = 69
    c1 = out[0][1]
    assert c1["code_score"] == 89 and c1["ai_fit_score"] == 95 and c1["match_score"] == blend_scores(89, 95) == 91
    assert c1["why"] == "7 yrs Java at two jobs"
    assert [r["id"] for r, _ in out[-2:]] == [f"c{RERANK_TOP}", f"c{RERANK_TOP + 1}"]   # below the block: unchanged
    assert "why" not in out[-1][1]


def rerank_parser(calls, results=None, status_code=200):
    """Fake AI parser: /search-plan returns JAVA_PLAN, /rerank scores every candidate it is sent."""
    def handler(request):
        import json as _json
        calls.append(request.url.path)
        if status_code != 200:
            return httpx.Response(status_code, json={"detail": "LLM rate limit (429)"})
        if request.url.path.endswith("/search-plan"):
            return httpx.Response(200, json={"plan": JAVA_PLAN})
        sent = _json.loads(request.read())["candidates"]
        out = [{"id": c["id"], "fit_score": (results or {}).get(c["id"], 50), "why": f"why {c['id']}", "gaps": ""} for c in sent]
        return httpx.Response(200, json={"results": out})
    real = httpx.AsyncClient
    return mock.patch.object(httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))


def test_rerank_search_uses_ai_scores_and_caches_them():
    async def t(repo, service):
        await seed(repo)
        calls = []
        with no_ai_settings(), rerank_parser(calls, {"no_kafka": 100, "best": 10}):
            res = await service.search(None, JAVA_PLAN, "u1", True, rerank=True)
            again = await service.search(None, JAVA_PLAN, "u1", True, rerank=True, page=1, limit=2)
        assert calls == ["/api/rerank"]                                      # second search fully cached
        assert res["reranked"] is True and again["reranked"] is True
        top = res["resumes"][0]
        assert top["id"] == "no_kafka" and top["match"]["ai_fit_score"] == 100 and top["match"]["why"] == "why no_kafka"
        best = next(r for r in res["resumes"] if r["id"] == "best")
        assert best["match"]["code_score"] > best["match"]["match_score"]
    with_service(t)


def test_rerank_failure_falls_back_to_code_ranking():
    async def t(repo, service):
        await seed(repo)
        with no_ai_settings(), rerank_parser([], status_code=429):
            res = await service.search(None, JAVA_PLAN, "u1", True, rerank=True)
        assert res["reranked"] is False and res["resumes"][0]["id"] == "best"
        assert any("AI explanations are unavailable right now (rate limit)" in n for n in res["notes"])
        assert "why" not in res["resumes"][0]["match"]
    with_service(t)


def test_no_rerank_by_default():
    async def t(repo, service):
        await seed(repo)
        calls = []
        with no_ai_settings(), rerank_parser(calls):
            res = await service.search(None, JAVA_PLAN, "u1", True)
        assert calls == [] and res["reranked"] is False
    with_service(t)
