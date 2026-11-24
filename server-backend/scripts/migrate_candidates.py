"""
Migration script for Phase 6 (Candidate Management):
Splits resumes into `candidates` and `candidate_documents`, and links `job_applications`.

Features:
- --dry-run (default): reports counts that would be created/updated without changing data
- --apply: writes changes to MongoDB
- Deduplicates resumes per company by normalized email -> normalized phone -> name+phone
- Creates candidate_documents for each resume file
- Sets candidate_id on all job_applications
- Safe and idempotent: can be run repeatedly without duplicating candidates or documents
"""

import argparse
import asyncio
import os
import re
import sys
from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional, Tuple

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient

from app.models.candidate import (
    CandidateDocument,
    CandidateFileDocument,
    normalize_email,
    normalize_phone,
)
from app.utils.constants import (
    CANDIDATE_DOCUMENTS_COLLECTION,
    CANDIDATES_COLLECTION,
    COMPANIES_COLLECTION, 
    JOB_APPLICATIONS_COLLECTION,
    RESUMES_COLLECTION,
)
from app.utils.helpers import generate_uuid, utc_now


def _dedupe_key(doc: Dict[str, Any]) -> str:
    pd = doc.get("parsed_data") or {}
    email = normalize_email(pd.get("email") or doc.get("applicant_email") or doc.get("uploaded_by_email"))
    if email:
        return f"email:{email}"

    phone = normalize_phone(pd.get("phone"))
    if phone and len(phone) >= 7:
        return f"phone:{phone}"

    name = str(pd.get("full_name") or pd.get("name") or doc.get("original_filename") or "unknown").strip().lower()
    return f"name_phone:{name}_{phone}"


async def collect_counts(db) -> Tuple[Dict[str, Counter], Dict[str, str]]:
    names = {c["id"]: c.get("name", c["id"]) async for c in db[COMPANIES_COLLECTION].find({}, {"id": 1, "name": 1})}
    collections = [RESUMES_COLLECTION, CANDIDATES_COLLECTION, CANDIDATE_DOCUMENTS_COLLECTION, JOB_APPLICATIONS_COLLECTION]
    existing = set(await db.list_collection_names())
    table: Dict[str, Counter] = {}

    for coll in collections:
        if coll not in existing:
            table[coll] = Counter()
            continue
        row = Counter()
        filter_q = {}
        if coll == JOB_APPLICATIONS_COLLECTION:
            filter_q = {"candidate_id": {"$exists": True, "$ne": None}}
        async for doc in db[coll].find(filter_q, {"company_id": 1}):
            cid = doc.get("company_id") or "default"
            row[names.get(cid, cid)] += 1
        table[coll if coll != JOB_APPLICATIONS_COLLECTION else "linked_applications"] = row

    return table, names


def print_table(title: str, table: Dict[str, Counter], names: Dict[str, str]):
    cols = [*sorted(set(names.values())), "(none)"]
    print(f"\n{title}")
    print(f"{'collection':<24}" + "".join(f"{c[:15]:>16}" for c in cols))
    print("-" * (24 + 16 * len(cols)))
    for coll, row in table.items():
        print(f"{coll:<24}" + "".join(f"{row.get(c, 0):>16}" for c in cols))
    print()


