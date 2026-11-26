"""
Phase 12: company isolation, for EVERY API route (read from the app, so a new endpoint is covered as soon as
it exists). Company A's admin calls every route, with no IDs and with company B's IDs, against the real app
on an in-memory database that holds one document per company in every tenant collection.

1. No response to A ever contains B's data (B's documents carry the marker "ZZLEAKB").
2. Nothing A does changes B's data.
3. B's IDs answer exactly like IDs that don't exist: no "it exists but you can't see it" difference.
4. Every list, report and export answers A the same whether or not B has any data (counts don't leak).
5. No route fails on the seeded data, apart from the listed fake-database gaps, so the checks above really
   ran for each route. A new route that fails must be fixed or listed here with a reason.
"""

import re
from typing import Dict, List, Tuple

import pytest

from app.services.analytics_service import AnalyticsService
from app.services.dashboard_service import DashboardService
from tests.phase12_harness import (
    CO_B, MARK_B, Workspace, api_routes, b_documents, b_ids_for, fill, path_params,
)

# Routes the in-memory database can't run, checked on real MongoDB only:
# - integration usage runs an aggregation the fake doesn't implement;
# - templates inserts its default templates and reads back the "_id" MongoDB adds (the fake adds none).
FAKE_DB_GAPS = {
    ("GET", "/api/v1/settings/integration"),
    ("GET", "/api/v1/settings/integration/usage"),
    ("GET", "/api/v1/templates"),
}

BODY = {"POST", "PUT", "PATCH"}
VOLATILE = re.compile(
    r"\d{4}-\d{2}-\d{2}[T ][\d:.]+(?:[+-]\d{2}:\d{2}|Z)?"                        # timestamps
    r"|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"            # generated ids
    r'|"(?:took_ms|duration_ms|elapsed_ms|generated_at)":\s*[\d.]+'
    r"|Reference: [0-9a-f]{12}"                                                   # 500 error references
)


def _norm(text: str) -> str:
    return VOLATILE.sub("~", text)


def _admin(ws: Workspace) -> Dict[str, str]:
    return ws.token("co-a-admin")


def _requests(path: str) -> List[Dict[str, str]]:
    """No IDs for plain routes; otherwise each of B's IDs that fits the path's first parameter (others get B's too)."""
    params = path_params(path)
    if not params:
        return [{}]
    first = b_ids_for(params[0])
    return [{p: (v if p == params[0] else b_ids_for(p)[0]) for p in params} for v in first]


@pytest.mark.asyncio
async def test_inventory_covers_every_documented_operation():
    async with Workspace() as ws:
        routes = {(m, p) for m, p, _ in api_routes(ws.app)}
        documented = {(m.upper(), p) for p, item in ws.app.openapi()["paths"].items() for m in item
                      if p.startswith("/api/") and m.upper() not in ("HEAD", "OPTIONS")}
    assert documented <= routes
    assert len(routes) > 200


@pytest.mark.asyncio
async def test_company_a_never_sees_or_changes_company_b():
    leaks: List[Tuple[str, str, int]] = []
    changed: List[Tuple[str, str]] = []
    async with Workspace() as ws:
        headers = _admin(ws)
        before = b_documents(ws.raw)
        for method, path, _ in api_routes(ws.app):
            for values in _requests(path):
                url = fill(path, values)
                resp = await ws.client.request(method, url, headers=headers, json={} if method in BODY else None)
                if MARK_B in resp.text:
                    leaks.append((method, url, resp.status_code))
            now = b_documents(ws.raw)
            if now != before:
                changed.append((method, path))
                before = now
    assert leaks == [], "company A saw company B's data"
    assert changed == [], "company A changed company B's data"


@pytest.mark.asyncio
async def test_b_ids_answer_like_ids_that_do_not_exist():
    """Company B's IDs must look missing to company A: same status and same body as an ID nobody has."""
    different: List[str] = []
    async with Workspace() as ws:
        headers = _admin(ws)
        for method, path, _ in api_routes(ws.app):
            params = path_params(path)
            if method != "GET" or not params:
                continue
            for b_id in b_ids_for(params[0]):
                missing = b_id.replace(CO_B, "co-z", 1)   # same shape as B's ID, but nobody has it
                got_b = await ws.client.get(fill(path, {p: b_id for p in params}), headers=headers)
                got_none = await ws.client.get(fill(path, {p: missing for p in params}), headers=headers)
                a = (got_b.status_code, _norm(got_b.text.replace(b_id, "<id>")))
                b = (got_none.status_code, _norm(got_none.text.replace(missing, "<id>")))
                if a != b:
                    different.append(f"GET {path} with {b_id}: {a[0]} vs {b[0]}")
    assert different == []


async def _plain_get_responses(drop_company_b: bool) -> Dict[str, Tuple[int, str]]:
    DashboardService._cache.clear()
    AnalyticsService._cache.clear()
    async with Workspace() as ws:
        if drop_company_b:
            for coll in ws.raw.collections.values():
                coll.docs[:] = [d for d in coll.docs if d.get("company_id") != CO_B and d.get("id") != CO_B]
        headers = _admin(ws)
        out: Dict[str, Tuple[int, str]] = {}
        for method, path, _ in api_routes(ws.app):
            if method == "GET" and not path_params(path):
                resp = await ws.client.get(path, headers=headers)
                out[path] = (resp.status_code, _norm(resp.text))
        return out


@pytest.mark.asyncio
async def test_lists_reports_and_exports_ignore_company_b():
    """Counts, totals and charts must not move when another company adds data."""
    with_b = await _plain_get_responses(drop_company_b=False)
    without_b = await _plain_get_responses(drop_company_b=True)
    compared = [p for p, (code, _) in with_b.items() if code == 200]
    assert len(compared) > 60
    assert [p for p in with_b if with_b[p] != without_b[p]] == []


@pytest.mark.asyncio
async def test_every_route_runs_on_the_seeded_data():
    """A 500 means the checks above didn't really run for that route."""
    failing: List[str] = []
    async with Workspace() as ws:
        headers = _admin(ws)
        for method, path, _ in api_routes(ws.app):
            if method != "GET" or path_params(path) or (method, path) in FAKE_DB_GAPS:
                continue
            resp = await ws.client.get(path, headers=headers)
            if resp.status_code >= 500:
                failing.append(f"{method} {path}: {resp.text[:160]}")
    assert failing == []
