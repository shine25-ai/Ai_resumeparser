"""
Stage and Verdict, worked out from the existing interview fields.

The old "recommendation" field mixes three things in 14 values: how the interview went,
where the candidate is in hiring, and the offer state. These helpers split it into:

- Verdict: how the interview went (Pending, Selected, Rejected, On Hold, No Show)
- Stage:   where the candidate is (Screening, Interviewing, Offer, Hired, Closed)

Nothing stored is rewritten: both are computed on read, so existing data and any
integration that reads "recommendation" keep working unchanged.
"""

from typing import Iterable, Optional

VERDICTS = ["Pending", "Selected", "Rejected", "On Hold", "No Show"]
STAGES = ["Screening", "Interviewing", "Offer", "Hired", "Closed"]

_VERDICT_OF = {
    "selected": "Selected",
    "recommended": "Selected",
    "strong hire": "Selected",
    "hire": "Selected",
    "offer to be released": "Selected",
    "offer accepted": "Selected",
    "offer rejected": "Selected",
    "rejected": "Rejected",
    "not recommended": "Rejected",
    "no hire": "Rejected",
    "on hold": "On Hold",
    "hold": "On Hold",
    "need further evaluation": "On Hold",
    "no show": "No Show",
}

_STAGE_OF = {
    "offer to be released": "Offer",
    "offer accepted": "Hired",
    "offer rejected": "Closed",
    "rejected": "Closed",
    "not recommended": "Closed",
    "no hire": "Closed",
    "withdrawn": "Closed",
}


def verdict_of(recommendation: Optional[str], status: Optional[str] = None) -> str:
    """How the interview went. Anything not yet decided is Pending."""
    if str(getattr(status, "value", status) or "").upper() == "NO_SHOW":
        return "No Show"
    return _VERDICT_OF.get(str(recommendation or "").strip().lower(), "Pending")


def stage_of(recommendation: Optional[str], status: Optional[str] = None) -> str:
    """Where the candidate stands after this interview."""
    return _STAGE_OF.get(str(recommendation or "").strip().lower(), "Interviewing")


def candidate_stage(interviews: Iterable[dict]) -> str:
    """A candidate's stage is the stage of their latest interview, or Screening if they have none."""
    latest = None
    for item in interviews:
        key = (str(item.get("scheduled_date") or ""), str(item.get("scheduled_time") or ""), str(item.get("created_at") or ""))
        if latest is None or key > latest[0]:
            latest = (key, item)
    if latest is None:
        return "Screening"
    return stage_of(latest[1].get("recommendation"), latest[1].get("status"))


def _recommendation_filter(target: str, mapping: dict, default: str) -> dict:
    """A MongoDB condition on "recommendation" for one Verdict or Stage, ignoring case."""
    import re

    def pattern(values):
        return {"$regex": "^(" + "|".join(re.escape(v) for v in values) + ")$", "$options": "i"}

    if target == default:
        # Everything that maps to nothing else (including empty / missing)
        return {"$not": pattern(list(mapping))}
    return pattern([k for k, v in mapping.items() if v == target] or ["__none__"])


def recommendation_filter_for_verdict(verdict: str) -> dict:
    return _recommendation_filter(verdict, _VERDICT_OF, "Pending")


def recommendation_filter_for_stage(stage: str) -> dict:
    return _recommendation_filter(stage, _STAGE_OF, "Interviewing")
