"""Tests for JD Match phase 2: cleaning the AI's re-rank answer. Run: venv/bin/python -m pytest tests/test_rerank.py"""
import os, sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from rerank import clean_results


def test_keeps_known_ids_in_input_order_and_clamps():
    raw = {"results": [
        {"id": "b", "fit_score": 140, "why": "Strong", "gaps": ""},
        {"id": "a", "fit_score": "72.6", "why": "  7 yrs Java,\n Kafka at two jobs ", "gaps": "No Spring Boot"},
        {"id": "x", "fit_score": 90, "why": "Not a candidate we sent"},
        {"id": "a", "fit_score": 10, "why": "Duplicate is ignored"},
        {"id": "c", "fit_score": "high", "why": "Unusable score is dropped"},
    ]}
    assert clean_results(raw, ["a", "b", "c"]) == [
        {"id": "a", "fit_score": 73, "why": "7 yrs Java, Kafka at two jobs", "gaps": "No Spring Boot"},
        {"id": "b", "fit_score": 100, "why": "Strong", "gaps": ""},
    ]


def test_long_lines_trimmed_and_empty_input():
    out = clean_results({"results": [{"id": "a", "fit_score": 50, "why": "w " * 200, "gaps": "g " * 200}]}, ["a"])
    assert len(out[0]["why"]) <= 160 and out[0]["why"].endswith("…") and len(out[0]["gaps"]) <= 120
    assert clean_results({}, ["a"]) == [] and clean_results(None, []) == []
