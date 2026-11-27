"""
Copy the development database into the staging database, split it into company workspaces, run every
data migration the current code expects, and report the gaps a person has to fix.

The development database is only read. The staging database is replaced (after you have backed it up).

Steps (the same code the backend runs; nothing new is invented here):
  1. copy every collection from development to staging (indexes are rebuilt in step 7)
  2. built-in roles, the default company, and the company split (app.repositories.tenant_migration):
     company email domains, users by email domain, resumes per company, interviews/logs follow their resume,
     configuration copied to every company
  3. optional: make --admin-email the platform super admin
  4. Phase 6: one candidate per person per company (scripts/migrate_candidates.run_migration)
  5. Phase 8: legacy ATS scorecards become interview evaluations (app.services.scorecard_migration)
  6. Phase 9: skills recalculated for every candidate, inside its company
  7. indexes (app.core.indexes)
  8. gap report (printed, and saved as JSON with --report)

Usage (run from server-backend/, with the venv):

  # 1. see what would happen (reads both databases, writes nothing)
  python -m scripts.migrate_dev_to_staging --source-url "$DEV_URL" --source-db resumeparser \\
      --target-url "$STAGING_URL" --target-db "$STAGING_DB" --allow-remote

  # 2. rehearse into a local database first (recommended)
  python -m scripts.migrate_dev_to_staging --source-url "$DEV_URL" --source-db resumeparser \\
      --target-url mongodb://localhost:27017 --target-db rp_rehearsal --allow-remote --apply \\
      --confirm-target rp_rehearsal --replace --report rehearsal.json

  # 3. for real, after `mongodump` of staging
  python -m scripts.migrate_dev_to_staging ... --target-db "$STAGING_DB" --allow-remote --apply \\
      --confirm-target "$STAGING_DB" --replace --admin-email "$DEFAULT_ADMIN_EMAIL" --report staging.json

Then restart the staging backend (pm2 restart python-staging-app) so it runs its own start-up checks.
"""

import argparse
import asyncio
import json
import os
import sys
from collections import Counter, defaultdict
from datetime import date
from typing import Any, Dict, List, Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

from app.core.tenant import TENANT_COLLECTIONS, ScopedDatabase, company_scope  # noqa: E402

BATCH = 500
# Caches keyed by search text: rebuilt on demand, never worth copying.
SKIP_BY_DEFAULT = {"rerank_results", "search_plans"}
# Collections that are platform-wide on purpose (no company_id expected).
PLATFORM_COLLECTIONS = {"companies", "counters", "migrations", "applicant_verifications", "plans",
                        "platform_settings", "rate_limits", "rerank_results", "search_plans"}


def _is_local(url: str) -> bool:
    return any(h in url for h in ("localhost", "127.0.0.1", "[::1]"))


async def _counts(db) -> Dict[str, int]:
    names = sorted(n for n in await db.list_collection_names() if not n.startswith("system."))
    return {n: await db[n].estimated_document_count() for n in names}


async def copy_database(src, dst, skip: set) -> Dict[str, int]:
    copied: Dict[str, int] = {}
    for name in sorted(await src.list_collection_names()):
        if name.startswith("system.") or name in skip:
            continue
        await dst[name].drop()
        batch: List[Dict[str, Any]] = []
        n = 0
        async for doc in src[name].find({}):
            batch.append(doc)
            if len(batch) >= BATCH:
                await dst[name].insert_many(batch, ordered=False)
                n += len(batch)
                batch = []
        if batch:
            await dst[name].insert_many(batch, ordered=False)
            n += len(batch)
        copied[name] = n
    return copied


