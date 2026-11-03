"""Tests for candidate search query building: skill match mode, skill fields, role field and sorting."""

import asyncio
import json

from app.repositories.resume_repository import ResumeRepository, resolve_sort, SORT_OPTIONS


def _run_filter(**kwargs):
    """Run filter_resumes against a stub and return (query, sort) it would send to MongoDB."""
    repo = ResumeRepository.__new__(ResumeRepository)
    captured = {}

    async def fake_find_many(query=None, skip=0, limit=100, sort=None, **_):
        captured["query"] = query
        captured["sort"] = sort
        return []

    async def fake_count(query=None):
        return 0

    repo.find_many = fake_find_many
    repo.count = fake_count
    asyncio.run(repo.filter_resumes(**kwargs))
    return captured["query"], captured["sort"]


def _as_text(query):
    return json.dumps(query, default=lambda r: r.pattern)


def test_skill_mode_all_requires_every_skill():
    query, _ = _run_filter(skills=["Java", "AWS"], skill_mode="all")
    # base redirect condition + one condition per skill
    assert len(query["$and"]) == 3


def test_skill_mode_any_matches_one_skill():
    query, _ = _run_filter(skills=["Java", "AWS"], skill_mode="any")
    assert len(query["$and"]) == 2


def test_skill_search_covers_all_skill_groups():
    text = _as_text(_run_filter(skills=["Python"])[0])
    for field in ["programming_languages", "devops_and_infrastructure", "other_technologies", "cloud_tech"]:
        assert field in text


def test_role_and_search_use_parser_current_role():
    assert "parsed_data.current_role" in _as_text(_run_filter(role="Tech Lead")[0])
    assert "parsed_data.current_role" in _as_text(_run_filter(search="lead")[0])


def test_sort_options():
    _, sort = _run_filter(sort_by="ai_score")
    assert sort == SORT_OPTIONS["ai_score"]
    assert resolve_sort(None) == SORT_OPTIONS["latest"]
    assert resolve_sort("not-a-sort") == SORT_OPTIONS["latest"]
