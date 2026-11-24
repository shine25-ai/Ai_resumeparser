"""
Calendar invite emails for interviews (Phase 8): invitation, reschedule and cancellation.

Each email is branded with the company's email settings and carries an .ics file, so Gmail and Outlook
add or update the event. The same UID is used for every message about one interview, and the SEQUENCE
goes up on each reschedule, so calendar clients replace the event instead of duplicating it.

Failures are logged and returned, never raised: a broken mail server must not undo a reschedule.
"""

import asyncio
import html as html_lib
import smtplib
from email.message import EmailMessage
from typing import Any, Dict, List, Optional

from loguru import logger
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.repositories.settings_repository import SettingsRepository
from app.services.evaluation_service import DEFAULT_TIMEZONE
from app.services.mailer import DEFAULT_CONTEXT, address, branded_html, email_context
from app.utils.encryption import decrypt_password
from app.utils.helpers import utc_now
from app.utils.interview_scheduling import build_ics, to_utc_range

KIND_INVITE = "INVITE"
KIND_RESCHEDULE = "RESCHEDULE"
KIND_CANCEL = "CANCEL"
KIND_REMINDER_24H = "REMINDER_24H"
KIND_REMINDER_1H = "REMINDER_1H"
REMINDER_KINDS = (KIND_REMINDER_24H, KIND_REMINDER_1H)
_HISTORY_LIMIT = 50


def _ics_method(kind: str) -> str:
    return "CANCEL" if kind == KIND_CANCEL else "REQUEST"


def invite_recipients(interview: Dict[str, Any]) -> List[str]:
    """Candidate plus every interviewer with an email, de-duplicated, in a stable order."""
    emails: List[str] = []
    if interview.get("candidate_email"):
        emails.append(interview["candidate_email"])
    if interview.get("interviewer_email"):
        emails.append(interview["interviewer_email"])
    for item in interview.get("interviewers") or []:
        if item.get("interviewer_email"):
            emails.append(item["interviewer_email"])
    seen = set()
    unique = []
    for email in emails:
        key = email.strip().lower()
        if key and key not in seen:
            seen.add(key)
            unique.append(email.strip())
    return unique


def _subject_and_heading(kind: str, interview: Dict[str, Any]) -> tuple:
    who = f"{interview.get('candidate_name', 'Candidate')} – {interview.get('job_title', '')}".strip(" –")
    if kind == KIND_RESCHEDULE:
        return f"Interview rescheduled: {who}", "Your interview has been rescheduled"
    if kind == KIND_CANCEL:
        return f"Interview cancelled: {who}", "This interview has been cancelled"
    if kind == KIND_REMINDER_24H:
        return f"Reminder: interview tomorrow – {who}", "Your interview is in about 24 hours"
    if kind == KIND_REMINDER_1H:
        return f"Reminder: interview in 1 hour – {who}", "Your interview starts in about 1 hour"
    return f"Interview invitation: {who}", "You are invited to an interview"


def _body_html(kind: str, interview: Dict[str, Any], heading: str, reason: Optional[str]) -> str:
    esc = html_lib.escape
    rows = [
        ("Candidate", interview.get("candidate_name", "")),
        ("Position", interview.get("job_title", "")),
        ("Round", f"Round {interview.get('round_number', 1)}"),
        ("Date", interview.get("scheduled_date", "")),
        ("Time", f"{interview.get('scheduled_time', '')} ({interview.get('timezone') or DEFAULT_TIMEZONE})"),
        ("Duration", f"{interview.get('duration_minutes') or 60} minutes"),
    ]
    if interview.get("meeting_link"):
        rows.append(("Meeting link", interview["meeting_link"]))
    elif interview.get("location"):
        rows.append(("Location", interview["location"]))
    table = "".join(
        f'<tr><td style="padding:4px 12px 4px 0;color:#64748b;">{esc(label)}</td>'
        f'<td style="padding:4px 0;font-weight:600;">{esc(str(value))}</td></tr>'
        for label, value in rows
    )
    intro = f"<p>Hello,</p><p>{esc(heading)}. The details are below.</p>"
    if kind == KIND_CANCEL:
        intro = f"<p>Hello,</p><p>{esc(heading)}. Please remove it from your calendar.</p>"
    reason_html = f"<p><b>Reason:</b> {esc(reason)}</p>" if reason else ""
    return f'{intro}<table style="border-collapse:collapse;">{table}</table>{reason_html}<p>The calendar invite is attached.</p>'


