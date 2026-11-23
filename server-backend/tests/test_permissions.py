"""
Permission matrix: module:action permissions, old page names, default roles and the API check.
"""

import pytest
from fastapi import FastAPI, APIRouter, Depends
from httpx import ASGITransport, AsyncClient

from app.core import dependencies
from app.core.config import settings
from app.core.exceptions import AuthorizationError
from app.core.permissions import (
    ALL_PERMISSIONS,
    DEFAULT_ROLE_PERMISSIONS,
    DEFAULT_ROLES_INFO,
    clean_permissions,
    expand_permissions,
    matrix_payload,
)


def test_old_page_permissions_keep_their_access():
    perms = expand_permissions(["database"])
    assert "candidates:view" in perms and "jobs:publish" in perms and "pipeline:edit" in perms
    assert "database" in perms
    assert "settings:edit" not in perms


def test_module_permissions_open_the_matching_pages():
    perms = expand_permissions(["candidates:view", "interviews:view", "reports:view"])
    assert {"database", "interviews", "analytics"} <= set(perms)
    assert "settings" not in perms


def test_unknown_permissions_are_dropped():
    assert expand_permissions(["nonsense", "jobs:fly", ""]) == []
    assert clean_permissions(["jobs:view", "nope", "database", "jobs:view"]) == ["database", "jobs:view"]


def test_seven_default_roles_and_their_limits():
    assert [slug for slug, _, _ in DEFAULT_ROLES_INFO] == [
        "admin", "hr_admin", "recruiter", "hiring_manager", "interviewer", "hr_user", "viewer",
    ]
    assert set(DEFAULT_ROLE_PERMISSIONS["admin"]) == set(ALL_PERMISSIONS)
    assert "roles:edit" not in DEFAULT_ROLE_PERMISSIONS["hr_admin"]
    assert "evaluations:create" in DEFAULT_ROLE_PERMISSIONS["interviewer"]
    assert "jobs:create" not in DEFAULT_ROLE_PERMISSIONS["interviewer"]
    assert all(p.endswith(":view") for p in DEFAULT_ROLE_PERMISSIONS["viewer"])
    for perms in DEFAULT_ROLE_PERMISSIONS.values():
        assert set(perms) <= set(ALL_PERMISSIONS)


def test_matrix_payload_lists_modules_and_roles():
    data = matrix_payload()
    assert any(m["id"] == "jobs" and "publish" in m["actions"] for m in data["modules"])
    assert len(data["default_roles"]) == 7


def test_can_lets_admins_do_anything():
    assert dependencies.can({"role": "admin", "permissions": []}, "roles:delete")
    assert dependencies.can({"role": "superadmin"}, "jobs:approve")
    assert not dependencies.can({"role": "viewer", "permissions": ["jobs:view"]}, "jobs:edit")


def _app(user: dict) -> FastAPI:
    app = FastAPI()
    router = APIRouter(
        prefix="/x",
        dependencies=[Depends(dependencies.require_access("jobs", {("POST", "/x/search"): "jobs:view"}))],
    )

    @router.get("")
    async def list_():
        return {"ok": True}

    @router.post("")
    async def create():
        return {"ok": True}

    @router.post("/search")
    async def search():
        return {"ok": True}

    app.include_router(router)
    app.dependency_overrides[dependencies.get_current_active_user] = lambda: user

    @app.exception_handler(AuthorizationError)
    async def _forbidden(request, exc):
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=403, content={"detail": str(exc)})

    return app


@pytest.mark.asyncio
async def test_enforce_mode_refuses_missing_permission(monkeypatch):
    monkeypatch.setattr(settings, "PERMISSIONS_MODE", "enforce")
    viewer = {"id": "u1", "role": "viewer", "permissions": expand_permissions(["jobs:view"])}
    async with AsyncClient(transport=ASGITransport(app=_app(viewer)), base_url="http://t") as c:
        assert (await c.get("/x")).status_code == 200
        assert (await c.post("/x/search")).status_code == 200  # override: a search only needs view
        assert (await c.post("/x")).status_code == 403


@pytest.mark.asyncio
async def test_warn_mode_lets_the_request_through(monkeypatch):
    monkeypatch.setattr(settings, "PERMISSIONS_MODE", "warn")
    viewer = {"id": "u1", "role": "viewer", "permissions": ["jobs:view"]}
    async with AsyncClient(transport=ASGITransport(app=_app(viewer)), base_url="http://t") as c:
        assert (await c.post("/x")).status_code == 200


@pytest.mark.asyncio
async def test_company_admin_is_never_refused(monkeypatch):
    monkeypatch.setattr(settings, "PERMISSIONS_MODE", "enforce")
    admin = {"id": "a1", "role": "admin", "permissions": []}
    async with AsyncClient(transport=ASGITransport(app=_app(admin)), base_url="http://t") as c:
        assert (await c.post("/x")).status_code == 200
