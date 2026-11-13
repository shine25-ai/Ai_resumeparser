"""
Unit tests for applicant email verification in the job openings service.
Uses in-memory fakes, so no MongoDB is needed.
"""

from datetime import timedelta
from types import SimpleNamespace

import jwt
import pytest

from app.core.config import settings
from app.core.exceptions import AuthenticationError, BadRequestError
from app.services import job_opening_service as jos
from app.services.job_opening_service import JobOpeningService
from app.utils.helpers import utc_now


class FakeVerificationRepo:
    def __init__(self):
        self.docs = {}

    async def get_by_id(self, id_val):
        doc = self.docs.get(id_val)
        return dict(doc) if doc else None

    async def save_code(self, email, data):
        self.docs[email] = {**data, "id": email}

    async def update(self, id_val, update_data):
        self.docs[id_val].update(update_data)
        return dict(self.docs[id_val])

    async def delete(self, id_val):
        return self.docs.pop(id_val, None) is not None


@pytest.fixture
def service(monkeypatch):
    svc = JobOpeningService.__new__(JobOpeningService)
    svc.verification_repo = FakeVerificationRepo()
    svc.settings_repo = SimpleNamespace()

    async def _config():
        return SimpleNamespace(smtp_password="x", sender_name="HR", sender_email="hr@example.com")

    svc.settings_repo.get_email_config = _config

    sent = {}

    def _fake_send(config, to_email, code):
        sent["to"] = to_email
        sent["code"] = code

    monkeypatch.setattr(JobOpeningService, "_send_code_email", staticmethod(_fake_send))
    svc._sent = sent
    return svc


