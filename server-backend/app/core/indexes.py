"""
MongoDB indexes for the busy collections (Phase 12 performance). Created at startup; safe to run every time
(creating an index that exists is a no-op). Every company query is filtered by company_id first
(app.core.tenant), so company_id leads the compound indexes, followed by the fields lists sort or filter on.

Measured with scripts/perf_seed.py + scripts/perf_measure.py (50 companies x 2,000 candidates): see
docs/phase12-hardening.md.
"""

from typing import Any, List, Tuple

from loguru import logger

ASC, DESC = 1, -1

# (collection, keys, options)
INDEXES: List[Tuple[str, List[Tuple[str, int]], dict]] = [
    # Resumes: the Resume list, CND code / candidate links, duplicate checks
    ("resumes", [("id", ASC)], {}),
    ("resumes", [("company_id", ASC), ("upload_date", DESC)], {}),
    ("resumes", [("company_id", ASC), ("candidate_ref", ASC)], {}),
    ("resumes", [("company_id", ASC), ("candidate_id", ASC)], {}),
    ("resumes", [("company_id", ASC), ("parsed_data.email", ASC)], {}),
    ("resumes", [("company_id", ASC), ("file_hash", ASC)], {}),
    ("resumes", [("company_id", ASC), ("status", ASC), ("upload_date", DESC)], {}),
    # Candidates (Phase 6)
    ("candidates", [("id", ASC)], {}),
    ("candidates", [("company_id", ASC), ("created_at", DESC)], {}),
    ("candidates", [("company_id", ASC), ("normalized_email", ASC)], {}),
    ("candidates", [("company_id", ASC), ("normalized_phone", ASC)], {}),
    ("candidate_documents", [("company_id", ASC), ("candidate_id", ASC)], {}),
    # Applications (Phase 5) and the pipeline (Phase 7)
    ("job_applications", [("id", ASC)], {}),
    ("job_applications", [("company_id", ASC), ("submitted_at", DESC)], {}),
    ("job_applications", [("company_id", ASC), ("opening_id", ASC), ("submitted_at", DESC)], {}),
    ("job_applications", [("company_id", ASC), ("candidate_id", ASC)], {}),
    ("job_applications", [("company_id", ASC), ("applicant_email", ASC)], {}),
    ("job_applications", [("company_id", ASC), ("resume_id", ASC)], {}),
    ("job_applications", [("company_id", ASC), ("stage_id", ASC)], {}),
    ("application_history", [("company_id", ASC), ("application_id", ASC), ("at", ASC)], {}),
    ("application_drafts", [("id", ASC)], {}),
    ("workflows", [("company_id", ASC), ("job_id", ASC)], {}),
    # Jobs (Phase 3)
    ("job_openings", [("id", ASC)], {}),
    ("job_openings", [("company_id", ASC), ("status", ASC)], {}),
    ("job_openings", [("company_id", ASC), ("created_at", DESC)], {}),
    # Interviews and evaluations (Phase 8); the reminder loop reads across companies by date
    ("interviews", [("id", ASC)], {}),
    ("interviews", [("company_id", ASC), ("scheduled_date", ASC)], {}),
    ("interviews", [("company_id", ASC), ("candidate_id", ASC)], {}),
    ("interviews", [("company_id", ASC), ("resume_id", ASC)], {}),
    ("interviews", [("company_id", ASC), ("application_id", ASC)], {}),
    ("interviews", [("scheduled_date", ASC), ("status", ASC)], {}),
    ("interview_evaluations", [("company_id", ASC), ("interview_id", ASC)], {}),
    # Skills (Phase 9)
    ("candidate_skills", [("company_id", ASC), ("candidate_id", ASC)], {}),
    ("candidate_skills", [("company_id", ASC), ("skill_name", ASC)], {}),
    # Users and notifications (Phase 11): notifications are read per user
    ("users", [("id", ASC)], {}),
    ("users", [("email", ASC)], {}),
    ("users", [("company_id", ASC)], {}),
    ("notifications", [("user_id", ASC), ("created_at", DESC)], {}),
    # Rate-limit counters (app.core.rate_limit): one per key, removed by MongoDB when the window is over
    ("rate_limits", [("id", ASC)], {"unique": True}),
    ("rate_limits", [("expires_at", ASC)], {"expireAfterSeconds": 0}),
]


async def ensure_indexes(db: Any) -> int:
    """Create every index above (raw database: indexes are not per company). Returns how many were ensured."""
    done = 0
    for coll, keys, options in INDEXES:
        try:
            await db[coll].create_index(keys, **options)
            done += 1
        except Exception as exc:  # an existing index with other options: leave it, say so
            logger.warning(f"Index {coll} {keys} not created: {exc}")
    return done
