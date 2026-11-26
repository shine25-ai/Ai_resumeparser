"""
Move legacy ATS scorecards into interview evaluations (Phase 8, step 5).

Rule (agreed): a scorecard moves only when exactly one live (not cancelled) interview matches its candidate
and its role (job title, ignoring case and extra spaces). Anything with no match, or more than one match,
stays in ats_scorecards and is reported for a person to review.

What a migrated evaluation keeps:
- The three old scores become criteria on a 1-5 scale with equal weight, so the score equals the old overall.
- The legacy evaluator is stored as a name (interviewer_user_id "legacy:<name>"), because the old record has
  no user id. Such evaluations cannot be edited by that person; an admin can still reopen them.
- The evaluation id is "legacy-<scorecard id>", so running the migration again never duplicates a record.
- The old scorecard is kept and gets a "migrated_to" pointer, so nothing is lost and it can be rolled back.

Works on the raw database, one company at a time, so every record is written with its company_id set.
"""

from typing import Any, Dict, List, Optional, Tuple

from app.models.company import DEFAULT_COMPANY_ID
from app.models.evaluation import EVALUATION_SUBMITTED, InterviewEvaluationDocument
from app.utils.constants import COMPANIES_COLLECTION, INTERVIEW_EVALUATIONS_COLLECTION, INTERVIEWS_COLLECTION
from app.utils.evaluation_scoring import score_evaluation
from app.utils.helpers import utc_now

LEGACY_SCORECARDS_COLLECTION = "ats_scorecards"
LEGACY_ID_PREFIX = "legacy-"
LEGACY_INTERVIEWER_PREFIX = "legacy:"
CRITERIA = [
    {"id": "technical", "label": "Technical", "weight": 1.0},
    {"id": "communication", "label": "Communication", "weight": 1.0},
    {"id": "culture_fit", "label": "Culture fit", "weight": 1.0},
]
SCORE_KEYS = ("technical", "communication", "culture_fit")


def _norm(text: Any) -> str:
    return " ".join(str(text or "").lower().split())


def recommendation_code(text: Any) -> Optional[str]:
    """Map the old free-text recommendation onto the new codes. Unknown text maps to None."""
    value = _norm(text)
    if not value:
        return None
    words = value.split()
    if "no" in words or "not" in words or value.startswith("reject"):
        return "REJECT"
    if any(word in value for word in ("hire", "recommend", "yes", "select")):
        return "SELECT"
    return None


def plan_matches(
    scorecards: List[Dict[str, Any]],
    interviews: List[Dict[str, Any]],
) -> Dict[str, List[Any]]:
    """
    Sort scorecards into matched (one interview), unmatched (none) and ambiguous (several).
    Cancelled interviews are never a match.
    """
    live = [i for i in interviews if str(i.get("status") or "").upper() != "CANCELLED"]
    matched: List[Tuple[Dict[str, Any], Dict[str, Any]]] = []
    unmatched: List[Dict[str, Any]] = []
    ambiguous: List[Tuple[Dict[str, Any], List[str]]] = []

    for scorecard in scorecards:
        candidates = [
            i for i in live
            if str(i.get("candidate_id") or "") == str(scorecard.get("candidate_id") or "")
            and _norm(i.get("job_title")) == _norm(scorecard.get("role"))
        ]
        if len(candidates) == 1:
            matched.append((scorecard, candidates[0]))
        elif not candidates:
            unmatched.append(scorecard)
        else:
            ambiguous.append((scorecard, [str(i.get("id")) for i in candidates]))
    return {"matched": matched, "unmatched": unmatched, "ambiguous": ambiguous}


