"""Tests for JD Match prompt mode: cleaning the search plan the AI returns. Run: venv/bin/python -m pytest tests/test_search_plan.py"""
import os, sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from search_plan import clean_plan


def test_skills_standardised_and_deduplicated():
    plan = clean_plan({"must_have_skills": ["Java", "Spring boot", "k8s", "java"], "nice_to_have_skills": ["Kubernetes", "AWS"]})
    assert plan["must_have_skills"] == ["Java", "Spring Boot", "Kubernetes"]
    assert plan["nice_to_have_skills"] == ["AWS"]          # already a must-have, so not repeated


def test_protected_traits_removed():
    plan = clean_plan({"keywords": ["female", "payments", "age below 30", "unmarried"], "must_have_skills": ["Single Sign-On"]})
    assert plan["keywords"] == ["payments"]
    assert plan["must_have_skills"] == ["Single Sign-On"]


def test_experience_range():
    assert clean_plan({"min_experience": 8, "max_experience": 5})[("min_experience")] == 5
    assert clean_plan({"min_experience": "abc", "max_experience": 99}) ["max_experience"] is None
    senior = clean_plan({"level": "Senior"})
    assert (senior["min_experience"], senior["max_experience"]) == (7, None)
    stated = clean_plan({"level": "Senior", "min_experience": 5, "max_experience": 8})
    assert (stated["min_experience"], stated["max_experience"]) == (5, 8)   # stated years win


def test_limits_and_blank_items():
    plan = clean_plan({"must_have_skills": [f"Skill{i}" for i in range(12)] + [" ", ""], "role_titles": ["A", "B", "C", "D", "E"]})
    assert len(plan["must_have_skills"]) == 8 and len(plan["role_titles"]) == 4


def test_alternatives_become_nice_to_have():
    prompt = "Hands-on with SQL and analytics tools such as Mixpanel or Amplitude. React / Node.js developer. Java or Kotlin."
    plan = clean_plan({"must_have_skills": ["SQL", "Mixpanel", "Amplitude", "React", "Node.js", "Java", "Kotlin"],
                       "nice_to_have_skills": ["JIRA"]}, prompt)
    assert plan["must_have_skills"] == ["SQL", "React", "Node.js"]
    assert plan["nice_to_have_skills"] == ["Mixpanel", "Amplitude", "Java", "Kotlin", "JIRA"]


def test_bracketed_notes_removed():
    assert clean_plan({"must_have_skills": ["Agile (Scrum)", "AWS (EC2, S3)"]})["must_have_skills"] == ["Agile", "AWS"]


def test_domain_skills_become_keywords():
    plan = clean_plan({"must_have_skills": ["Selenium", "Healthcare domain knowledge"],
                       "nice_to_have_skills": ["Appium", "Banking domain experience", "Retail industry"],
                       "keywords": ["banking"]})
    assert plan["must_have_skills"] == ["Selenium"] and plan["nice_to_have_skills"] == ["Appium"]
    assert plan["keywords"] == ["banking", "healthcare", "retail"]       # no duplicate 'banking'
