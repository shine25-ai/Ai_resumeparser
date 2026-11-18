"""Move a database from before company workspaces into per-company workspaces, and report what changed.

Runs the same steps as the backend does at startup (app.repositories.tenant_migration.migrate_to_companies),
plus the default admin -> super admin step, so it can be tried on a copy first.

  1. Companies get email domains from their users' work addresses (datapattern.ai -> DataPattern).
     Shinelogics keeps accepting any address.
  2. Users join the company of their email domain; everyone else joins Shinelogics (the default company).
  3. Resumes: staff uploads stay with Shinelogics; careers-page applicants go to the company of the opening
     they applied for. A resume that belongs to several companies is copied, one per company.
  4. Interviews, resume logs and meaning vectors follow their resume.
  5. Job openings and applications keep the company they already have.
  6. Settings (email, app), mail templates, interview types, skills and custom roles: every company gets its
     own copy of Shinelogics' configuration. The AI provider settings stay platform-wide.

Safe to run again: each step only touches documents with no company yet, or is guarded by a marker.

It refuses to touch anything except a local MongoDB unless --allow-remote is given.

  # 1. copy production to a local database
  mongodump --uri "$ATLAS_URL" --db resumeparser --out /tmp/rp_dump
  mongorestore --uri mongodb://localhost:27017 --nsFrom 'resumeparser.*' --nsTo 'rp_local.*' --drop /tmp/rp_dump
  # 2. migrate the local copy and read the report
  python scripts/migrate_tenancy.py --db rp_local
  # 3. on production (after a backup), the same script
  python scripts/migrate_tenancy.py --url "$ATLAS_URL" --db resumeparser --allow-remote
"""
import argparse
import asyncio
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

from app.core.bootstrap import bootstrap_default_roles  # noqa: E402
from app.repositories.tenant_migration import migrate_to_companies  # noqa: E402

COMPANY_COLLECTIONS = [
    "users", "resumes", "interviews", "resume_logs", "resume_embeddings", "job_openings", "job_applications",
    "settings", "mail_templates", "interview_types", "skills_evaluations", "roles", "careers_page_settings",
    "integration_api_keys", "integration_api_logs",
]


async def counts(db):
    names = {c["id"]: c["name"] async for c in db["companies"].find({}, {"id": 1, "name": 1})}
    existing = set(await db.list_collection_names())
    table = {}
    for coll in COMPANY_COLLECTIONS:
        if coll not in existing:
            continue
        row = Counter()
        async for doc in db[coll].find({}, {"company_id": 1}):
            cid = doc.get("company_id")
            row[names.get(cid, cid) if cid else "(none)"] += 1
        table[coll] = row
    return table, names


def print_table(title, table, names):
    cols = [*sorted(set(names.values())), "(none)"]
    print(f"\n{title}")
    print(f"{'collection':<22}" + "".join(f"{c[:14]:>15}" for c in cols))
    for coll, row in table.items():
        print(f"{coll:<22}" + "".join(f"{row.get(c, 0):>15}" for c in cols))


async def promote_default_admin(db, email):
    if not email:
        return None
    user = await db["users"].find_one({"email": email.strip().lower()})
    if not user:
        return f"default admin {email} not found"
    await db["users"].update_one({"_id": user["_id"]}, {"$set": {"role": "superadmin", "company_id": user.get("company_id") or "default"}})
    return f"{email} is the super admin"


async def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", default="mongodb://localhost:27017")
    ap.add_argument("--db", required=True)
    ap.add_argument("--admin-email", default=os.getenv("DEFAULT_ADMIN_EMAIL", ""), help="becomes the super admin")
    ap.add_argument("--allow-remote", action="store_true", help="allow a non-local MongoDB (production)")
    args = ap.parse_args()

    local = any(h in args.url for h in ("localhost", "127.0.0.1"))
    if not local and not args.allow_remote:
        sys.exit("Refusing a non-local database. Take a backup, then add --allow-remote.")

    client = AsyncIOMotorClient(args.url, serverSelectionTimeoutMS=8000)
    db = client[args.db]
    before, names = await counts(db)
    print_table("BEFORE (documents per company)", before, names)

    await bootstrap_default_roles(db)  # adds the Super Admin role
    stats = await migrate_to_companies(db)
    admin = await promote_default_admin(db, args.admin_email)

    after, names = await counts(db)
    print_table("AFTER (documents per company)", after, names)
    print("\nSteps:", {k: v for k, v in stats.items() if v} or "nothing to do")
    if admin:
        print(admin)
    print("\nUsers:")
    async for u in db["users"].find({}, {"email": 1, "role": 1, "company_id": 1}).sort("company_id"):
        print(f"  {names.get(u.get('company_id'), u.get('company_id')):<14} {u.get('role'):<20} {u.get('email')}")
    print("\nCompany email domains:")
    async for c in db["companies"].find({}, {"name": 1, "email_domains": 1}):
        print(f"  {c['name']:<14} {c.get('email_domains') or '(any address)'}")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