async def split_companies(db) -> Dict[str, int]:
    from app.core.bootstrap import bootstrap_default_roles
    from app.repositories.company_repository import bootstrap_companies
    from app.repositories.tenant_migration import migrate_to_companies

    await bootstrap_default_roles(db)
    # Jobs and applications from before workspaces name their company; the start-up code would send every one
    # without a company_id to the default company, so match them by that name first.
    by_name = {(c.get("name") or "").strip().lower(): c["id"] async for c in db["companies"].find({}, {"id": 1, "name": 1})}
    matched = Counter()
    for coll in ("job_openings", "job_applications"):
        async for d in db[coll].find({"company_id": {"$in": [None, ""]}, "company_name": {"$nin": [None, ""]}},
                                     {"_id": 0, "id": 1, "company_name": 1}):
            cid = by_name.get(d["company_name"].strip().lower())
            if cid and d.get("id"):
                await db[coll].update_one({"id": d["id"]}, {"$set": {"company_id": cid}})
                matched[coll] += 1
    await bootstrap_companies(db)
    stats = {k: v for k, v in (await migrate_to_companies(db)).items() if v}
    stats.update({f"{k} matched by company name": v for k, v in matched.items()})
    return stats


async def normalise_jobs(db) -> Dict[str, int]:
    """Older jobs keep skills in required_/preferred_skills; editing and publishing now check primary_/secondary_."""
    done: Counter = Counter()
    for new, old in (("primary_skills", "required_skills"), ("secondary_skills", "preferred_skills")):
        async for j in db["job_openings"].find({"$or": [{new: {"$exists": False}}, {new: []}, {new: None}],
                                                old: {"$exists": True, "$ne": []}}, {"_id": 0, "id": 1, old: 1}):
            if j.get("id") and j.get(old):
                await db["job_openings"].update_one({"id": j["id"]}, {"$set": {new: list(j[old])}})
            done[new] += 1
    return dict(done)


async def promote_admin(db, email: str) -> str:
    if not email:
        return "no --admin-email given (the backend promotes DEFAULT_ADMIN_EMAIL when it starts)"
    user = await db["users"].find_one({"email": email.strip().lower()})
    if not user:
        return f"{email} is not in the development data; the staging backend creates it from its .env on start"
    await db["users"].update_one({"_id": user["_id"]},
                                 {"$set": {"role": "superadmin", "company_id": user.get("company_id") or "default"}})
    return f"{email} is now the platform super admin"


async def recalculate_skills(raw) -> Dict[str, int]:
    from app.services.skill_intelligence_service import recalculate_skills_for

    scoped = ScopedDatabase(raw)
    done: Counter = Counter()
    async for c in raw["companies"].find({}, {"id": 1}):
        cid = c["id"]
        with company_scope(cid):
            async for cand in raw["candidates"].find({"company_id": cid, "merged_into": None}, {"id": 1}):
                await recalculate_skills_for(scoped, cand["id"])
                done[cid] += 1
    return dict(done)


# ── Gap report ────────────────────────────────────────────────────────────────


