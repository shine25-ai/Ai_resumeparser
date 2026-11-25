"""
Phase 12 performance check: times every list/report endpoint (and the main detail pages) as one company's
admin against a LOCAL database seeded by scripts/perf_seed.py. Prints the slowest routes and saves JSON.

    python -m scripts.perf_measure --db hirelogics_perf --out before.json
    python -m scripts.perf_measure --db hirelogics_perf --indexes --out after.json   # creates app indexes first

Uses the real app (all middleware, permissions and company scope) through an in-process client.
"""

import argparse
import asyncio
import json
import statistics
import sys
import time
from datetime import timedelta

from httpx import ASGITransport, AsyncClient
from motor.motor_asyncio import AsyncIOMotorClient

COMPANY = "perf-co-025"
DETAIL_ROUTES = [
    "/api/v1/candidates/{c}", "/api/v1/applications/{a}", "/api/v1/job-openings/{j}",
    "/api/v1/pipeline/kanban", "/api/v1/pipeline/kanban?job_id={j}", "/api/v1/candidates?search=Candidate%2019",
    "/api/v1/applications?q=cand19", "/api/v1/resumes?search=Java", "/api/v1/skills/candidate/{c}",
]


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="mongodb://localhost:27017")
    ap.add_argument("--db", default="hirelogics_perf")
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--indexes", action="store_true", help="create the app's indexes before measuring")
    ap.add_argument("--out", default="")
    args = ap.parse_args()
    if not any(h in args.url for h in ("localhost", "127.0.0.1", "[::1]")):
        sys.exit("perf_measure only runs against a local MongoDB.")

    from app.core.config import settings
    from app.core.database import db_manager
    from app.core.security import create_access_token
    from app.main import app
    from tests.phase12_harness import api_routes, path_params

    settings.RATE_LIMITS_ENABLED = False
    raw = AsyncIOMotorClient(args.url)[args.db]
    db_manager.db = raw
    if args.indexes:
        from app.core.indexes import ensure_indexes
        t = time.perf_counter()
        made = await ensure_indexes(raw)
        print(f"indexes: {made} ensured in {time.perf_counter() - t:.1f}s")

    token = create_access_token(f"{COMPANY}-u0", timedelta(hours=1))
    headers = {"Authorization": f"Bearer {token}"}
    urls = [p for m, p, _ in api_routes(app) if m == "GET" and not path_params(p) and "/public/" not in p
            and "/integration/" not in p and not p.endswith("/export")]
    urls += [u.format(c=f"{COMPANY}-c19", a=f"{COMPANY}-a18", j=f"{COMPANY}-j3") for u in DETAIL_ROUTES]

    results = {}
    async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://perf") as client:
        for url in urls:
            times, status = [], None
            for _ in range(args.runs):
                t = time.perf_counter()
                r = await client.get(url, headers=headers)
                times.append((time.perf_counter() - t) * 1000)
                status = r.status_code
            results[url] = {"ms": round(statistics.median(times), 1), "status": status}

    ok = {u: v for u, v in results.items() if v["status"] == 200}
    print(f"{len(ok)} of {len(results)} routes answered 200")
    for u, v in results.items():
        if v["status"] != 200:
            print(f"  {v['status']}  {u}")
    print("Slowest 20 (median of %d runs):" % args.runs)
    for u, v in sorted(ok.items(), key=lambda kv: -kv[1]["ms"])[:20]:
        print(f"  {v['ms']:8.1f} ms  {u}")
    if args.out:
        with open(args.out, "w") as f:
            json.dump(results, f, indent=1)


if __name__ == "__main__":
    asyncio.run(main())
