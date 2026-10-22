# AI Resume Parser - Production FastAPI Backend

Production-ready, highly scalable, and modular Python FastAPI backend for the AI Resume Parser platform built with clean MVC architecture, asynchronous MongoDB (Motor), JWT Authentication, PyMuPDF & python-docx file extraction, Loguru structured logging, and Docker support.

---

## Features

- **Clean MVC Architecture**: Strict separation of concerns (Routes → Controllers → Services → Repositories → MongoDB).
- **Asynchronous MongoDB Access**: High performance async MongoDB interactions using Motor driver.
- **Idempotent Default Admin Bootstrap**: Automatically creates default administrator user on FastAPI lifespan startup if not present.
- **JWT Authentication & RBAC**: Secure access & refresh tokens with Passlib bcrypt password hashing and Role-Based Access Control (Admin/User).
- **Resume File Processing**: Supports PDF, DOC, and DOCX text extraction using PyMuPDF (`fitz`) and `python-docx`.
- **Standardized API Responses**: Unified JSON envelopes for success and error handling across all endpoints.
- **Global Exception Handling**: Custom HTTP exceptions with centralized error response formatting.
- **Structured Logging**: Loguru setup for colored stdout output and file rotation (`logs/app.log`, `logs/error.log`).
- **Interactive Swagger Documentation**: OpenAPI 3.0 auto-generated docs at `/docs` and ReDoc at `/redoc`.
- **Docker Support**: Containerized setup with `Dockerfile` and `docker-compose.yml`.
- **Comprehensive Test Suite**: Async tests using Pytest and HTTPX.

---

## Directory Structure

```text
server-backend/
├── app/
│   ├── main.py                 # FastAPI application factory & router mounting
│   ├── core/
│   │   ├── config.py           # Settings management via Pydantic BaseSettings
│   │   ├── database.py         # Motor AsyncIOMotorClient setup
│   │   ├── bootstrap.py        # Idempotent default admin user bootstrap
│   │   ├── security.py         # Passlib bcrypt hashing & JWT token handling
│   │   ├── logging.py          # Loguru logger setup
│   │   ├── exceptions.py       # Custom exceptions & global error handlers
│   │   ├── dependencies.py     # FastAPI dependency injectors
│   │   └── lifespan.py         # Async lifespan context for DB & bootstrap
│   ├── models/
│   │   ├── user.py             # User document model
│   │   └── resume.py           # Resume document model
│   ├── schemas/
│   │   ├── common.py           # ApiResponse & ErrorResponse envelopes
│   │   ├── auth.py             # Login, Token & Refresh schemas
│   │   ├── user.py             # User DTOs & Change Password schemas
│   │   └── resume.py           # Resume DTOs & Extraction schemas
│   ├── controllers/
│   │   ├── auth_controller.py  # Auth request orchestrator
│   │   ├── user_controller.py  # User profile orchestrator
│   │   └── resume_controller.py# Resume upload & extraction orchestrator
│   ├── services/
│   │   ├── auth_service.py     # Auth business logic
│   │   ├── user_service.py     # User business logic
│   │   └── resume_service.py   # Resume processing & text extraction logic
│   ├── repositories/
│   │   ├── base_repository.py  # Generic MongoDB Async CRUD repository
│   │   ├── user_repository.py  # User queries
│   │   └── resume_repository.py# Resume queries
│   ├── routes/
│   │   ├── auth.py             # Auth endpoints (/api/v1/auth)
│   │   ├── users.py            # User endpoints (/api/v1/users)
│   │   ├── resume.py           # Resume endpoints (/api/v1/resumes)
│   │   └── health.py           # Health check endpoint (/health)
│   ├── middleware/
│   │   ├── auth.py             # Auth middleware helpers
│   │   └── request_logger.py   # Latency request logger middleware
│   └── utils/
│       ├── enums.py            # UserRole, ResumeStatus, AllowedExtensions
│       ├── constants.py        # Application constants
│       ├── helpers.py          # UUID & datetime utilities
│       ├── response.py         # Response envelope helpers
│       └── validators.py       # File extension & size validators
├── uploads/                    # Directory for uploaded resume files
├── logs/                       # Loguru log files
├── static/                     # Static assets directory
├── tests/                      # Pytest test suite
├── .env                        # Local environment variables
├── .env.example                # Environment variables template
├── .gitignore                  # Git ignore rules
├── requirements.txt            # Python package dependencies
├── Dockerfile                  # Multi-stage Docker image build file
├── docker-compose.yml          # Docker service configuration
└── README.md                   # Project documentation
```

---

## Technology Stack

- **Python**: 3.12+
- **Framework**: FastAPI
- **Database**: MongoDB & Motor (Async)
- **Validation**: Pydantic v2 & Pydantic Settings
- **Authentication**: PyJWT & Passlib (bcrypt)
- **Text Extraction**: PyMuPDF (`fitz`) & `python-docx`
- **Logging**: Loguru
- **Testing**: Pytest & HTTPX
- **Code Quality**: Ruff & Black

---

## Installation & Setup

### Prerequisites

- Python 3.12+
- MongoDB 7.0+ (running locally or via Docker)

### 1. Create Virtual Environment

```bash
# Navigate to server-backend directory
cd server-backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# Linux/macOS:
source venv/bin/activate
```

### 2. Install Dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 3. Environment Variables Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Ensure `.env` contains:

```env
APP_NAME="AI Resume Parser Backend"
APP_ENV="development"
DEBUG=True

HOST="0.0.0.0"
PORT=8000

DATABASE_URL="mongodb://localhost:27017"
DATABASE_NAME="ai_resume_parser_db"

SECRET_KEY="super-secret-key-change-in-production-ai-resume-parser-2026"
ALGORITHM="HS256"
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7

DEFAULT_ADMIN_NAME="Administrator"
DEFAULT_ADMIN_EMAIL="admin@example.com"
DEFAULT_ADMIN_PASSWORD="Admin@123"
DEFAULT_ADMIN_ROLE="admin"

UPLOAD_FOLDER="uploads"
OPENAI_API_KEY="sk-placeholder-api-key"
```

---

## Running Locally

1. **Start MongoDB Instance**:
   Make sure MongoDB is running locally on `localhost:27017`.

2. **Launch Application**:
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

3. **Verify API Health**:
   Navigate to `http://localhost:8000/health` in your browser.

---

## Running with Docker & Docker Compose

To run the complete stack (FastAPI + MongoDB) inside Docker:

```bash
# Build and launch containers
docker-compose up --build -d

# View logs
docker-compose logs -f

# Shutdown containers
docker-compose down
```

---

## Default Administrator Bootstrap

On application startup, the backend automatically executes `app/core/bootstrap.py`:

- Checks if default administrator (`admin@example.com`) exists in MongoDB.
- If missing, creates administrator account with bcrypt hashed password (`Admin@123`) and role `admin`.
- Operation is idempotent (safe to run on every startup).

---

## API Response Format

### Success Response Format (HTTP 200/201)

```json
{
    "success": true,
    "message": "Success",
    "data": {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "full_name": "Administrator",
        "email": "admin@example.com"
    }
}
```

### Failure Response Format (HTTP 400/401/403/404/422/500)

```json
{
    "success": false,
    "message": "Validation failed",
    "errors": [
        "body -> email: value is not a valid email address"
    ]
}
```

---

## Integration API (for other projects)

Other applications can upload resumes and read parsed profiles over REST using an API key
instead of a user login.

### Setup

API keys are managed in the app under **Settings → API Integration** (admins, or roles with the
Settings permission):

- **New API key**: create one key per application. The full key is shown only once; only a
  hash is stored.
- **Disable / Regenerate / Delete**: turn off one key, rotate it, or remove it.
- **Accept API requests**: the master switch. When off, every integration request returns `503`.
- **Usage**: request counts, success rate, uploads, average response time and a daily chart,
  filterable by key and period.
- **Request Logs**: every call with time, key, endpoint, result, error message, duration, client IP,
  and the uploaded candidate's current parsing status. Logs are deleted automatically after 90 days.

Every request sends the key in the `X-API-Key` header. Uploads are recorded as uploaded by
`API Integration (<key name>)`.

The admin endpoints behind this page are under `/api/v1/settings/integration`.

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/v1/integration/resumes` | Upload a resume (multipart `file`, optional `resume_source`, `resume_source_informer_name`). Returns `resume_id` and starts parsing in the background. |
| `GET` | `/api/v1/integration/resumes/{resume_id}/status` | Parsing status (`PENDING` / `PARSED` / `FAILED`) and interview status. |
| `GET` | `/api/v1/integration/resumes/{resume_id}` | Full profile: `parsed_data`, `ai_evaluation`, HR updates, interviews, resume URL. Add `?include_text=true` for the raw resume text. |
| `GET` | `/api/v1/integration/resumes/lookup?email=...` or `?candidate_id=CND0001` | Find a profile without knowing the `resume_id`. |

### Typical flow

```bash
# 1. Upload
curl -X POST http://localhost:8000/api/v1/integration/resumes \
  -H "X-API-Key: $KEY" \
  -F "file=@resume.pdf" -F "resume_source=Careers Site"
# -> {"data": {"resume_id": "...", "candidate_id": "CND0042", "parsing_status": "PENDING", "status_url": "...", "profile_url": "..."}}

# 2. Poll every ~5 seconds until parsing_status is PARSED or FAILED (usually under a minute)
curl -H "X-API-Key: $KEY" http://localhost:8000/api/v1/integration/resumes/<resume_id>/status

# 3. Fetch the parsed profile
curl -H "X-API-Key: $KEY" http://localhost:8000/api/v1/integration/resumes/<resume_id>
```

**Duplicate candidates:** if the parsed email matches an existing candidate, the upload is merged
into that existing profile. The original `resume_id` keeps working, but responses return the
existing profile's `resume_id` / `candidate_id` with `merged_into_existing_profile: true`.
Store the returned `resume_id` from the status response once parsing finishes.

Interactive docs for these endpoints are under the **Integration API** tag at `/docs`.

---

## API Documentation

Interactive Swagger API documentation is automatically accessible at:

- **Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc**: [http://localhost:8000/redoc](http://localhost:8000/redoc)

---

## Running Automated Tests

Run the Pytest suite:

```bash
pytest tests/ -v
```

---

## Production Deployment Checklist

1. Set `APP_ENV="production"` and `DEBUG=False` in `.env`.
2. Generate a secure 64-character random string for `SECRET_KEY`.
3. Change default admin credentials (`DEFAULT_ADMIN_PASSWORD`).
4. Configure production MongoDB connection URI with SSL/TLS enabled.
5. Use Gunicorn with Uvicorn workers (`gunicorn -w 4 -k uvicorn.workers.UvicornWorker app.main:app`).
