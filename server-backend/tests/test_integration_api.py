"""
Tests for the API-key protected integration API and its Settings management endpoints.
"""

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from app.core.api_key import get_integration_service
from app.core.dependencies import get_current_active_user
from app.main import app
from app.middleware import integration_logger
from app.routes.integration import get_candidate_interview_service, get_resume_service
from app.services.candidate_interview_service import CandidateInterviewService
from app.services.integration_service import IntegrationService, endpoint_label, hash_api_key

RESUME = {
    "id": "resume-1",
    "candidate_id": "CND0001",
    "user_id": "integration:key-1",
    "filename": "resume-1_cv.pdf",
    "original_filename": "cv.pdf",
    "file_path": "/tmp/cv.pdf",
    "s3_url": "https://bucket.example/cv.pdf",
    "extracted_text": "John Doe, Python developer",
    "upload_date": "2026-10-22T00:00:00+00:00",
    "status": "PARSED",
    "parsed_data": {"full_name": "John Doe", "email": "john@example.com"},
    "ai_evaluation": {"overall_score": 82},
}


class FakeIntegrationRepo:
    """In-memory stand-in for IntegrationRepository."""

    def __init__(self):
        self.enabled = True
        self.share_results = True
        self.keys = {}
        self.logs = []

    async def is_enabled(self):
        return self.enabled

    async def shares_interview_results(self):
        return self.share_results

    async def set_share_interview_results(self, share):
        self.share_results = share
        return share

    async def set_enabled(self, enabled):
        self.enabled = enabled
        return enabled

    async def create_key(self, doc):
        self.keys[doc["id"]] = dict(doc)
        return doc

    async def list_keys(self):
        return [{k: v for k, v in d.items() if k != "key_hash"} for d in self.keys.values()]

    async def get_key(self, key_id):
        d = self.keys.get(key_id)
        return {k: v for k, v in d.items() if k != "key_hash"} if d else None

    async def find_by_hash(self, key_hash):
        return next((dict(d) for d in self.keys.values() if d["key_hash"] == key_hash), None)

    async def update_key(self, key_id, fields):
        self.keys[key_id].update(fields)
        return await self.get_key(key_id)

    async def delete_key(self, key_id):
        return self.keys.pop(key_id, None) is not None

    async def touch_key(self, key_id, when):
        self.keys[key_id]["last_used_at"] = when
        self.keys[key_id]["request_count"] += 1

    async def insert_log(self, doc):
        self.logs.append(doc)

    async def find_logs(self, query, skip, limit):
        return self.logs[::-1][skip: skip + limit]

    async def count_logs(self, query):
        return len(self.logs)

    async def aggregate_logs(self, pipeline):
        return []

    async def resume_statuses(self, resume_ids):
        return {}


class FakeResumeRepo:
    def __init__(self, resumes, aliases=None):
        self.resumes = {r["id"]: r for r in resumes}
        self.aliases = aliases or {}  # upload id -> merged profile id

    async def get_by_id(self, id_val):
        return self.resumes.get(self.aliases.get(id_val, id_val))

    async def find_one(self, query):
        return next((r for r in self.resumes.values() if r.get("candidate_id") == query.get("candidate_id")), None)

    async def find_by_email(self, email, **_):
        return next((r for r in self.resumes.values() if r["parsed_data"].get("email") == email), None)


class FakeResumeService:
    def __init__(self, repo):
        self.resume_repo = repo

    async def enrich_resumes_with_interviews(self, resumes):
        for r in resumes:
            interview = {"id": "inv-1", "status": "SCHEDULED", "job_title": "Backend Dev", "meeting_link": "secret"}
            r.setdefault("interview_assigned", True)
            r.setdefault("interview_status", "SCHEDULED")
            r.setdefault("latest_interview", interview)
            r.setdefault("interviews", [interview])
        return resumes


INTERVIEWS = [
    {   # round 1: done, candidate cleared it
        "id": "inv-1", "candidate_id": "resume-1", "resume_id": "resume-1", "round_number": 1,
        "interview_type": "SNOWFLAKE", "job_title": "Data Engineer", "status": "COMPLETED",
        "scheduled_date": "2026-09-01", "scheduled_time": "10:00", "timezone": "Asia/Kolkata",
        "meeting_link": "https://meet.example/old", "interviewer_name": "Asha", "interviewer_email": "asha@corp.example",
        "rating": 4.5, "feedback": "Strong SQL", "recommendation": "Shortlisted", "final_fit_salary": "20 LPA",
        "interviewers": [{"interviewer_name": "Asha", "interviewer_email": "asha@corp.example", "rating": 4.5}],
    },
    {   # round 2: upcoming, was moved once
        "id": "inv-2", "candidate_id": "resume-1", "resume_id": "resume-1", "round_number": 2,
        "interview_type": "HR", "job_title": "Data Engineer", "status": "RESCHEDULED",
        "scheduled_date": "2099-01-15", "scheduled_time": "15:30", "timezone": "Asia/Kolkata", "duration_minutes": 45,
        "meeting_link": "https://meet.example/next", "meeting_platform": "Google Meet", "interviewer_name": "Ravi",
        "reschedule_history": [{"previous_date": "2099-01-10", "previous_time": "11:00"}],
    },
]