@pytest.mark.asyncio
async def test_request_then_confirm_issues_applicant_token(service):
    await service.request_code("  Candidate@Example.com ")
    assert service._sent["to"] == "candidate@example.com"
    code = service._sent["code"]
    assert len(code) == 6 and code.isdigit()

    result = await service.confirm_code("candidate@example.com", code)
    claims = jwt.decode(result["applicant_token"], settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    assert claims["type"] == "applicant"
    assert claims["sub"] == "candidate@example.com"
    # The code is single use.
    assert "candidate@example.com" not in service.verification_repo.docs


@pytest.mark.asyncio
async def test_resend_inside_cooldown_is_rejected(service):
    await service.request_code("a@example.com")
    with pytest.raises(BadRequestError):
        await service.request_code("a@example.com")


@pytest.mark.asyncio
async def test_wrong_code_counts_attempts_and_locks(service):
    await service.request_code("b@example.com")
    right = service._sent["code"]
    wrong = "000000" if right != "000000" else "111111"
    for _ in range(jos.CODE_MAX_ATTEMPTS):
        with pytest.raises(BadRequestError):
            await service.confirm_code("b@example.com", wrong)
    # After the limit, even the right code is refused.
    with pytest.raises(BadRequestError):
        await service.confirm_code("b@example.com", right)


@pytest.mark.asyncio
async def test_expired_code_is_rejected(service):
    await service.request_code("c@example.com")
    record = service.verification_repo.docs["c@example.com"]
    record["expires_at"] = (utc_now() - timedelta(seconds=1)).isoformat()
    with pytest.raises(BadRequestError):
        await service.confirm_code("c@example.com", service._sent["code"])


def test_invalid_email_is_rejected():
    with pytest.raises(BadRequestError):
        JobOpeningService._normalize_email("not-an-email")


def test_staff_token_cannot_be_used_as_applicant_token():
    staff_token = jwt.encode(
        {"sub": "u1", "type": "access", "exp": utc_now() + timedelta(minutes=5)},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    with pytest.raises(AuthenticationError):
        JobOpeningService._email_from_token(staff_token)


# ── Role detail sections ─────────────────────────────────────────────────────

def test_clean_lines_trims_drops_blanks_bullets_and_repeats():
    assert jos.clean_lines(["  - Write tests ", "", "• Review code", "write tests", "  "]) == ["Write tests", "Review code"]
    assert jos.clean_lines(None) == []


class FakeOpeningRepo:
    def __init__(self):
        self.docs = {}

    async def create(self, data):
        self.docs[data["id"]] = dict(data)
        return dict(data)

    async def get_by_id(self, id_val):
        doc = self.docs.get(id_val)
        return dict(doc) if doc else None

    async def update(self, id_val, changes):
        self.docs[id_val].update(changes)
        return dict(self.docs[id_val])

    async def find_many(self, query=None, **_):
        return [dict(d) for d in self.docs.values() if d["status"] == "OPEN" and d["open_positions"] > 0]


class FakeApplicationRepo:
    async def count_by_opening(self):
        return {}


@pytest.fixture
def opening_service():
    svc = JobOpeningService.__new__(JobOpeningService)
    svc.opening_repo = FakeOpeningRepo()
    svc.application_repo = FakeApplicationRepo()
    svc.company_repo = None  # roles without a company belong to the default company
    return svc


@pytest.mark.asyncio
async def test_sections_are_saved_cleaned_and_listed_publicly(opening_service):
    created = await opening_service.create_opening({
        "title": "Fullstack Developer",
        "responsibilities": ["Build features", " ", "build features"],
        "required_skills": ["React", "Python"],
        "qualifications": ["Degree in CS"],
        "preferred_skills": [],
    })
    assert created["responsibilities"] == ["Build features"]

    updated = await opening_service.update_opening(created["id"], {"preferred_skills": ["- Docker", "CI/CD"]})
    assert updated["preferred_skills"] == ["Docker", "CI/CD"]
    assert updated["required_skills"] == ["React", "Python"]  # untouched fields stay

    public = await opening_service.list_public_openings()
    assert public[0]["required_skills"] == ["React", "Python"]
    assert public[0]["preferred_skills"] == ["Docker", "CI/CD"]


@pytest.mark.asyncio
async def test_older_roles_without_sections_list_empty_sections(opening_service):
    opening_service.opening_repo.docs["old"] = {"id": "old", "title": "QA", "status": "OPEN", "open_positions": 1}
    public = await opening_service.list_public_openings()
    assert public[0]["responsibilities"] == [] and public[0]["qualifications"] == []


# ── Careers page text ────────────────────────────────────────────────────────

class FakePageSettingsRepo:
    def __init__(self):
        self.doc = {}

    async def get_settings(self, company_id="default"):
        return dict(self.doc)

    async def save_settings(self, data, company_id="default"):
        self.doc.update(data)


@pytest.mark.asyncio
async def test_page_settings_default_then_override_and_blank_restores_default():
    from app.models.job_opening import CAREERS_PAGE_DEFAULTS

    svc = JobOpeningService.__new__(JobOpeningService)
    svc.page_settings_repo = FakePageSettingsRepo()
    svc.company_repo = None

    assert await svc.get_page_settings() == CAREERS_PAGE_DEFAULTS

    updated = await svc.update_page_settings({"hero_title": "  Join us  ", "unknown_key": "ignored"})
    assert updated["hero_title"] == "Join us"
    assert "unknown_key" not in updated

    restored = await svc.update_page_settings({"hero_title": ""})
    assert restored["hero_title"] == CAREERS_PAGE_DEFAULTS["hero_title"]


# ── Applying: how they heard about the role ─────────────────────────────────

def _applicant_token(email="asha@example.com"):
    now = utc_now()
    return jwt.encode(
        {"sub": email, "type": "applicant", "iat": now, "exp": now + timedelta(minutes=30)},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )


class FakeResumeCollection:
    def __init__(self):
        self.calls = []

    async def update_one(self, query, update):
        self.calls.append((query, update))


class FakeApplyRepos:
    """Application and resume stores for apply()."""

    def __init__(self):
        self.applications = []
        self.resume_updates = {}
        self.resumes = FakeResumeCollection()
        self.db = {"resumes": self.resumes}

    async def find_one(self, query):
        return next((a for a in self.applications if all(a.get(k) == v for k, v in query.items())), None)

    async def create(self, data):
        self.applications.append(dict(data))
        return data

    async def update(self, id_val, changes):
        self.resume_updates.setdefault(id_val, {}).update(changes)
        return changes


@pytest.fixture
def apply_service():
    svc = JobOpeningService.__new__(JobOpeningService)
    svc.opening_repo = FakeOpeningRepo()
    svc.opening_repo.docs["job1"] = {"id": "job1", "title": "QA Engineer", "status": "OPEN", "open_positions": 1}
    repos = FakeApplyRepos()
    svc.application_repo = repos
    svc.resume_repo = repos
    svc.company_repo = None

    async def _upload(**_):
        return SimpleNamespace(id="resume1")

    svc.resume_service = SimpleNamespace(upload_and_process_resume=_upload)
    svc._repos = repos
    return svc


@pytest.mark.asyncio
async def test_apply_saves_how_they_heard_and_note_on_application_and_resume(apply_service):
    await apply_service.apply(
        "job1", _applicant_token(), file=None, background_tasks=None,
        heard_from="  LinkedIn ", note=" Notice period: 30 days ",
    )
    application = apply_service._repos.applications[0]
    assert application["heard_from"] == "LinkedIn"
    assert application["note"] == "Notice period: 30 days"
    resume = apply_service._repos.resume_updates["resume1"]
    assert resume["applicant_heard_from"] == "LinkedIn"
    assert resume["applicant_note"] == "Notice period: 30 days"


@pytest.mark.asyncio
async def test_apply_without_answers_stores_nothing_for_them(apply_service):
    await apply_service.apply("job1", _applicant_token(), file=None, background_tasks=None, note="   ")
    application = apply_service._repos.applications[0]
    assert application["heard_from"] is None and application["note"] is None


@pytest.mark.asyncio
async def test_apply_records_company_and_role_on_resume_and_application(apply_service):
    result = await apply_service.apply("job1", _applicant_token(), file=None, background_tasks=None)
    application = apply_service._repos.applications[0]
    assert application["company_id"] == "default" and application["company_name"] == "Shinelogics"
    query, update = apply_service._repos.resumes.calls[0]
    assert query == {"id": "resume1"}
    assert update["$set"]["company_name"] == "Shinelogics"
    assert update["$set"]["job_title"] == "QA Engineer"
    assert update["$addToSet"] == {"company_ids": "default"}
    assert update["$push"]["applied_jobs"]["job_id"] == "job1"
    assert result["company_name"] == "Shinelogics"
