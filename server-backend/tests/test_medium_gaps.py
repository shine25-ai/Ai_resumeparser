"""Tests for gaps G11 (duplicates), G12 (whole-word skill search) and G13 (search text from the parser).
The MongoDB tests use a throwaway database on localhost and are skipped when MongoDB isn't running."""

import asyncio
import io
import json
import os
import uuid
from unittest import mock

import httpx
import pytest
from motor.motor_asyncio import AsyncIOMotorClient
from starlette.datastructures import Headers, UploadFile

from app.core.config import settings
from app.core.exceptions import ConflictError
from app.repositories.resume_repository import ResumeRepository, skill_regex, phone_digits
from app.services.resume_service import ResumeService
from app.utils.enums import ResumeStatus

MONGO_URL = os.getenv("TEST_MONGO_URL", "mongodb://localhost:27017")


# ---------------------------------------------------------------- G12 skill matching (no database)

@pytest.mark.parametrize("query,text,matches", [
    ("Java", "JavaScript", False), ("Java", "Java 8", True), ("C", "C++", False), ("C", "C#", False),
    ("C", "C", True), ("Node", "Node.js", True), ("JS", "JavaScript", True), ("JS", "Node.js", False), (".NET", ".NET Core", True), ("golang", "Go", True),
    ("Go", "Google Ads", False), ("reactjs", "React", True), ("C++", "C++", True), ("Payroll", "Payroll", True),
])
def test_skill_regex(query, text, matches):
    assert bool(skill_regex(query).search(text)) is matches


def test_phone_digits():
    assert phone_digits("+91 98450 12345") == phone_digits("+919845012345") == phone_digits("09845012345") == "9845012345"


# ---------------------------------------------------------------- helpers for MongoDB tests

def with_repo(test):
    """Run `test(repo)` against an empty throwaway database, then drop it."""
    async def run():
        client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=1500)
        try:
            await client.admin.command("ping")
        except Exception:
            pytest.skip("MongoDB is not running on localhost")
        name = f"gap_tests_{uuid.uuid4().hex[:8]}"
        try:
            return await test(ResumeRepository(client[name]))
        finally:
            await client.drop_database(name)
            client.close()
    return asyncio.run(run())


def resume(**kw):
    doc = {"id": uuid.uuid4().hex, "status": "PARSED", "redirect_id": None, "parsed_data": {}}
    doc.update(kw)
    return doc


# ---------------------------------------------------------------- G12 skill search in MongoDB

def test_skill_search_whole_word_in_mongodb():
    async def t(repo):
        await repo.create(resume(id="js", parsed_data={"primary_skills": ["JavaScript", "React"]}))
        await repo.create(resume(id="java", parsed_data={"programming_languages": ["Java 8"]}))
        await repo.create(resume(id="cpp", parsed_data={"programming_languages": ["C++"]}))
        await repo.create(resume(id="go", parsed_data={"programming_languages": ["Go"]}))
        await repo.create(resume(id="hr", parsed_data={"functional_skills": ["Payroll"]}))

        async def ids(*skills):
            return sorted(r["id"] for r in (await repo.filter_resumes(skills=list(skills), is_admin=True))["resumes"])
        assert await ids("Java") == ["java"]
        assert await ids("JS") == ["js"]
        assert await ids("golang") == ["go"]
        assert await ids("C") == []
        assert await ids("Payroll") == ["hr"]
    with_repo(t)


# ---------------------------------------------------------------- G11 duplicate lookups

def test_file_hash_lookup_ignores_failed_uploads():
    async def t(repo):
        await repo.create(resume(id="failed", file_hash="abc", status=ResumeStatus.FAILED.value))
        assert await repo.find_by_file_hash("abc") is None
        await repo.create(resume(id="ok", file_hash="abc"))
        assert (await repo.find_by_file_hash("abc"))["id"] == "ok"
    with_repo(t)


def test_name_and_phone_lookup():
    async def t(repo):
        await repo.create(resume(id="old", parsed_data={"full_name": "Lakshmi  Prasad", "phone": "+91 94440 11223",
                                                         "email": "lakshmi.p@oldcompany.com"}))
        assert (await repo.find_by_name_and_phone("lakshmi prasad", "+919444011223"))["id"] == "old"
        assert await repo.find_by_name_and_phone("Lakshmi Prasad", "+919444099999") is None
        assert await repo.find_by_name_and_phone("Lakshmi Prasad", "+919444011223", exclude_resume_id="old") is None
        assert await repo.find_by_name_and_phone("Lakshmi Prasad", "") is None
    with_repo(t)


