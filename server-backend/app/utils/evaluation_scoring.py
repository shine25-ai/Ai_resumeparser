"""
Score maths for structured interview evaluations.

Rules (agreed for Phase 8):
- One evaluation's score is the weighted average of its criterion ratings: sum(weight * rating) / sum(weight).
  A criterion without a weight counts as 1, so unweighted forms become a plain average.
- A panel's score is the average of the submitted evaluations' scores.
- Drafts never count. The panel shows "N of M submitted", and HR may read the score while evaluations are missing.
"""

from typing import Any, Dict, List, Optional, Sequence


def score_evaluation(ratings: Dict[str, float], criteria: Sequence[Dict[str, Any]]) -> float:
    """
    Weighted average of ratings, on the same scale as the ratings themselves.

    Each criterion is a dict with "id" and optional "weight" (default 1). Raises ValueError when a criterion
    has no rating, a weight is negative, or the weights do not sum to a positive number.
    """
    if not criteria:
        raise ValueError("An evaluation form needs at least one criterion")

    total_weight = 0.0
    weighted_sum = 0.0
    for criterion in criteria:
        criterion_id = criterion["id"]
        if ratings.get(criterion_id) is None:
            raise ValueError(f"Missing rating for criterion '{criterion_id}'")
        weight = float(criterion.get("weight", 1) or 0)
        if weight < 0:
            raise ValueError(f"Weight for criterion '{criterion_id}' cannot be negative")
        weighted_sum += weight * float(ratings[criterion_id])
        total_weight += weight

    if total_weight <= 0:
        raise ValueError("Criteria weights must add up to more than zero")
    return round(weighted_sum / total_weight, 2)


def validate_ratings(ratings: Dict[str, float], criteria: Sequence[Dict[str, Any]], scale_max: float) -> None:
    """Reject ratings outside 1..scale_max and ratings for criteria the form does not have."""
    known = {c["id"] for c in criteria}
    unknown = set(ratings) - known
    if unknown:
        raise ValueError(f"Unknown criteria: {', '.join(sorted(unknown))}")
    for criterion_id, value in ratings.items():
        if value is None:
            continue
        if not (1 <= float(value) <= scale_max):
            raise ValueError(f"Rating for '{criterion_id}' must be between 1 and {scale_max:g}")


def panel_summary(evaluations: List[Dict[str, Any]], assigned_count: int) -> Dict[str, Optional[Any]]:
    """
    Summarize one interview's panel. `evaluations` holds every evaluation record (draft or submitted);
    `assigned_count` is how many interviewers are assigned to the interview.
    """
    submitted = [e for e in evaluations if e.get("status") == "SUBMITTED"]
    scores = [float(e["score"]) for e in submitted if e.get("score") is not None]
    average = round(sum(scores) / len(scores), 2) if scores else None
    return {
        "submitted_count": len(submitted),
        "assigned_count": assigned_count,
        "label": f"{len(submitted)} of {assigned_count} submitted",
        "score": average,
        "is_complete": assigned_count > 0 and len(submitted) >= assigned_count,
    }
