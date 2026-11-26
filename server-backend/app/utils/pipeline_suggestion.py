"""
Suggest the next pipeline stage once a candidate has finished every interview round for a job.

This only suggests. Nothing here moves a candidate; a recruiter confirms the move through the ATS pipeline.

Rules:
- Every round the job defines must have a completed interview (cancelled ones do not count).
- Any completed round rejected (verdict Rejected)  -> suggest Closed.
- Every completed round passed (verdict Selected) -> suggest Offer.
- Anything else (on hold, still pending)          -> no suggestion.
- No suggestion if the candidate is already at or past the suggested stage.
"""

from typing import Any, Dict, Iterable, List, Optional

from app.utils.hiring_stage import STAGES, verdict_of

SUGGEST_OFFER = "Offer"
SUGGEST_CLOSED = "Closed"


def _latest_completed_per_round(interviews: Iterable[Dict[str, Any]]) -> Dict[int, Dict[str, Any]]:
    """The most recent completed interview for each round number."""
    latest: Dict[int, Dict[str, Any]] = {}
    for item in interviews:
        status = str(getattr(item.get("status"), "value", item.get("status")) or "").upper()
        if status != "COMPLETED":
            continue
        round_number = int(item.get("round_number") or 1)
        key = (str(item.get("scheduled_date") or ""), str(item.get("scheduled_time") or ""))
        current = latest.get(round_number)
        if current is None or key > (str(current.get("scheduled_date") or ""), str(current.get("scheduled_time") or "")):
            latest[round_number] = item
    return latest


def suggest_next_stage(
    required_rounds: int,
    interviews: List[Dict[str, Any]],
    current_stage: str,
) -> Optional[Dict[str, Any]]:
    """Return {"stage", "reason"} to suggest, or None. `required_rounds` is the number of rounds the job defines."""
    if required_rounds <= 0:
        return None

    completed = _latest_completed_per_round(interviews)
    # Every round the job defines must be completed (round numbers are 1..required_rounds).
    if any(r not in completed for r in range(1, required_rounds + 1)):
        return None

    verdicts = [verdict_of(completed[r].get("recommendation"), completed[r].get("status")) for r in range(1, required_rounds + 1)]
    if "Rejected" in verdicts:
        suggested, reason = SUGGEST_CLOSED, "A round was not passed"
    elif all(v == "Selected" for v in verdicts):
        suggested, reason = SUGGEST_OFFER, f"All {required_rounds} round(s) passed"
    else:
        return None  # on hold or pending: a person needs to decide

    if current_stage in STAGES and suggested in STAGES and STAGES.index(current_stage) >= STAGES.index(suggested):
        return None  # already there or past it
    return {"stage": suggested, "reason": reason}