class FakeCandidateInterviewService(CandidateInterviewService):
    def __init__(self, interviews):
        self.raw = interviews

    async def _type_names(self):
        return {"SNOWFLAKE": "Snowflake"}

    async def _interviews_for(self, resume):
        return [dict(i) for i in self.raw if i["resume_id"] == resume["id"]]


ADMIN = {"id": "admin-1", "full_name": "Admin", "email": "admin@example.com", "role": "admin", "permissions": []}


@pytest_asyncio.fixture
async def async_client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        yield client


@pytest.fixture
def repo(monkeypatch):
    fake = FakeIntegrationRepo()
    app.dependency_overrides[get_integration_service] = lambda: IntegrationService(fake)
    app.dependency_overrides[get_candidate_interview_service] = lambda: FakeCandidateInterviewService(INTERVIEWS)
    app.dependency_overrides[get_resume_service] = lambda: FakeResumeService(
        FakeResumeRepo([dict(RESUME)], aliases={"upload-2": "resume-1"})
    )
    # The logging middleware builds its own repository; point it at the fake one.
    monkeypatch.setattr(integration_logger, "IntegrationRepository", lambda db: fake)
    monkeypatch.setattr(integration_logger.db_manager, "get_db", lambda: None)
    yield fake
    app.dependency_overrides.clear()


@pytest.fixture
def as_user():
    def _set(user):
        app.dependency_overrides[get_current_active_user] = lambda: user
    _set(ADMIN)
    return _set


@pytest_asyncio.fixture
async def api_key(async_client, repo, as_user):
    res = await async_client.post("/api/v1/settings/integration/keys", json={"name": "HRMS"})
    assert res.status_code == 201
    return res.json()["data"]


def headers(key):
    return {"X-API-Key": key["api_key"]}


# ── Key management ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_created_key_is_stored_hashed_and_shown_once(async_client, repo, api_key):
    stored = repo.keys[api_key["id"]]
    assert api_key["api_key"].startswith("rp_live_")
    assert stored["key_hash"] == hash_api_key(api_key["api_key"])
    assert api_key["api_key"] not in str(stored.values())

    res = await async_client.get("/api/v1/settings/integration/keys")
    listed = res.json()["data"]["keys"][0]
    assert "api_key" not in listed and "key_hash" not in listed
    assert listed["key_hint"] == api_key["api_key"][:12]


@pytest.mark.asyncio
async def test_non_admin_cannot_manage_keys(async_client, repo, as_user):
    as_user({"id": "u1", "role": "recruiter", "permissions": ["upload"]})
    res = await async_client.get("/api/v1/settings/integration/keys")
    assert res.status_code == 403

    as_user({"id": "u2", "role": "hr_manager", "permissions": ["settings"]})
    res = await async_client.get("/api/v1/settings/integration/keys")
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_disabled_key_and_regenerate_and_delete(async_client, repo, api_key):
    key_url = f"/api/v1/settings/integration/keys/{api_key['id']}"

    await async_client.patch(key_url, json={"is_active": False})
    res = await async_client.get("/api/v1/integration/resumes/resume-1/status", headers=headers(api_key))
    assert res.status_code == 403
    await async_client.patch(key_url, json={"is_active": True})

    res = await async_client.post(f"{key_url}/regenerate")
    new_key = res.json()["data"]
    assert new_key["api_key"] != api_key["api_key"]
    old = await async_client.get("/api/v1/integration/resumes/resume-1/status", headers=headers(api_key))
    new = await async_client.get("/api/v1/integration/resumes/resume-1/status", headers=headers(new_key))
    assert (old.status_code, new.status_code) == (401, 200)

    await async_client.delete(key_url)
    res = await async_client.get("/api/v1/integration/resumes/resume-1/status", headers=headers(new_key))
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_global_switch_turns_api_off(async_client, repo, api_key):
    await async_client.put("/api/v1/settings/integration/status", json={"enabled": False})
    res = await async_client.get("/api/v1/integration/resumes/resume-1/status", headers=headers(api_key))
    assert res.status_code == 503

    res = await async_client.get("/api/v1/settings/integration")
    assert res.json()["data"]["enabled"] is False