async def run_migration(db, apply: bool = False) -> Dict[str, int]:
    now = utc_now().isoformat()
    stats = {
        "candidates_created": 0,
        "candidate_documents_created": 0,
        "applications_linked": 0,
        "resumes_processed": 0,
    }

    # Fetch all resumes
    resumes = await db[RESUMES_COLLECTION].find({}, {"_id": 0}).to_list(length=50000)
    stats["resumes_processed"] = len(resumes)

    # Group by company_id -> dedupe_key -> list of resumes
    by_company: Dict[str, Dict[str, List[Dict[str, Any]]]] = defaultdict(lambda: defaultdict(list))
    for r in resumes:
        cid = r.get("company_id") or "default"
        key = _dedupe_key(r)
        by_company[cid][key].append(r)

    for cid, clusters in by_company.items():
        for key, r_list in clusters.items():
            # Sort resumes by upload_date descending (newest first)
            r_list.sort(key=lambda x: str(x.get("upload_date") or x.get("created_at") or ""), reverse=True)
            primary_r = r_list[0]
            pd = primary_r.get("parsed_data") or {}

            email = pd.get("email") or primary_r.get("applicant_email") or primary_r.get("uploaded_by_email") or ""
            phone = pd.get("phone") or ""
            norm_em = normalize_email(email)
            norm_ph = normalize_phone(phone)

            # Check if candidate already exists in this company
            existing_candidate = None
            if norm_em:
                existing_candidate = await db[CANDIDATES_COLLECTION].find_one({"company_id": cid, "normalized_email": norm_em})
            if not existing_candidate and norm_ph and len(norm_ph) >= 7:
                existing_candidate = await db[CANDIDATES_COLLECTION].find_one({"company_id": cid, "normalized_phone": norm_ph})

            if existing_candidate:
                candidate_id = existing_candidate["id"]
            else:
                candidate_id = generate_uuid()
                stats["candidates_created"] += 1
                if apply:
                    # Gather combined skills, tags, notes from all resumes in cluster
                    skills = []
                    tags = []
                    notes = []
                    for r in r_list:
                        r_pd = r.get("parsed_data") or {}
                        skills.extend(r_pd.get("primary_skills") or [])
                        tags.extend(r.get("tags") or [])
                        notes.extend(r.get("notes") or [])
                    skills = list(dict.fromkeys(s for s in skills if s))
                    tags = list(dict.fromkeys(t for t in tags if t))

                    cand = CandidateDocument(
                        id=candidate_id,
                        company_id=cid,
                        full_name=pd.get("full_name") or pd.get("name") or primary_r.get("candidate_name") or "Candidate",
                        email=email,
                        normalized_email=norm_em,
                        emails=[email] if email else [],
                        phone=phone,
                        normalized_phone=norm_ph,
                        phones=[phone] if phone else [],
                        location=pd.get("location", ""),
                        linkedin=pd.get("linkedin", ""),
                        portfolio=pd.get("portfolio", ""),
                        total_experience_years=pd.get("total_experience_years"),
                        current_role=pd.get("current_role") or primary_r.get("job_title", ""),
                        skills=skills,
                        tags=tags,
                        source=primary_r.get("resume_source") or "Careers page",
                        status="active",
                        created_at=str(primary_r.get("upload_date") or now),
                        updated_at=now,
                    )
                    cand_dict = cand.to_dict()
                    cand_dict["notes"] = notes
                    await db[CANDIDATES_COLLECTION].insert_one(cand_dict)

            # Process candidate documents for each resume in cluster
            for r in r_list:
                rid = r.get("id")
                if not rid:
                    continue

                existing_doc = await db[CANDIDATE_DOCUMENTS_COLLECTION].find_one({"id": rid})
                if not existing_doc:
                    stats["candidate_documents_created"] += 1
                    if apply:
                        doc_record = CandidateFileDocument(
                            id=rid,
                            company_id=cid,
                            candidate_id=candidate_id,
                            original_filename=r.get("original_filename") or r.get("filename", "resume.pdf"),
                            filename=r.get("filename", "resume.pdf"),
                            file_path=r.get("file_path", ""),
                            s3_url=r.get("s3_url"),
                            file_hash=r.get("file_hash"),
                            extracted_text=r.get("extracted_text"),
                            parsed_data=r.get("parsed_data") or {},
                            ai_evaluation=r.get("ai_evaluation") or {},
                            confidence=r.get("confidence") or {},
                            status=r.get("status", "PARSED"),
                            uploaded_by=r.get("uploaded_by_email") or r.get("user_id"),
                            upload_date=str(r.get("upload_date") or now),
                            created_at=str(r.get("upload_date") or now),
                            updated_at=now,
                        )
                        await db[CANDIDATE_DOCUMENTS_COLLECTION].insert_one(doc_record.to_dict())

                # Link applications
                unlinked = await db[JOB_APPLICATIONS_COLLECTION].count_documents({
                    "$or": [{"resume_id": rid}, {"applicant_email": email}],
                    "candidate_id": {"$in": [None, ""]},
                })
                if unlinked > 0:
                    stats["applications_linked"] += unlinked
                    if apply:
                        await db[JOB_APPLICATIONS_COLLECTION].update_many(
                            {"$or": [{"resume_id": rid}, {"applicant_email": email}]},
                            {"$set": {"candidate_id": candidate_id}},
                        )

                # Also ensure resume has candidate_id
                if apply and not r.get("candidate_id"):
                    await db[RESUMES_COLLECTION].update_one({"id": rid}, {"$set": {"candidate_id": candidate_id}})

    return stats


async def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", default="mongodb://localhost:27017")
    ap.add_argument("--db", default="resumeparser")
    ap.add_argument("--apply", action="store_true", help="write changes to DB (default is dry-run)")
    ap.add_argument("--dry-run", action="store_true", help="dry-run only (default)")
    ap.add_argument("--allow-remote", action="store_true", help="allow running on non-localhost MongoDB")
    args = ap.parse_args()

    local = any(h in args.url for h in ("localhost", "127.0.0.1"))
    if not local and not args.allow_remote:
        sys.exit("Refusing non-local database without --allow-remote.")

    is_apply = args.apply and not args.dry_run

    client = AsyncIOMotorClient(args.url, serverSelectionTimeoutMS=8000)
    db = client[args.db]

    before, names = await collect_counts(db)
    print_table("BEFORE (documents per company)", before, names)

    mode_label = "APPLY" if is_apply else "DRY-RUN (No changes saved)"
    print(f"Running candidate migration in mode: {mode_label}...")

    stats = await run_migration(db, apply=is_apply)
    print(f"\nMigration results:")
    print(f"  Resumes processed:            {stats['resumes_processed']}")
    print(f"  Candidates created:           {stats['candidates_created']}")
    print(f"  Candidate documents created:  {stats['candidate_documents_created']}")
    print(f"  Applications linked:          {stats['applications_linked']}")

    if is_apply:
        after, _ = await collect_counts(db)
        print_table("AFTER (documents per company)", after, names)
    else:
        print("\nDry run completed. To write changes to the database, run with --apply.")


if __name__ == "__main__":
    asyncio.run(main())

