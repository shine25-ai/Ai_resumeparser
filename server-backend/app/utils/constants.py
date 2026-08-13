"""
Application constants for file limits, MIME types, error strings, and collection names.
"""

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB limit
ALLOWED_MIME_TYPES = {
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
}

ALLOWED_EXTENSIONS = {"pdf", "doc", "docx"}

USERS_COLLECTION = "users"
ROLES_COLLECTION = "roles"
RESUMES_COLLECTION = "resumes"
RESUME_LOGS_COLLECTION = "resume_logs"
INTERVIEWS_COLLECTION = "interviews"
SKILLS_EVALUATION_COLLECTION = "skills_evaluations"

ERROR_USER_EXISTS = "User with this email already exists."
ERROR_INVALID_CREDENTIALS = "Invalid email or password."
ERROR_USER_NOT_FOUND = "User not found."
ERROR_ROLE_NOT_FOUND = "Role not found."
ERROR_RESUME_NOT_FOUND = "Resume not found."
ERROR_INTERVIEW_NOT_FOUND = "Interview not found."
ERROR_SKILLS_EVALUATION_NOT_FOUND = "Skills evaluation template not found."
ERROR_UNAUTHORIZED = "Authentication token invalid or expired."
ERROR_FORBIDDEN = "Insufficient privileges for this action."
ERROR_FILE_TOO_LARGE = "File size exceeds maximum limit of 10 MB."
ERROR_INVALID_FILE_TYPE = "Unsupported file format. Only PDF, DOC, and DOCX are allowed."
ERROR_EMPTY_FILE = "Uploaded file is empty."
