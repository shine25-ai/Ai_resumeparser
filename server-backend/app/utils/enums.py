"""
Enum definitions for application roles, resume processing status, and allowed file formats.
"""

from enum import Enum


class UserRole(str, Enum):
    """User system roles."""
    ADMIN = "admin"
    USER = "user"


class ResumeStatus(str, Enum):
    """Resume extraction/processing lifecycle status."""
    PENDING = "PENDING"
    PARSED = "PARSED"
    FAILED = "FAILED"


class AllowedFileExtensions(str, Enum):
    """Supported file extensions for resume upload."""
    PDF = "pdf"
    DOC = "doc"
    DOCX = "docx"


class InterviewStatus(str, Enum):
    """Interview scheduling lifecycle status."""
    PENDING = "PENDING"
    SCHEDULED = "SCHEDULED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    RESCHEDULED = "RESCHEDULED"
    NO_SHOW = "NO_SHOW"


class InterviewType(str, Enum):
    """Interview round format / type."""
    TECHNICAL = "TECHNICAL"
    HR = "HR"
    MANAGERIAL = "MANAGERIAL"
    CULTURE_FIT = "CULTURE_FIT"
    FINAL_ROUND = "FINAL_ROUND"
    INITIAL_SCREENING = "INITIAL_SCREENING"
    CODING_TEST = "CODING_TEST"
    CLIENT_ROUND = "CLIENT_ROUND"
    SYSTEM_DESIGN = "SYSTEM_DESIGN"
    BEHAVIORAL = "BEHAVIORAL"
class InterviewRecommendation(str, Enum):
    """Interview recommendation status choices."""
    SELECTED = "Selected"
    REJECTED = "Rejected"
    ON_HOLD = "On Hold"
    SHORTLISTED = "Shortlisted"
    PENDING = "Pending"
    NEED_FURTHER_EVALUATION = "Need Further Evaluation"
    WITHDRAWN = "Withdrawn"
    NO_SHOW = "No Show"
    RESCHEDULE_REQUIRED = "Reschedule Required"
    RECOMMENDED = "Recommended"
    NOT_RECOMMENDED = "Not Recommended"
    OFFER_TO_BE_RELEASED = "Offer to Be Released"
    OFFER_ACCEPTED = "Offer Accepted"
    OFFER_REJECTED = "Offer Rejected"
