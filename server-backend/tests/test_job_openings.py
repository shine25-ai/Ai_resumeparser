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