# ── Logging and usage counters ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_requests_are_logged_with_key_and_resume(async_client, repo, api_key):
    await async_client.get("/api/v1/integration/resumes/resume-1/status", headers=headers(api_key))
    await async_client.get("/api/v1/integration/resumes/nope", headers=headers(api_key))
    await async_client.get("/api/v1/integration/resumes/resume-1", headers={"X-API-Key": "rp_live_wrongkey"})

    ok, missing, bad_key = repo.logs
    assert (ok["status_code"], ok["endpoint"], ok["key_name"], ok["resume_id"]) == (200, "status", "HRMS", "resume-1")
    assert (missing["status_code"], missing["error_message"]) == (404, "Resume not found.")
    assert (bad_key["status_code"], bad_key["key_id"], bad_key["key_hint"]) == (401, None, "rp_live_wron")
    assert repo.keys[api_key["id"]]["request_count"] == 2

    res = await async_client.get("/api/v1/settings/integration/logs")
    assert res.json()["data"]["total"] == 3


def test_endpoint_label():
    assert endpoint_label("POST", "/api/v1/integration/resumes") == "upload"
    assert endpoint_label("GET", "/api/v1/integration/resumes/lookup") == "lookup"
    assert endpoint_label("GET", "/api/v1/integration/resumes/abc/status") == "status"
    assert endpoint_label("GET", "/api/v1/integration/resumes/abc") == "profile"
    assert endpoint_label("GET", "/api/v1/integration/resumes/abc/interviews") == "interviews"
    assert endpoint_label("GET", "/api/v1/integration/resumes/abc/interviews/inv-1") == "interviews"
    assert endpoint_label("GET", "/api/v1/integration/interviews/lookup") == "interviews"


# ── Integration API responses ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_missing_key_rejected(async_client, repo):
    res = await async_client.get("/api/v1/integration/resumes/resume-1/status")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_status(async_client, repo, api_key):
    res = await async_client.get("/api/v1/integration/resumes/resume-1/status", headers=headers(api_key))
    data = res.json()["data"]
    assert data["parsing_status"] == "PARSED"
    assert data["is_parsed"] is True
    assert data["merged_into_existing_profile"] is False
    assert data["interview_status"] == "SCHEDULED"
    assert "meeting_link" not in data["latest_interview"]


@pytest.mark.asyncio
async def test_status_follows_merge_into_existing_profile(async_client, repo, api_key):
    res = await async_client.get("/api/v1/integration/resumes/upload-2/status", headers=headers(api_key))
    data = res.json()["data"]
    assert (data["resume_id"], data["requested_resume_id"], data["merged_into_existing_profile"]) == ("resume-1", "upload-2", True)


@pytest.mark.asyncio
async def test_profile_hides_internal_fields(async_client, repo, api_key):
    res = await async_client.get("/api/v1/integration/resumes/resume-1", headers=headers(api_key))
    data = res.json()["data"]
    assert data["parsed_data"]["full_name"] == "John Doe"
    assert data["resume_url"] == RESUME["s3_url"]
    assert "file_path" not in data and "extracted_text" not in data

    res = await async_client.get("/api/v1/integration/resumes/resume-1?include_text=true", headers=headers(api_key))
    assert res.json()["data"]["extracted_text"] == RESUME["extracted_text"]


@pytest.mark.asyncio
async def test_lookup(async_client, repo, api_key):
    res = await async_client.get("/api/v1/integration/resumes/lookup?email=john@example.com", headers=headers(api_key))
    assert res.json()["data"]["candidate_id"] == "CND0001"
    res = await async_client.get("/api/v1/integration/resumes/lookup?candidate_id=CND0001", headers=headers(api_key))
    assert res.json()["data"]["resume_id"] == "resume-1"
    res = await async_client.get("/api/v1/integration/resumes/lookup", headers=headers(api_key))
    assert res.status_code == 400


