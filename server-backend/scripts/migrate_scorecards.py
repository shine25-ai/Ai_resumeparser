"""Move legacy ATS scorecards into interview evaluations, and report what could not be moved.

A scorecard moves only when exactly one live interview matches its candidate and role. Everything else is
listed for review and stays where it is. The old scorecard keeps a "migrated_to" pointer, so nothing is deleted.

Dry run by default: it prints the plan and writes nothing.

  # 1. try it on a local copy first
  python scripts/migrate_scorecards.py --db rp_local
  # 2. apply it locally
  python scripts/migrate_scorecards.py --db rp_local --apply
  # 3. production, after a backup
  python scripts/migrate_scorecards.py --url "$ATLAS_URL" --db resumeparser --apply --allow-remote

Safe to run again: scorecards already migrated are skipped, and evaluation ids are fixed, so nothing duplicates.
It refuses to touch anything except a local MongoDB unless --allow-remote is given.
"""

import argparse
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

from app.services.scorecard_migration import migrate_all  # noqa: E402

LOCAL_HOSTS = ("localhost", "127.0.0.1", "[::1]", "mongodb://localhost", "mongodb://127.0.0.1")


def _is_local(url: str) -> bool:
    return any(host in url for host in LOCAL_HOSTS)


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", default=os.environ.get("MONGODB_URL", "mongodb://localhost:27017"))
    parser.add_argument("--db", default=os.environ.get("MONGODB_DB_NAME", "resumeparser"))
    parser.add_argument("--apply", action="store_true", help="write the changes (default: dry run)")
    parser.add_argument("--allow-remote", action="store_true", help="allow a non-local MongoDB")
    args = parser.parse_args()

    if not _is_local(args.url) and not args.allow_remote:
        print("Refusing to run against a non-local database without --allow-remote.", file=sys.stderr)
        return 2

    client = AsyncIOMotorClient(args.url)
    try:
        reports = await migrate_all(client[args.db], apply=args.apply)
    finally:
        client.close()

    print(json.dumps(reports, indent=2, default=str))
    total = sum(r["to_migrate"] for r in reports)
    review = sum(len(r["unmatched"]) + len(r["ambiguous"]) for r in reports)
    mode = "applied" if args.apply else "dry run, nothing written"
    print(f"\n{mode}: {total} scorecard(s) to migrate, {review} to review by hand.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