async def gap_report(db) -> Dict[str, Any]:
    """Everything the new code needs that the copied data doesn't have. Each entry: count and a few examples."""
    names = {c["id"]: c.get("name") async for c in db["companies"].find({}, {"id": 1, "name": 1})}
    existing = set(await db.list_collection_names())
    gaps: Dict[str, Any] = {}

    def add(key: str, docs: List[Dict[str, Any]], fields: List[str], why: str, fix: str, level: str = "fix"):
        if docs:
            gaps[key] = {"count": len(docs), "level": level, "why": why, "fix": fix,
                         "examples": [{f: d.get(f) for f in fields if d.get(f) is not None} for d in docs[:5]]}

    async def find(coll: str, query: Dict[str, Any], proj: List[str]) -> List[Dict[str, Any]]:
        if coll not in existing:
            return []
        return await db[coll].find(query, {**{f: 1 for f in proj}, "_id": 0}).to_list(length=None)

    no_company = {"$or": [{"company_id": {"$exists": False}}, {"company_id": None}, {"company_id": ""}]}
    leftover = {}
    for coll in sorted(TENANT_COLLECTIONS & existing):
        q = dict(no_company)
        if coll == "roles":
            q = {"$and": [no_company, {"is_system": {"$ne": True}}]}
        if coll == "settings":
            q = {"$and": [no_company, {"type": {"$nin": ["ai_config", "platform", "platform_settings"]}}]}
        n = await db[coll].count_documents(q)
        if n:
            leftover[coll] = n
    if leftover:
        gaps["records_without_company"] = {"count": sum(leftover.values()), "level": "fix", "by_collection": leftover,
                                           "why": "Company-scoped records with no company are invisible to everyone.",
                                           "fix": "Find out whose they are; set company_id, or delete test data."}

    # Companies
    for c in await find("companies", {}, ["id", "name", "email_domains", "plan", "limits"]):
        cid, label = c["id"], c.get("name") or c["id"]
        admins = await db["users"].count_documents({"company_id": cid, "role": {"$in": ["admin", "company_admin"]},
                                                    "is_deleted": {"$ne": True}})
        if cid != "default" and not c.get("email_domains"):
            gaps.setdefault("companies_without_email_domains", {"count": 0, "level": "fix", "companies": [], "why":
                            "Its staff can't be placed in it by email address, so they land in the default company.",
                            "fix": "Super admin: Companies → the company → Edit → Email domains; then move its users."})
            gaps["companies_without_email_domains"]["count"] += 1
            gaps["companies_without_email_domains"]["companies"].append(label)
        if not admins and cid != "default":
            gaps.setdefault("companies_without_admin", {"count": 0, "level": "fix", "companies": [], "why":
                            "Nobody can manage the company's users, settings or jobs.",
                            "fix": "Super admin: Companies → the company → Admin Users → add one."})
            gaps["companies_without_admin"]["count"] += 1
            gaps["companies_without_admin"]["companies"].append(label)
        with company_scope(cid):
            mail = await db["settings"].find_one({"company_id": cid, "type": {"$in": ["email", "email_config", "smtp"]}})
        if not mail or not mail.get("smtp_server"):
            gaps.setdefault("companies_without_email_settings", {"count": 0, "level": "fix", "companies": [], "why":
                            "Applicants can't get a verification code, and invitations/interview emails fail.",
                            "fix": "Company admin: Settings → Email Configuration (re-enter the SMTP password)."})
            gaps["companies_without_email_settings"]["count"] += 1
            gaps["companies_without_email_settings"]["companies"].append(label)
        if not c.get("plan"):
            gaps.setdefault("companies_without_plan", {"count": 0, "level": "info", "companies": [], "why":
                            "No plan means no limits (unlimited users, jobs, storage and AI parses).",
                            "fix": "Super admin: Plans & Billing → create plans; Companies → choose one."})
            gaps["companies_without_plan"]["count"] += 1
            gaps["companies_without_plan"]["companies"].append(label)

    # Users
    add("users_without_role", await find("users", {"$or": [{"role": {"$exists": False}}, {"role": ""}]}, ["email", "company_id"]),
        ["email", "company_id"], "They sign in with no permissions.", "Company Users → set a role.")
    role_slugs = {r.get("slug") for r in await find("roles", {}, ["slug"])} | {"superadmin", "admin", "company_admin"}
    add("users_with_unknown_role", [u for u in await find("users", {}, ["email", "role"]) if u.get("role") and u["role"] not in role_slugs],
        ["email", "role"], "Their role no longer exists, so they get no permissions.", "Company Users → choose a current role.")
    if not await db["users"].count_documents({"role": "superadmin"}):
        gaps["no_super_admin"] = {"count": 1, "level": "fix", "why": "Nobody can manage companies or platform settings.",
                                  "fix": "Run again with --admin-email, or restart the backend with DEFAULT_ADMIN_* set."}

    # Jobs
    no_skills = {"$and": [{"$or": [{f: {"$exists": False}}, {f: []}, {f: None}]} for f in ("primary_skills", "required_skills")]}
    add("jobs_without_primary_skills", await find("job_openings", no_skills, ["code", "title", "status", "company_id"]),
        ["title", "status", "company_id"], "They can't be published again, and job match % has nothing to compare.",
        "Edit the job: add primary skills.", "info")
    company_of = {c["id"]: (c.get("name") or "").strip().lower() for c in await find("companies", {}, ["id", "name"])}
    for coll in ("job_openings", "job_applications"):
        add(f"{coll}_in_wrong_company", [d for d in await find(coll, {}, ["id", "title", "applicant_email", "company_id", "company_name"])
                                        if d.get("company_name") and d["company_name"].strip().lower() in company_of.values()
                                        and company_of.get(d.get("company_id")) != d["company_name"].strip().lower()],
            ["title", "applicant_email", "company_name", "company_id"],
            "Its company_name names a different company than the workspace it is in.",
            "Set company_id to the company it names (or fix company_name if the workspace is right).")

    # Resumes and candidates
    add("resumes_not_linked_to_candidate", await find("resumes", {"candidate_ref": {"$exists": False}, "status": "PARSED"},
                                                      ["id", "original_filename", "company_id"]),
        ["id", "original_filename", "company_id"], "They don't show in the Candidate Database or Candidate 360.",
        "Usually resumes without an email; open them and add one, or reprocess.")
    add("resumes_not_parsed", await find("resumes", {"status": {"$in": ["PENDING", "FAILED", "PROCESSING"]}},
                                         ["id", "original_filename", "status", "company_id"]),
        ["id", "original_filename", "status", "company_id"], "No profile was read from them.", "Candidates → Reprocess AI (or delete test uploads).", "info")
    resume_ids = {r["id"] for r in await find("resumes", {}, ["id"])}
    local_files = await find("resumes", {"$and": [{"$or": [{"s3_url": {"$exists": False}}, {"s3_url": None}, {"s3_url": ""}]},
                                                  {"file_path": {"$exists": True, "$nin": [None, ""]}}]},
                             ["id", "original_filename", "file_path"])
    add("resume_files_on_dev_server_disk", local_files, ["original_filename", "file_path"],
        "The record moved but the file is on the development server's disk, so downloads fail on staging.",
        "Copy server-backend/app/uploads/ from the development server to the staging server (rsync).")
    add("job_applications_without_resume", [a for a in await find("job_applications", {}, ["id", "resume_id", "applicant_email"])
                                            if a.get("resume_id") and a["resume_id"] not in resume_ids],
        ["applicant_email", "resume_id"], "The application's resume is gone, so reviewers see no CV.", "Ask for the resume again or archive.")

    # Applications
    add("applications_without_candidate", await find("job_applications", {"candidate_id": {"$in": [None, ""]}},
                                                     ["id", "applicant_email", "company_id"]),
        ["id", "applicant_email", "company_id"], "They don't appear on the candidate's profile.", "Run migrate_candidates again after fixing the resume.")
    job_ids = {j["id"] for j in await find("job_openings", {}, ["id"])}
    add("applications_for_missing_job", [a for a in await find("job_applications", {}, ["id", "opening_id", "applicant_email"])
                                          if a.get("opening_id") and a["opening_id"] not in job_ids],
        ["id", "opening_id", "applicant_email"], "Their job was deleted; reports and the pipeline skip them.", "Archive or delete them.")

    # Interviews and evaluations
    add("interviews_without_application", await find("interviews", {"application_id": {"$in": [None, ""]}, "status": {"$ne": "CANCELLED"}},
                                                    ["id", "candidate_name", "scheduled_date"]),
        ["id", "candidate_name", "scheduled_date"], "Older interviews aren't tied to an application, so the pipeline can't suggest the next stage.",
        "Nothing to do for past interviews.", "info")
    add("interviews_without_interviewer_user", await find("interviews", {"interviewer_id": {"$in": [None, ""]}, "status": {"$ne": "CANCELLED"}},
                                                         ["id", "candidate_name", "interviewer_name"]),
        ["id", "candidate_name", "interviewer_name"], "Nobody can submit an evaluation for them.", "Edit the interview: pick the interviewer.")
    today = date.today().isoformat()
    add("past_interviews_still_scheduled", await find("interviews", {"status": "SCHEDULED", "scheduled_date": {"$lt": today}},
                                                     ["id", "candidate_name", "scheduled_date"]),
        ["id", "candidate_name", "scheduled_date"], "They look upcoming in dashboards and trigger 'evaluation due' notices.",
        "Mark them completed or cancelled.", "info")
    if "ats_scorecards" in existing:
        left = await db["ats_scorecards"].count_documents({"migrated_to": {"$exists": False}})
        if left:
            gaps["scorecards_left_for_review"] = {"count": left, "level": "fix", "why": "Legacy scorecards with no single matching interview.",
                                                  "fix": "See the scorecard step above; move them by hand or leave them."}

    # Skills
    cands = {c["id"] for c in await find("candidates", {"merged_into": None}, ["id"])}
    with_skills = {s["candidate_id"] for s in await find("candidate_skills", {}, ["candidate_id"])}
    add("candidates_without_skills", [{"id": i} for i in sorted(cands - with_skills)], ["id"],
        "Job match % shows '—' for them.", "Usually resumes with no skills section.", "info")
    add("candidates_without_email", await find("candidates", {"merged_into": None, "normalized_email": {"$in": [None, ""]}},
                                               ["id", "full_name", "company_id"]),
        ["full_name", "company_id"], "A later application from the same person can't be matched, so a duplicate is created.",
        "Candidate 360 → add the email.", "info")

    return {"companies": names, "gaps": gaps}


