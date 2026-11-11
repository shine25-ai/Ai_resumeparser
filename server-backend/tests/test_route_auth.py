"""
Every interview and resume endpoint must require a logged-in user.

These routes used to accept requests with no token and treat them as the first
user in the database (usually the admin), so anyone could read interviews,
send interview emails or cancel interviews.
"""

from fastapi.routing import APIRoute

from app.core.dependencies import get_current_active_user
from app.routes import interview, resume


def _calls(dependant):
    """All dependency functions a route depends on, at any depth."""
    for dep in dependant.dependencies:
        yield dep.call
        yield from _calls(dep)


def _routes(router):
    return [route for route in router.routes if isinstance(route, APIRoute)]


def test_every_interview_route_requires_login():
    routes = _routes(interview.router)
    assert routes, "no interview routes found"
    missing = [f"{sorted(r.methods)} {r.path}" for r in routes if get_current_active_user not in _calls(r.dependant)]
    assert missing == []


def test_every_resume_route_requires_login():
    routes = _routes(resume.router)
    assert routes, "no resume routes found"
    missing = [f"{sorted(r.methods)} {r.path}" for r in routes if get_current_active_user not in _calls(r.dependant)]
    assert missing == []


def test_settings_templates_and_transcription_require_login():
    from app.routes import resume_templates, settings as settings_routes, templates, transcription

    for router in (settings_routes.router, templates.router, transcription.router, resume_templates.router):
        routes = _routes(router)
        assert routes, f"no routes found for {router.prefix}"
        missing = [f"{sorted(r.methods)} {r.path}" for r in routes if get_current_active_user not in _calls(r.dependant)]
        assert missing == [], router.prefix