# ── Candidate interviews ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_candidate_interviews_schedule_status_and_result(async_client, repo, api_key):
    res = await async_client.get("/api/v1/integration/resumes/resume-1/interviews", headers=headers(api_key))
    assert res.status_code == 200
    data = res.json()["data"]
    first, second = data["interviews"]

    assert data["candidate_name"] == "John Doe"
    assert data["overall"]["stage"] == "INTERVIEW_SCHEDULED"
    assert data["overall"]["next_interview"]["interview_id"] == "inv-2"
    assert (data["overall"]["total_rounds"], data["overall"]["completed_rounds"]) == (2, 1)

    # Finished round: plain result, type display name, no joining link any more.
    assert first["interview_type"] == "Snowflake"
    assert first["result"] == {"outcome": "NEXT_ROUND", "label": "Moved to next round"}
    assert first["meeting_link"] is None and first["is_upcoming"] is False

    # Upcoming round: joining details, reschedule info, no result yet.
    assert second["is_upcoming"] is True and second["status_label"] == "Rescheduled"
    assert second["meeting_link"] == "https://meet.example/next"
    assert second["scheduled_at"] == "2099-01-15T15:30:00+05:30"
    assert second["previous_schedule"] == {"date": "2099-01-10", "time": "11:00"}
    assert second["result"] is None


@pytest.mark.asyncio
async def test_candidate_interviews_never_leak_internal_fields(async_client, repo, api_key):
    res = await async_client.get("/api/v1/integration/resumes/resume-1/interviews", headers=headers(api_key))
    body = res.text
    for secret in ("asha@corp.example", "Strong SQL", "20 LPA", "4.5", "rating", "feedback", "salary"):
        assert secret not in body
    assert res.json()["data"]["interviews"][0]["interviewer_names"] == ["Asha"]


@pytest.mark.asyncio
async def test_results_hidden_when_sharing_turned_off(async_client, repo, api_key):
    res = await async_client.put("/api/v1/settings/integration/status", json={"share_interview_results": False})
    assert res.json()["data"]["share_interview_results"] is False
    assert res.json()["data"]["enabled"] is True  # untouched

    res = await async_client.get("/api/v1/integration/resumes/resume-1/interviews", headers=headers(api_key))
    data = res.json()["data"]
    assert data["results_shared"] is False
    assert all(r["result"] is None for r in data["interviews"])


@pytest.mark.asyncio
async def test_single_interview_and_lookup(async_client, repo, api_key):
    res = await async_client.get("/api/v1/integration/resumes/resume-1/interviews/inv-2", headers=headers(api_key))
    assert res.json()["data"]["interview"]["round_number"] == 2

    res = await async_client.get("/api/v1/integration/resumes/resume-1/interviews/nope", headers=headers(api_key))
    assert res.status_code == 404

    res = await async_client.get("/api/v1/integration/interviews/lookup?candidate_id=CND0001", headers=headers(api_key))
    assert len(res.json()["data"]["interviews"]) == 2
    assert repo.logs[-1]["endpoint"] == "interviews"
    assert repo.logs[-1]["resume_id"] == "resume-1"


def _round(status, recommendation=None, date="2026-01-01", client_recommendation=None):
    from app.services.candidate_interview_service import candidate_interview_view
    return candidate_interview_view(
        {"id": date, "status": status, "recommendation": recommendation, "client_recommendation": client_recommendation,
         "scheduled_date": date, "scheduled_time": "10:00"},
        {}, share_results=True,
    )


@pytest.mark.parametrize("recommendation, client, expected", [
    ("Selected", None, "SELECTED"),
    ("Rejected", None, "NOT_SELECTED"),
    ("Not Recommended", None, "NOT_SELECTED"),
    ("Hold", None, "ON_HOLD"),
    ("Need Further Evaluation", None, "PENDING"),
    ("Pending", "Selected", "SELECTED"),  # falls back to the client's decision
    (None, None, "PENDING"),
    ("Something new", None, "PENDING"),  # unknown internal values are not shown raw
])
def test_outcome_mapping(recommendation, client, expected):
    assert _round("COMPLETED", recommendation, client_recommendation=client)["result"]["outcome"] == expected


def test_overall_progress_stages():
    from app.services.candidate_interview_service import overall_progress
    assert overall_progress([], True)["stage"] == "NOT_SCHEDULED"
    assert overall_progress([_round("COMPLETED", "Shortlisted", "2026-01-01"), _round("COMPLETED", "Selected", "2026-02-01")], True)["stage"] == "SELECTED"
    assert overall_progress([_round("COMPLETED", "Rejected")], True)["stage"] == "NOT_SELECTED"
    assert overall_progress([_round("COMPLETED", "Shortlisted")], True)["stage"] == "NEXT_ROUND_PENDING"
    assert overall_progress([_round("COMPLETED", "Rejected")], False)["stage"] == "UNDER_REVIEW"
    assert overall_progress([_round("SCHEDULED", date="2026-01-01")], True)["stage"] == "AWAITING_UPDATE"
    assert overall_progress([_round("CANCELLED")], True)["stage"] == "NOT_SCHEDULED"