def _print_counts(title: str, rows: Dict[str, int], other: Optional[Dict[str, int]] = None):
    print(f"\n{title}")
    for name in sorted(set(rows) | set(other or {})):
        right = f"{(other or {}).get(name, 0):>8}" if other is not None else ""
        print(f"  {name:<32}{rows.get(name, 0):>8}{right}")


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source-url", required=True, help="development MongoDB (read only)")
    ap.add_argument("--source-db", required=True)
    ap.add_argument("--target-url", required=True, help="staging MongoDB (replaced)")
    ap.add_argument("--target-db", required=True)
    ap.add_argument("--apply", action="store_true", help="copy and migrate (default: report only, nothing written)")
    ap.add_argument("--replace", action="store_true", help="allowed to replace a target that already has data")
    ap.add_argument("--confirm-target", default="", help="must repeat --target-db when --apply is used")
    ap.add_argument("--allow-remote", action="store_true", help="allow non-local databases")
    ap.add_argument("--admin-email", default="", help="make this user the platform super admin")
    ap.add_argument("--skip", default=",".join(sorted(SKIP_BY_DEFAULT)), help="collections not to copy (comma separated)")
    ap.add_argument("--report", default="", help="save the gap report as JSON to this file")
    args = ap.parse_args()

    if (args.source_url, args.source_db) == (args.target_url, args.target_db):
        sys.exit("Source and target are the same database.")
    if not args.allow_remote and not (_is_local(args.source_url) and _is_local(args.target_url)):
        sys.exit("Refusing non-local databases without --allow-remote.")

    src_client = AsyncIOMotorClient(args.source_url, serverSelectionTimeoutMS=10000)
    dst_client = AsyncIOMotorClient(args.target_url, serverSelectionTimeoutMS=10000)
    src, dst = src_client[args.source_db], dst_client[args.target_db]
    try:
        src_counts, dst_counts = await _counts(src), await _counts(dst)
        _print_counts(f"Documents: source {args.source_db} | target {args.target_db} (now)", src_counts, dst_counts)
        if not src_counts:
            sys.exit("The source database is empty or unreachable.")

        no_company = {"company_id": {"$in": [None, ""]}}
        print("\nSource records with no company yet (the split step assigns them):")
        for coll in ("users", "resumes", "job_openings", "job_applications", "interviews"):
            if coll in src_counts:
                print(f"  {coll:<32}{await src[coll].count_documents(no_company):>8}")
        names = [c.get("name") async for c in src["companies"].find({}, {"name": 1})]
        print(f"  companies in the source: {', '.join(n or '?' for n in names) or 'none (all data goes to the default company)'}")

        if not args.apply:
            print("\nReport only: nothing was written. Add --apply --confirm-target <target db> (and --replace if the "
                  "target has data) to copy and migrate.")
            return 0
        if args.confirm_target != args.target_db:
            sys.exit("--apply needs --confirm-target with the target database name repeated.")
        if any(dst_counts.values()) and not args.replace:
            sys.exit("The target already has data. Back it up (mongodump), then add --replace.")

        skip = {s.strip() for s in args.skip.split(",") if s.strip()}
        print(f"\n1. Copying {args.source_db} → {args.target_db} (skipping {sorted(skip) or 'nothing'}) …")
        if args.replace:
            for name in await dst.list_collection_names():
                if not name.startswith("system."):
                    await dst[name].drop()
        copied = await copy_database(src, dst, skip)
        print(f"   {sum(copied.values())} documents in {len(copied)} collections")

        print("2. Splitting into companies …")
        print("  ", await split_companies(dst) or "nothing to change (already split)")

        print("   old job fields:", await normalise_jobs(dst) or "none")
        print("3. Super admin …")
        print("  ", await promote_admin(dst, args.admin_email))

        print("4. Candidates (Phase 6) …")
        from scripts.migrate_candidates import run_migration
        print("  ", await run_migration(dst, apply=True))

        print("5. Scorecards → evaluations (Phase 8) …")
        from app.services.scorecard_migration import migrate_all
        reports = await migrate_all(dst, apply=True)
        print("  ", [{k: (len(v) if isinstance(v, list) else v) for k, v in r.items()} for r in reports] or "none")

        print("6. Skills (Phase 9) …")
        print("  ", await recalculate_skills(dst) or "no candidates")

        print("7. Indexes …")
        from app.core.indexes import ensure_indexes
        print(f"   {await ensure_indexes(dst)} ensured")

        print("8. Gap report …")
        report = await gap_report(dst)
        per_company: Dict[str, Counter] = defaultdict(Counter)
        for coll in ("users", "job_openings", "job_applications", "resumes", "candidates", "interviews"):
            async for d in dst[coll].find({}, {"company_id": 1}):
                per_company[report["companies"].get(d.get("company_id"), d.get("company_id") or "(none)")][coll] += 1
        print("\n   Records per company:")
        for company, row in sorted(per_company.items()):
            print(f"   {company:<20} " + "  ".join(f"{k}={v}" for k, v in sorted(row.items())))
        print("\n   Gaps (FIX = a person must act before go-live; info = worth knowing):" if report["gaps"] else "\n   No gaps found.")
        for key, g in sorted(report["gaps"].items(), key=lambda kv: kv[1].get("level") != "fix"):
            print(f"   - [{'FIX' if g.get('level') == 'fix' else 'info'}] {key}: {g['count']}  ({g['why']})")
            print(f"       fix: {g['fix']}")
            for ex in (g.get("examples") or g.get("companies") or [])[:3]:
                print(f"       e.g. {ex}")
        if args.report:
            with open(args.report, "w") as f:
                json.dump({"copied": copied, **report, "per_company": {k: dict(v) for k, v in per_company.items()}},
                          f, indent=1, default=str)
            print(f"\n   Saved: {args.report}")
        print("\nDone. Restart the staging backend so it runs its start-up checks: pm2 restart python-staging-app")
        return 0
    finally:
        src_client.close()
        dst_client.close()


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(main()))
    except SystemExit:
        raise
    except BaseException:  # the app's logging setup can swallow tracebacks; always show what failed
        import traceback

        traceback.print_exc()
        sys.stderr.write("\nStopped with an error. The target may be half migrated: restore the backup, or fix and run again.\n")
        raise SystemExit(1)