def build_evaluation(scorecard: Dict[str, Any], interview: Dict[str, Any], company_id: str) -> Dict[str, Any]:
    """The interview evaluation that represents one legacy scorecard."""
    ratings = {}
    for key in SCORE_KEYS:
        raw = scorecard.get(key)
        value = 3.0 if raw is None else float(raw)  # a missing score defaults to 3; a 0 is clamped to 1
        ratings[key] = min(5.0, max(1.0, value))
    score = score_evaluation(ratings, CRITERIA)

    evaluator = str(scorecard.get("evaluator") or "Unknown evaluator")
    created_at = str(scorecard.get("created_at") or utc_now().isoformat())
    legacy_id = str(scorecard.get("id"))
    doc = InterviewEvaluationDocument(
        id=f"{LEGACY_ID_PREFIX}{legacy_id}",
        interview_id=str(interview.get("id")),
        interviewer_user_id=f"{LEGACY_INTERVIEWER_PREFIX}{evaluator}",
        interviewer_name=evaluator,
        form_id="legacy-scorecard",
        scale_max=5,
        criteria=CRITERIA,
        ratings=ratings,
        comments=scorecard.get("notes") or None,
        recommendation=recommendation_code(scorecard.get("recommendation")),
        score=score,
        status=EVALUATION_SUBMITTED,
        submitted_at=created_at,
        audit=[{"action": "MIGRATED_FROM_SCORECARD", "legacy_id": legacy_id, "at": utc_now().isoformat()}],
        created_at=created_at,
        updated_at=utc_now().isoformat(),
    ).to_dict()
    doc["company_id"] = company_id
    doc["legacy_overall"] = scorecard.get("overall")
    return doc


def _company_query(company_id: str) -> Dict[str, Any]:
    """Records of one company. Records from before company workspaces count as the default company's."""
    if company_id == DEFAULT_COMPANY_ID:
        return {"$or": [{"company_id": company_id}, {"company_id": {"$exists": False}}, {"company_id": None}]}
    return {"company_id": company_id}


async def migrate_company(db: Any, company_id: str, apply: bool) -> Dict[str, Any]:
    """Plan (and, with apply=True, write) the migration for one company. Safe to run again."""
    scope = _company_query(company_id)
    scorecards = await db[LEGACY_SCORECARDS_COLLECTION].find({"$and": [scope, {"migrated_to": {"$exists": False}}]}).to_list(length=5000)
    interviews = await db[INTERVIEWS_COLLECTION].find(scope).to_list(length=20000)
    plan = plan_matches(scorecards, interviews)

    report: Dict[str, Any] = {
        "company_id": company_id,
        "scorecards_pending": len(scorecards),
        "to_migrate": len(plan["matched"]),
        "unmatched": [{"id": s.get("id"), "candidate": s.get("candidate_name"), "role": s.get("role")} for s in plan["unmatched"]],
        "ambiguous": [{"id": s.get("id"), "candidate": s.get("candidate_name"), "interviews": ids} for s, ids in plan["ambiguous"]],
        "migrated": 0,
        "already_present": 0,
    }
    if not apply:
        return report

    for scorecard, interview in plan["matched"]:
        doc = build_evaluation(scorecard, interview, company_id)
        if await db[INTERVIEW_EVALUATIONS_COLLECTION].find_one({"id": doc["id"]}):
            report["already_present"] += 1
        else:
            await db[INTERVIEW_EVALUATIONS_COLLECTION].insert_one(doc)
            report["migrated"] += 1
        await db[LEGACY_SCORECARDS_COLLECTION].update_one(
            {"id": scorecard.get("id")},
            {"$set": {"migrated_to": doc["id"]}},
        )
    return report


async def migrate_all(db: Any, apply: bool) -> List[Dict[str, Any]]:
    """Every company in turn. Reads the companies list from the raw database."""
    company_ids = [c.get("id") for c in await db[COMPANIES_COLLECTION].find({}).to_list(length=1000) if c.get("id")]
    if DEFAULT_COMPANY_ID not in company_ids:
        company_ids.append(DEFAULT_COMPANY_ID)  # pre-tenancy records have no company_id
    return [await migrate_company(db, cid, apply) for cid in company_ids]
