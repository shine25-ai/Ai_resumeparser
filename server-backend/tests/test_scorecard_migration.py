"""
Legacy scorecard migration (Phase 8, step 5): matching rules, the evaluation built from a scorecard,
recommendation mapping, dry run, and idempotent apply. Uses an in-memory database.
"""

import pytest

from app.models.company import DEFAULT_COMPANY_ID
from app.services.scorecard_migration import (
    build_evaluation,
    migrate_all,
    migrate_company,
    plan_matches,
    recommendation_code,
)

CO = DEFAULT_COMPANY_ID


def _scorecard(sid="sc-1", candidate="c-1", role="Backend Engineer", **overrides):
    base = {
        "id": sid, "candidate_id": candidate, "candidate_name": "Dev", "role": role,
        "technical": 4, "communication": 3, "culture_fit": 5, "overall": 4.0,
        "recommendation": "Hire", "notes": "Solid", "evaluator": "Asha",
        "created_at": "2026-11-02T10:00:00+00:00", "company_id": CO,
    }
    base.update(overrides)
    return base


def _interview(iid="iv-1", candidate="c-1", job="Backend Engineer", status="COMPLETED"):
    return {"id": iid, "candidate_id": candidate, "job_title": job, "status": status, "company_id": CO}


# ── Matching ────────────────────────────────────────────────────────────────


def test_one_matching_interview_is_a_match_and_role_comparison_ignores_case_and_spaces():
    plan = plan_matches([_scorecard(role="  backend   ENGINEER ")], [_interview()])
    assert len(plan["matched"]) == 1
    assert plan["unmatched"] == [] and plan["ambiguous"] == []


def test_no_matching_interview_is_unmatched():
    plan = plan_matches([_scorecard(candidate="c-9")], [_interview()])
    assert [s["id"] for s in plan["unmatched"]] == ["sc-1"]


def test_several_matching_interviews_are_ambiguous_not_guessed():
    plan = plan_matches([_scorecard()], [_interview("iv-1"), _interview("iv-2")])
    assert plan["matched"] == []
    assert plan["ambiguous"][0][1] == ["iv-1", "iv-2"]


def test_cancelled_interviews_never_count_as_a_match():
    plan = plan_matches([_scorecard()], [_interview("iv-1", status="CANCELLED"), _interview("iv-2")])
    assert len(plan["matched"]) == 1
    assert plan["matched"][0][1]["id"] == "iv-2"


# ── The evaluation built from a scorecard ───────────────────────────────────


def test_migrated_score_equals_the_old_overall_average():
    doc = build_evaluation(_scorecard(technical=4, communication=3, culture_fit=5), _interview(), CO)
    assert doc["score"] == 4.0
    assert doc["legacy_overall"] == 4.0
    assert doc["status"] == "SUBMITTED"


def test_ids_and_evaluator_are_marked_as_legacy():
    doc = build_evaluation(_scorecard(), _interview(), CO)
    assert doc["id"] == "legacy-sc-1"
    assert doc["interviewer_user_id"] == "legacy:Asha"
    assert doc["interviewer_name"] == "Asha"
    assert doc["company_id"] == CO
    assert doc["audit"][0]["action"] == "MIGRATED_FROM_SCORECARD"


def test_out_of_range_old_scores_are_clamped_to_the_1_to_5_scale():
    doc = build_evaluation(_scorecard(technical=9, communication=0), _interview(), CO)
    assert doc["ratings"]["technical"] == 5.0
    assert doc["ratings"]["communication"] == 1.0


@pytest.mark.parametrize(
    "text, code",
    [
        ("Strong Hire", "SELECT"),
        ("Hire", "SELECT"),
        ("Recommended", "SELECT"),
        ("No Hire", "REJECT"),
        ("Not Recommended", "REJECT"),
        ("Strong No Hire", "REJECT"),
        ("Pending", None),
        ("", None),
    ],
)
def test_recommendations_map_to_the_new_codes(text, code):
    assert recommendation_code(text) == code


# ── Running it ──────────────────────────────────────────────────────────────


class _Cursor:
    def __init__(self, docs):
        self.docs = docs

    async def to_list(self, length=None):
        return [dict(d) for d in self.docs]


def _match(doc, query):
    for key, cond in query.items():
        if key == "$and":
            if not all(_match(doc, sub) for sub in cond):
                return False
        elif key == "$or":
            if not any(_match(doc, sub) for sub in cond):
                return False
        elif isinstance(cond, dict) and "$exists" in cond:
            if (key in doc) != cond["$exists"]:
                return False
        elif doc.get(key) != cond:
            return False
    return True


class FakeCollection:
    def __init__(self, docs=None):
        self.docs = [dict(d) for d in (docs or [])]

    def find(self, query=None):
        return _Cursor([d for d in self.docs if _match(d, query or {})])

    async def find_one(self, query):
        found = [d for d in self.docs if _match(d, query)]
        return dict(found[0]) if found else None

    async def insert_one(self, doc):
        self.docs.append(dict(doc))

    async def update_one(self, query, update):
        for d in self.docs:
            if _match(d, query):
                d.update(update["$set"])
                return


class FakeDb:
    def __init__(self, **collections):
        self.collections = {k.replace("__", "_"): FakeCollection(v) for k, v in collections.items()}

    def __getitem__(self, name):
        return self.collections.setdefault(name, FakeCollection())


def _db(scorecards, interviews, companies=None):
    return FakeDb(
        ats_scorecards=scorecards,
        interviews=interviews,
        interview_evaluations=[],
        companies=companies or [{"id": CO}],
    )


@pytest.mark.asyncio
async def test_dry_run_reports_but_writes_nothing():
    db = _db([_scorecard(), _scorecard("sc-2", candidate="c-9")], [_interview()])
    report = await migrate_company(db, CO, apply=False)
    assert report["to_migrate"] == 1
    assert [u["id"] for u in report["unmatched"]] == ["sc-2"]
    assert db["interview_evaluations"].docs == []
    assert "migrated_to" not in db["ats_scorecards"].docs[0]


@pytest.mark.asyncio
async def test_apply_moves_matched_keeps_old_records_and_is_idempotent():
    db = _db([_scorecard(), _scorecard("sc-2", candidate="c-9")], [_interview()])
    first = await migrate_company(db, CO, apply=True)
    assert first["migrated"] == 1

    evals = db["interview_evaluations"].docs
    assert [e["id"] for e in evals] == ["legacy-sc-1"]
    old = [s for s in db["ats_scorecards"].docs if s["id"] == "sc-1"][0]
    assert old["migrated_to"] == "legacy-sc-1"  # kept, with a pointer
    assert len(db["ats_scorecards"].docs) == 2

    # Running again finds nothing new to move and creates no duplicates
    second = await migrate_company(db, CO, apply=True)
    assert second["to_migrate"] == 0
    assert len(db["interview_evaluations"].docs) == 1


@pytest.mark.asyncio
async def test_each_company_is_migrated_on_its_own():
    other = "company-b"
    db = FakeDb(
        ats_scorecards=[_scorecard(), _scorecard("sc-b", candidate="c-1", company_id=other)],
        interviews=[_interview(), {**_interview("iv-b"), "company_id": other}],
        interview_evaluations=[],
        companies=[{"id": CO}, {"id": other}],
    )
    reports = await migrate_all(db, apply=True)
    assert sum(r["migrated"] for r in reports) == 2
    companies = {e["company_id"] for e in db["interview_evaluations"].docs}
    assert companies == {CO, other}