def _deliver(config: Any, msg: EmailMessage) -> None:
    """Blocking SMTP send. Run in a worker thread."""
    password = decrypt_password(config.smtp_password)
    if config.use_ssl:
        server = smtplib.SMTP_SSL(config.smtp_server, config.smtp_port, timeout=30)
    else:
        server = smtplib.SMTP(config.smtp_server, config.smtp_port, timeout=30)
        if config.use_tls:
            server.starttls()
    try:
        server.login(config.smtp_username, password)
        server.send_message(msg)
    finally:
        server.quit()


class InterviewInviteService:
    def __init__(self, db: AsyncIOMotorDatabase, interviews_repo, settings_repo: Optional[SettingsRepository] = None):
        self.db = db
        self.interviews = interviews_repo
        self.settings_repo = settings_repo or SettingsRepository()

    async def send(self, interview_id: str, kind: str, reason: Optional[str] = None) -> Dict[str, Any]:
        """Send one invite, reschedule or cancellation. Returns a result dict; never raises for mail failures."""
        interview = await self.interviews.get_by_id(interview_id)
        if not interview:
            return {"sent": False, "reason": "interview not found"}

        recipients = invite_recipients(interview)
        if not recipients:
            return {"sent": False, "reason": "no recipient email addresses"}

        config = await self.settings_repo.get_email_config()
        if not config:
            return {"sent": False, "reason": "email is not configured"}

        try:
            start, end = to_utc_range(
                interview["scheduled_date"],
                interview["scheduled_time"],
                interview.get("timezone") or DEFAULT_TIMEZONE,
                int(interview.get("duration_minutes") or 60),
            )
        except (ValueError, KeyError) as exc:
            return {"sent": False, "reason": f"invalid schedule: {exc}"}

        ctx = await email_context(self.db)
        is_reminder = kind in REMINDER_KINDS
        ics = "" if is_reminder else build_ics(
            uid=f"{interview_id}@hirelogics",
            start_utc=start,
            end_utc=end,
            summary=f"Interview: {interview.get('candidate_name', 'Candidate')} – {interview.get('job_title', '')}",
            description=interview.get("notes") or "",
            location=interview.get("meeting_link") or interview.get("location") or "",
            organizer_email=config.sender_email,
            attendee_emails=recipients,
            sequence=len(interview.get("reschedule_history") or []),
            cancelled=kind == KIND_CANCEL,
            dtstamp=utc_now(),
        )

        subject, heading = _subject_and_heading(kind, interview)
        msg = EmailMessage()
        msg["Subject"] = subject
        address(msg, config, ctx or dict(DEFAULT_CONTEXT))
        msg["To"] = ", ".join(recipients)
        msg.set_content("Please open this email in an HTML-capable client to see the details.")
        msg.add_alternative(
            branded_html(ctx or dict(DEFAULT_CONTEXT), _body_html(kind, interview, heading, reason)),
            subtype="html",
        )
        if not is_reminder:
            # The calendar part lets Gmail and Outlook act on the invite directly; the attachment covers the rest.
            msg.add_alternative(ics, subtype="calendar", params={"method": _ics_method(kind)})
            msg.add_attachment(
                ics.encode("utf-8"),
                maintype="text",
                subtype="calendar",
                filename="interview.ics",
                params={"method": _ics_method(kind)},
            )

        try:
            await asyncio.to_thread(_deliver, config, msg)
        except Exception as exc:  # the caller's action has already succeeded; only the mail failed
            logger.warning(f"Interview {kind} email failed for {interview_id}: {exc}")
            return {"sent": False, "reason": str(exc)}

        now = utc_now().isoformat()
        history = list(interview.get("email_sent_history") or [])
        history.append({"type": kind, "to": recipients, "at": now})
        await self.interviews.update(interview_id, {
            "email_sent_count": int(interview.get("email_sent_count") or 0) + 1,
            "last_email_sent_at": now,
            "email_sent_history": history[-_HISTORY_LIMIT:],
        })
        return {"sent": True, "kind": kind, "to": recipients}