class _FakeS3:
    def upload_file(self, *a, **k):
        return "s3://test"


class _FakeLogRepo:
    def __init__(self):
        self.logs = []

    async def create(self, doc):
        self.logs.append(doc)
        return doc


def test_same_file_twice_is_rejected_without_parsing():
    async def t(repo):
        await repo.create(resume(id="first", candidate_id="CND0007", file_hash=__import__("hashlib").sha256(b"%PDF same").hexdigest(),
                                 parsed_data={"full_name": "Ravi Kumar"}))
        service = ResumeService(repo, s3_service=_FakeS3(), resume_log_repo=_FakeLogRepo())
        upload = UploadFile(io.BytesIO(b"%PDF same"), filename="ravi.pdf", headers=Headers({"content-type": "application/pdf"}))
        tasks = mock.Mock()
        with pytest.raises(ConflictError) as err:
            await service.upload_and_process_resume("user-1", upload, tasks)
        assert "CND0007" in err.value.message and err.value.errors[0]["existing_resume_id"] == "first"
        tasks.add_task.assert_not_called()
        assert await repo.count(query={}) == 1
    with_repo(t)


async def parse_with_fake_parser(repo, parsed, resume_text="TEXT FROM PARSER", resume_id="new"):
    """Run the background parsing step for `resume_id` against a fake parser that returns `parsed`."""
    def handler(request):
        if request.method == "POST":
            return httpx.Response(200, json={"job_id": 1, "status": "queued"})
        return httpx.Response(200, json={"status": "completed", "parsed_resume": parsed,
                                         "evaluation": {"ai_technical_score": 60}, "resume_text": resume_text})
    real = httpx.AsyncClient
    service = ResumeService(repo, s3_service=_FakeS3(), resume_log_repo=_FakeLogRepo())
    service.PARSER_POLL_INTERVAL_SECONDS = 0.001
    path = os.path.join(service.upload_dir, f"test_{uuid.uuid4().hex}.pdf")
    with open(path, "wb") as f:
        f.write(b"%PDF")
    try:
        with mock.patch.object(httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw)), \
             mock.patch("app.repositories.settings_repository.SettingsRepository.__init__", lambda self: None), \
             mock.patch("app.repositories.settings_repository.SettingsRepository.get_ai_config", mock.AsyncMock(return_value=None)):
            await service._process_ai_parsing_async(resume_id=resume_id, user_id="user-1", file_path=path,
                                                    original_filename="r.pdf", content_type="application/pdf")
    finally:
        os.remove(path)
    return service


def test_same_person_new_email_updates_existing_profile():
    async def t(repo):
        await repo.create(resume(id="old", parsed_data={"full_name": "Lakshmi Prasad", "phone": "9444011223",
                                                         "email": "lakshmi.p@oldcompany.com"}))
        await repo.create(resume(id="new", status="PENDING", extracted_text="quick text"))
        service = await parse_with_fake_parser(
            repo, {"full_name": "Lakshmi Prasad", "phone": "+919444011223", "email": "lakshmi.prasad@gmail.com"})
        assert await repo.get_by_id("new") is None                     # temporary upload removed
        old = await repo.get_by_id("old")
        assert old["parsed_data"]["email"] == "lakshmi.prasad@gmail.com"
        assert old["extracted_text"] == "TEXT FROM PARSER"
        assert "same name and phone" in old["hr_updates"][-1]["comment"]
        assert service.resume_log_repo.logs[0]["action"] == "AUTOMATIC_NAME_PHONE_UPDATE"
    with_repo(t)


def test_different_person_same_name_is_not_merged():
    async def t(repo):
        await repo.create(resume(id="old", parsed_data={"full_name": "Ravi Kumar", "phone": "9000000001", "email": "a@x.com"}))
        await repo.create(resume(id="new", status="PENDING"))
        await parse_with_fake_parser(repo, {"full_name": "Ravi Kumar", "phone": "9000000002", "email": "b@x.com"})
        assert (await repo.get_by_id("new"))["status"] == "PARSED"
        assert (await repo.get_by_id("old"))["parsed_data"]["email"] == "a@x.com"
    with_repo(t)


def test_search_text_comes_from_parser():
    async def t(repo):
        await repo.create(resume(id="new", status="PENDING", extracted_text="Air\ufb02ow"))
        await parse_with_fake_parser(repo, {"full_name": "New Person", "phone": "", "email": "new@example.com"},
                                     resume_text="Airflow, header line included")
        doc = await repo.get_by_id("new")
        assert doc["status"] == "PARSED" and doc["extracted_text"] == "Airflow, header line included"
    with_repo(t)
