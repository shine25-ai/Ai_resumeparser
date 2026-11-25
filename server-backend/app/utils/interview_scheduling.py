"""
Pure scheduling helpers for interviews: timezone-aware time ranges, conflict detection and iCalendar (.ics) invites.

No database or network access here, so every rule can be unit tested directly.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

ICS_DATETIME_FORMAT = "%Y%m%dT%H%M%SZ"


def to_utc_range(
    scheduled_date: str,
    scheduled_time: str,
    timezone_name: str,
    duration_minutes: int,
) -> Tuple[datetime, datetime]:
    """
    Convert a local wall-clock slot (YYYY-MM-DD, HH:MM in timezone_name) into an aware UTC [start, end) range.

    Raises ValueError for an unknown timezone, a malformed date/time, a non-positive duration,
    or a wall-clock time that does not exist in that zone (the spring-forward DST gap).
    """
    if duration_minutes <= 0:
        raise ValueError("duration_minutes must be positive")
    try:
        tz = ZoneInfo(timezone_name)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise ValueError(f"Unknown timezone: {timezone_name}") from exc

    try:
        naive = datetime.strptime(f"{scheduled_date} {scheduled_time}", "%Y-%m-%d %H:%M")
    except ValueError as exc:
        raise ValueError("scheduled_date must be YYYY-MM-DD and scheduled_time must be HH:MM") from exc

    local_start = naive.replace(tzinfo=tz)
    start_utc = local_start.astimezone(timezone.utc)
    # A wall-clock time inside a DST gap does not survive a round trip through UTC.
    if start_utc.astimezone(tz).replace(tzinfo=None) != naive:
        raise ValueError(f"{scheduled_date} {scheduled_time} does not exist in {timezone_name} (DST gap)")

    return start_utc, start_utc + timedelta(minutes=duration_minutes)


def ranges_overlap(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    """Half-open interval overlap. Back-to-back interviews (one ends exactly when the next starts) do not clash."""
    return a_start < b_end and b_start < a_end


def find_conflicts(
    start: datetime,
    end: datetime,
    busy_slots: Iterable[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Return the busy slots that overlap [start, end).

    Each busy slot is a dict with aware datetimes under "start" and "end", plus any identifying
    fields (for example "interview_id") that the caller wants echoed back to name the clash.
    """
    return [slot for slot in busy_slots if ranges_overlap(start, end, slot["start"], slot["end"])]


def _escape_ics_text(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
    )


def _fold_ics_line(line: str) -> str:
    """Fold lines longer than 75 octets as RFC 5545 requires (continuation lines start with a space)."""
    if len(line.encode("utf-8")) <= 75:
        return line
    parts: List[str] = []
    current = ""
    limit = 75
    for char in line:
        candidate = current + char
        if len(candidate.encode("utf-8")) > limit:
            parts.append(current)
            current = char
            limit = 74  # continuation lines carry a leading space
        else:
            current = candidate
    parts.append(current)
    return "\r\n ".join(parts)


def build_ics(
    *,
    uid: str,
    start_utc: datetime,
    end_utc: datetime,
    summary: str,
    description: str = "",
    location: str = "",
    organizer_email: Optional[str] = None,
    attendee_emails: Sequence[str] = (),
    sequence: int = 0,
    cancelled: bool = False,
    dtstamp: Optional[datetime] = None,
) -> str:
    """
    Build a single-event iCalendar document. Times are written in UTC so every mail client shows the right local time.

    Use cancelled=True for a cancellation update (METHOD:CANCEL, STATUS:CANCELLED). Increment sequence on every
    reschedule so calendar clients replace the old event instead of creating a duplicate.
    """
    if start_utc.tzinfo is None or end_utc.tzinfo is None:
        raise ValueError("start_utc and end_utc must be timezone-aware")
    if end_utc <= start_utc:
        raise ValueError("end_utc must be after start_utc")

    stamp = (dtstamp or datetime.now(timezone.utc)).astimezone(timezone.utc)

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//HireLogics//Interview Scheduling//EN",
        "CALSCALE:GREGORIAN",
        f"METHOD:{'CANCEL' if cancelled else 'REQUEST'}",
        "BEGIN:VEVENT",
        f"UID:{_escape_ics_text(uid)}",
        f"DTSTAMP:{stamp.strftime(ICS_DATETIME_FORMAT)}",
        f"DTSTART:{start_utc.astimezone(timezone.utc).strftime(ICS_DATETIME_FORMAT)}",
        f"DTEND:{end_utc.astimezone(timezone.utc).strftime(ICS_DATETIME_FORMAT)}",
        f"SUMMARY:{_escape_ics_text(summary)}",
        f"SEQUENCE:{sequence}",
        f"STATUS:{'CANCELLED' if cancelled else 'CONFIRMED'}",
    ]
    if description:
        lines.append(f"DESCRIPTION:{_escape_ics_text(description)}")
    if location:
        lines.append(f"LOCATION:{_escape_ics_text(location)}")
    if organizer_email:
        lines.append(f"ORGANIZER:mailto:{organizer_email}")
    for email in attendee_emails:
        lines.append(f"ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:{email}")
    lines += ["END:VEVENT", "END:VCALENDAR"]

    return "\r\n".join(_fold_ics_line(line) for line in lines) + "\r\n"
