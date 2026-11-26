"""
Calendar invite emails (Phase 8): recipients, .ics method and content, history, and mail failures.
Uses in-memory repositories and a captured SMTP delivery, so no mail server is needed.
"""

from types import SimpleNamespace

import pytest

from app.services import interview_invites as invites
from app.services.interview_invites import (
    KIND_CANCEL,
    KIND_INVITE,
    KIND_RESCHEDULE,
    InterviewInviteService,
    invite_recipients,
)
from tests.test_phase8_interviews import FakeRepo, _interview


class FakeSettings:
    def __init__(self, configured=True):
        self.configured = configured

    async def get_email_config(self):
        if not self.configured:
            return None
        return SimpleNamespace(
            smtp_server="smtp.test", smtp_port=587, smtp_username="u", smtp_password="enc",
            sender_name="HR", sender_email="hr@example.com", use_tls=False, use_ssl=False,
        )


@pytest.fixture
def delivered(monkeypatch):
    """Replace the SMTP send with a capture list; also stub the company branding lookup."""
    sent = []

    def fake_deliver(config, msg):
        sent.append(msg)

    async def fake_context(db, company_id=None):
        return {"company_name": "Acme", "app_name": "HireLogics", "primary": "#1c7975", "accent": "#3b82f6",
                "logo_url": "", "from_name": "", "reply_to": "", "footer_text": ""}

    monkeypatch.setattr(invites, "_deliver", fake_deliver)
    monkeypatch.setattr(invites, "email_context", fake_context)
    monkeypatch.setattr(invites, "decrypt_password", lambda value: "pw")
    return sent


def _service(interviews=None, configured=True):
    repo = FakeRepo(interviews or [_interview()])
    return InterviewInviteService(db=None, interviews_repo=repo, settings_repo=FakeSettings(configured)), repo


def _calendar_text(msg):
    for part in msg.walk():
        if part.get_content_type() == "text/calendar":
            return part.get_payload(decode=True).decode("utf-8") if part.get_payload(decode=True) else part.get_content()
    raise AssertionError("no calendar part")


def test_recipients_include_candidate_and_every_interviewer_without_duplicates():
    interview = _interview()
    interview["interviewers"].append({"interviewer_email": "ALICE@example.com"})  # same person as the primary
    emails = invite_recipients(interview)
    assert emails[0] == "dev@example.com"
    assert sorted(e.lower() for e in emails) == sorted(
        ["dev@example.com", "alice@example.com", "bob@example.com", "carol@example.com"]
    )


@pytest.mark.asyncio
async def test_invite_sends_one_branded_email_with_ics_attached(delivered):
    service, _ = _service()
    result = await service.send("iv-1", KIND_INVITE)

    assert result["sent"] is True
    assert len(delivered) == 1
    msg = delivered[0]
    assert msg["Subject"].startswith("Interview invitation: Dev")
    assert "dev@example.com" in msg["To"] and "bob@example.com" in msg["To"]
    ics = _calendar_text(msg)
    assert "METHOD:REQUEST" in ics
    assert "DTSTART:20261201T043000Z" in ics
    assert "UID:iv-1@hirelogics" in ics
    attachments = [p.get_filename() for p in msg.iter_attachments()]
    assert "interview.ics" in attachments


@pytest.mark.asyncio
async def test_reschedule_bumps_sequence_so_calendars_replace_the_event(delivered):
    interview = _interview(reschedule_history=[{"previous_date": "2026-11-30"}])
    service, _ = _service([interview])
    await service.send("iv-1", KIND_RESCHEDULE)
    ics = _calendar_text(delivered[0])
    assert "SEQUENCE:1" in ics
    assert delivered[0]["Subject"].startswith("Interview rescheduled")


@pytest.mark.asyncio
async def test_cancellation_sends_cancel_method_with_reason(delivered):
    service, _ = _service()
    await service.send("iv-1", KIND_CANCEL, reason="Candidate withdrew")
    msg = delivered[0]
    assert "METHOD:CANCEL" in _calendar_text(msg)
    assert "STATUS:CANCELLED" in _calendar_text(msg)
    assert msg["Subject"].startswith("Interview cancelled")
    html_part = msg.get_body(preferencelist=("html",)).get_content()
    assert "Candidate withdrew" in html_part


@pytest.mark.asyncio
async def test_successful_send_is_recorded_on_the_interview(delivered):
    service, repo = _service()
    await service.send("iv-1", KIND_INVITE)
    stored = repo.docs["iv-1"]
    assert stored["email_sent_count"] == 1
    assert stored["email_sent_history"][-1]["type"] == KIND_INVITE
    assert stored["last_email_sent_at"]


@pytest.mark.asyncio
async def test_smtp_failure_is_reported_not_raised_and_not_recorded(monkeypatch, delivered):
    def broken(config, msg):
        raise ConnectionError("smtp is down")

    monkeypatch.setattr(invites, "_deliver", broken)
    service, repo = _service()
    result = await service.send("iv-1", KIND_INVITE)
    assert result["sent"] is False
    assert "smtp is down" in result["reason"]
    assert repo.docs["iv-1"].get("email_sent_count", 0) == 0


@pytest.mark.asyncio
async def test_unconfigured_email_or_missing_recipients_are_skipped(delivered):
    service, _ = _service(configured=False)
    assert (await service.send("iv-1", KIND_INVITE))["reason"] == "email is not configured"

    no_emails = _interview(candidate_email=None, interviewer_email=None, interviewers=[])
    service2, _ = _service([no_emails])
    assert (await service2.send("iv-1", KIND_INVITE))["reason"] == "no recipient email addresses"
    assert delivered == []
