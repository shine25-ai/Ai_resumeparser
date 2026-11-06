"""Unit tests for gaps G09, G12, G13 and G14. Run: venv/bin/python -m pytest tests/test_medium_gaps.py"""
import os, sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import postprocess as pp
import graph
from extraction import normalise_text
from postprocess import coerce_and_validate
from schema import ResumeSchema, CandidateEvaluationSchema


# ---------------------------------------------------------------- G12 phones

@pytest.mark.parametrize("raw,expected", [
    ("+91 98450 12345", "+919845012345"),
    ("9876543210", "+919876543210"),
    ("+91-11-4567-8901", "+911145678901"),
    ("(+91) 80-2345-6789", "+918023456789"),
    ("98450 12345 / 98450 54321", "+919845012345"),   # first valid number kept
    ("+1 (415) 555-2671", "+14155552671"),
])
def test_phone_e164(raw, expected):
    assert pp.normalise_phone(raw) == (expected, None)


def test_invalid_phone_kept_with_note():
    value, issue = pp.normalise_phone("12345")
    assert value == "12345" and "kept as written" in issue
    assert pp.normalise_phone("") == ("", None)


# ---------------------------------------------------------------- G12 skills and dates

def test_skill_aliases_and_dedupe():
    assert pp.canonical_skills(["ReactJS", "react", "Node", "JS", "Java", "Postgres", "k8s", "Talent Acquisition"]) == \
        ["React", "Node.js", "JavaScript", "Java", "PostgreSQL", "Kubernetes", "Talent Acquisition"]


@pytest.mark.parametrize("text,is_end,expected", [
    ("Mar 2021", False, "2021-03"), ("03/2020", False, "2020-03"), ("2019", False, "2019"),
    ("Present", True, "Present"), ("till date", True, "Present"), ("garbage", False, "garbage"), ("", False, None),
])
def test_normalise_month(text, is_end, expected):
    assert pp.normalise_month(text, is_end) == expected


def test_normalise_resume():
    parsed = {"phone": "+91 98450 12345", "primary_skills": ["reactjs", "React"], "functional_skills": ["MS Excel"],
              "experience": [{"start_date": "Jan 2020", "end_date": "currently", "technologies_used": ["golang"]}],
              "projects": [{"tech_stack": ["k8s"]}], "education": [{"year_of_passing": "Batch of 2016"}]}
    assert pp.normalise_resume(parsed) == []
    assert parsed["phone"] == "+919845012345"
    assert parsed["primary_skills"] == ["React"]
    assert parsed["functional_skills"] == ["Microsoft Excel"]
    assert parsed["experience"][0] == {"start_date": "2020-01", "end_date": "Present", "technologies_used": ["Go"]}
    assert parsed["projects"][0]["tech_stack"] == ["Kubernetes"]
    assert parsed["education"][0]["year_of_passing"] == "2016"


# ---------------------------------------------------------------- G09 non-technical skills

def test_functional_skills_kept_by_validation():
    data, _ = coerce_and_validate({"full_name": "A", "email": "", "phone": "",
                                   "functional_skills": ["Payroll", "Talent Acquisition"]}, ResumeSchema)
    assert data["functional_skills"] == ["Payroll", "Talent Acquisition"]


# ---------------------------------------------------------------- G14 level and score

@pytest.mark.parametrize("years,role,expected", [
    (0.5, "Intern", "Fresher"), (1.6, "Junior Web Developer", "Junior"), (6.9, "UX Designer", "Mid-Level"),
    (8.3, "Data Engineer", "Senior"), (18.9, "Engineering Director", "Architect"), (13.4, "HR Manager", "Senior"),
    (12, "Head of HR", "Senior"), (11, "Solution Architect", "Architect"), (None, None, "Unknown"),
])
def test_experience_level(years, role, expected):
    assert pp.experience_level(years, role) == expected


def test_score_is_sum_of_capped_rubric():
    result, _ = coerce_and_validate({"ai_technical_score": 97, "experience_level": "Senior", "score_breakdown": {
        "skills_depth": 40, "experience_relevance": 20, "impact_and_projects": 12, "skill_recency": -3,
        "education_and_certifications": 7}}, CandidateEvaluationSchema)
    graph._apply_scoring(result, {"total_experience_years": 6.9, "current_role": "UX Designer"})
    assert result["score_breakdown"]["skills_depth"] == 30 and result["score_breakdown"]["skill_recency"] == 0
    assert result["ai_technical_score"] == 30 + 20 + 12 + 0 + 7
    assert result["experience_level"] == "Mid-Level"
    assert result["llm_scoring"] == {"ai_technical_score": 97, "experience_level": "Senior"}


# ---------------------------------------------------------------- G13 text normalisation

def test_normalise_text_ligatures_and_spaces():
    assert normalise_text("Airﬂow and Worﬁng team​\n\n\n\nNext") == "Airflow and Worfing team\n\nNext"


def test_empty_skills_detected_when_resume_has_skills_section():
    text = "Priya\nSkills\nFigma, Sketch\nExperience\nUX Designer, 2019 - Present"
    assert pp.missing_sections({"experience": [{"company": "X"}]}, text) == ["skills"]
    assert pp.missing_sections({"experience": [{"company": "X"}], "other_technologies": ["Figma"]}, text) == []
    assert pp.missing_sections({"experience": [{"company": "X"}]}, "Priya\nExperience\nUX Designer") == []


def test_finalize_re_extracts_empty_skills(monkeypatch):
    calls = []
    monkeypatch.setattr(graph, "_extract_section", lambda state, section: calls.append(section) or {"other_technologies": ["Figma"]})
    state = {"raw_text": "Skills\nFigma\nExperience\nX", "evaluation": {},
             "parsed_resume": {"full_name": "P", "email": "", "phone": "", "experience": []}}
    out = graph.finalize_resume_node(state)
    assert calls == ["basic"] and out["parsed_resume"]["other_technologies"] == ["Figma"]
    assert "skills" in state["evaluation"]["parse_quality"]["repaired_sections"]


def test_dates_as_written_win_over_model_dates():
    job = {"company": "TVS", "duration": "Jun 2018 – Present", "start_date": "2022-06", "end_date": "Present"}
    assert pp.job_interval(job) == (2018 * 12 + 6, pp.today_ym()[0] * 12 + pp.today_ym()[1])
    parsed = {"experience": [dict(job, technologies_used=[])]}
    assert pp.normalise_resume(parsed) == ["TVS: start_date 2022-06 corrected to 2018-06 from 'Jun 2018 – Present'"]
    assert parsed["experience"][0]["start_date"] == "2018-06"


def test_year_only_dates_are_not_given_a_month():
    parsed = {"experience": [{"company": "A", "duration": "2016 - 2019", "start_date": "2016-03", "end_date": "2019", "technologies_used": []}]}
    assert pp.normalise_resume(parsed) == []
    assert parsed["experience"][0]["start_date"] == "2016-03"


@pytest.mark.parametrize("text,expected", [
    ("Lakshmi Prasad\nlakshmi@example.com | +91 94440 11223 | Chennai\nExperience", "Chennai"),
    ("Meera Krishnan | meera.k@example.net | +91 90031 55667 | Hyderabad\nExperience", "Hyderabad"),
    ("Arjun\narjun@example.com | +91 98450 12345 | Bengaluru, Karnataka", "Bengaluru, Karnataka"),
    ("Priya\nData Engineer\nExperience\nInfosys | Pune", None),     # not a contact line
])
def test_location_from_contact_line(text, expected):
    assert pp.location_from_contact_line(text) == expected
