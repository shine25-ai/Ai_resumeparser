"""Unit tests for postprocess.py (gaps G01-G03). Run: venv/bin/python -m pytest tests/test_postprocess.py"""
import os, sys
from datetime import date
from unittest import mock

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import postprocess as pp
from schema import ResumeSchema, EducationSchema


@pytest.fixture(autouse=True)
def fixed_today():
    with mock.patch.object(pp, "today_ym", return_value=(2026, 11)):
        yield


@pytest.mark.parametrize("text,is_end,expected", [
    ("2021-03", False, (2021, 3)), ("03/2021", False, (2021, 3)), ("Mar 2021", False, (2021, 3)),
    ("March '19", False, (2019, 3)), ("2016", False, (2016, 1)), ("2018", True, (2018, 12)),
    ("Present", True, (2026, 11)), ("till date", True, (2026, 11)), ("Present", False, None), ("", False, None),
])
def test_parse_ym(text, is_end, expected):
    assert pp.parse_ym(text, is_end) == expected


def years(*durations):
    return pp.compute_total_experience([{"duration": d} for d in durations])[0]


def test_mixed_formats_gap_and_overlap():
    # R06: "Since", MM/YYYY, YYYY to YYYY, plus a freelance job inside another job
    assert years("Since Aug 2022", "03/2019 – 07/2022", "Jan 2020 – Dec 2020", "2016 to 2018") == 10.8


def test_present_uses_today():
    assert years("May 2025 – Present") == 1.6


def test_internship_counts_months():
    assert years("Jan 2025 – Jun 2025") == 0.5


def test_structured_dates_win_over_duration():
    assert pp.compute_total_experience([{"start_date": "2024-11", "end_date": "Present", "duration": "??"}])[0] == 2.1


def test_unreadable_dates_return_none():
    assert pp.compute_total_experience([{"duration": "a few years"}]) == (None, 0)


def test_coerce_fills_nulls_and_fixes_types():
    data, issues = pp.coerce_and_validate(
        {"full_name": "A", "email": None, "education": None, "total_experience_years": "7 years",
         "primary_skills": "Java", "experience": [{"company": "X", "designation": None, "duration": "2020"}, "junk"]},
        ResumeSchema)
    assert data["email"] == "" and data["phone"] == ""
    assert data["education"] == [] and data["certifications"] == []
    assert data["total_experience_years"] == 7.0
    assert data["primary_skills"] == ["Java"]
    assert len(data["experience"]) == 1 and data["experience"][0]["designation"] == ""
    assert issues


def test_coerce_rejects_non_object_and_empty_output():
    with pytest.raises(ValueError):
        pp.coerce_and_validate(["x"], ResumeSchema)
    with pytest.raises(ValueError):
        pp.coerce_and_validate({}, EducationSchema)


def test_missing_sections_detects_dropped_sections():
    text = "EXPERIENCE\nx\nKey Projects\ny\nCertifications\nz\nEducation:\nw"
    parsed = {"experience": [{"company": "c"}], "projects": [], "education": None, "certifications": []}
    assert pp.missing_sections(parsed, text) == ["projects", "education", "certifications"]


def test_missing_sections_ignores_absent_headings():
    assert pp.missing_sections({"projects": []}, "Experience\nEducation\n") == ["experience", "education"]
