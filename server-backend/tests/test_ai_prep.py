"""AI interview questions, the video transcript and scores are saved with each round."""

import asyncio

import pytest

from app.core.exceptions import NotFoundError
from app.schemas.interview import InterviewAiPrepRequest
from app.services.interview_service import InterviewService


class FakeRepo:
    def __init__(self, docs):
        self.docs = {d["id"]: d for d in docs}
        self.updates = []

    async def get_by_id(self, id_val):
        return self.docs.get(id_val)

    async def update(self, id_val, fields):
        self.updates.append((id_val, fields))
        self.docs[id_val].update(fields)
        return self.docs[id_val]


QUESTIONS = {"technical": [{"question": "Why Spring Boot?", "expectedAnswer": "Auto-configuration"}], "behavioral": [], "domain": []}


def test_nothing_saved_yet_returns_empty():
    svc = InterviewService(FakeRepo([{"id": "r1", "status": "SCHEDULED"}]))
    data = asyncio.run(svc.get_ai_prep("r1"))
    assert data["questions"] is None and data["transcript"] is None and data["evaluations"] == {}


def test_save_writes_only_ai_prep_and_reads_back():
    repo = FakeRepo([{"id": "r1", "status": "COMPLETED", "rating": 5}])
    svc = InterviewService(repo)
    payload = InterviewAiPrepRequest(questions=QUESTIONS, transcript="I used Spring Boot...", evaluations={"technical-0": {"score": 8}})
    asyncio.run(svc.save_ai_prep("r1", payload, updated_by="u1"))

    assert len(repo.updates) == 1 and list(repo.updates[0][1].keys()) == ["ai_prep"]
    assert repo.docs["r1"]["status"] == "COMPLETED" and repo.docs["r1"]["rating"] == 5
    data = asyncio.run(svc.get_ai_prep("r1"))
    assert data["questions"] == QUESTIONS
    assert data["transcript"] == "I used Spring Boot..."
    assert data["evaluations"] == {"technical-0": {"score": 8}}
    assert data["updated_by"] == "u1" and data["updated_at"]


def test_unknown_interview_is_not_found():
    svc = InterviewService(FakeRepo([]))
    with pytest.raises(NotFoundError):
        asyncio.run(svc.get_ai_prep("missing"))
    with pytest.raises(NotFoundError):
        asyncio.run(svc.save_ai_prep("missing", InterviewAiPrepRequest()))
