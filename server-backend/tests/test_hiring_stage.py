"""Stage and Verdict are worked out from the old 14-value "recommendation" field."""

import re

import pytest

from app.utils.hiring_stage import (
    candidate_stage,
    recommendation_filter_for_stage,
    recommendation_filter_for_verdict,
    stage_of,
    verdict_of,
)
from app.utils.enums import InterviewStatus


@pytest.mark.parametrize(
    "recommendation, verdict, stage",
    [
        ("Pending", "Pending", "Interviewing"),
        (None, "Pending", "Interviewing"),
        ("Shortlisted", "Pending", "Interviewing"),
        ("Reschedule Required", "Pending", "Interviewing"),
        ("Selected", "Selected", "Interviewing"),
        ("Recommended", "Selected", "Interviewing"),
        ("Offer to Be Released", "Selected", "Offer"),
        ("Offer Accepted", "Selected", "Hired"),
        ("Offer Rejected", "Selected", "Closed"),
        ("Rejected", "Rejected", "Closed"),
        ("Not Recommended", "Rejected", "Closed"),
        ("On Hold", "On Hold", "Interviewing"),
        ("Need Further Evaluation", "On Hold", "Interviewing"),
        ("No Show", "No Show", "Interviewing"),
        ("Withdrawn", "Pending", "Closed"),
        ("selected", "Selected", "Interviewing"),
    ],
)
def test_every_old_value_maps_to_a_verdict_and_stage(recommendation, verdict, stage):
    assert verdict_of(recommendation) == verdict
    assert stage_of(recommendation) == stage


def test_no_show_status_is_a_no_show_verdict():
    assert verdict_of("Pending", InterviewStatus.NO_SHOW) == "No Show"


def test_candidate_stage_uses_latest_interview():
    interviews = [
        {"scheduled_date": "2026-11-01", "scheduled_time": "10:00", "recommendation": "Selected"},
        {"scheduled_date": "2026-11-09", "scheduled_time": "10:00", "recommendation": "Offer to Be Released"},
    ]
    assert candidate_stage(interviews) == "Offer"
    assert candidate_stage([]) == "Screening"


def _matches(condition: dict, value) -> bool:
    """Evaluate the regex / $not-regex condition the way MongoDB would."""
    if "$not" in condition:
        return not _matches(condition["$not"], value)
    flags = re.IGNORECASE if "i" in condition.get("$options", "") else 0
    return value is not None and re.match(condition["$regex"], value, flags) is not None


def test_filters_agree_with_the_mapping():
    values = ["Pending", None, "Selected", "Offer to Be Released", "Rejected", "On Hold", "No Show", "Withdrawn"]
    for verdict in ["Pending", "Selected", "Rejected", "On Hold", "No Show"]:
        cond = recommendation_filter_for_verdict(verdict)
        assert [v for v in values if _matches(cond, v)] == [v for v in values if verdict_of(v) == verdict]
    for stage in ["Interviewing", "Offer", "Hired", "Closed"]:
        cond = recommendation_filter_for_stage(stage)
        assert [v for v in values if _matches(cond, v)] == [v for v in values if stage_of(v) == stage]
