"""Waiting on the AI parser (gap G05): queue time doesn't count against the processing timeout,
connection blips are tolerated, and parser errors come back with their message."""
import asyncio
from unittest import mock

import httpx
import pytest

from app.core.config import settings
from app.services.resume_service import ResumeService


def run_poll(statuses, poll_timeout=900, queue_timeout=3600):
    """Feed the poller a sequence of parser responses (dicts, or "down" for a connection error)."""
    seq = list(statuses)

    def handler(request):
        item = seq.pop(0) if len(seq) > 1 else seq[0]
        if item == "down":
            raise httpx.ConnectError("refused")
        return httpx.Response(200, json=item)

    real_client = httpx.AsyncClient
    service = ResumeService(resume_repo=object(), s3_service=object(), resume_log_repo=object())
    service.PARSER_POLL_INTERVAL_SECONDS = 0.001
    with mock.patch.object(httpx, "AsyncClient", lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw)), \
         mock.patch.object(settings, "AI_PARSER_POLL_TIMEOUT_SECONDS", poll_timeout), \
         mock.patch.object(settings, "AI_PARSER_QUEUE_TIMEOUT_SECONDS", queue_timeout):
        return asyncio.run(service._poll_parser_job("http://parser/api/status/1"))


DONE = {"status": "completed", "parsed_resume": {"full_name": "A"}, "evaluation": {"ai_technical_score": 50}}


def test_completed_job_returns_results():
    assert run_poll([{"status": "queued"}, {"status": "processing"}, DONE]) == ({"full_name": "A"}, {"ai_technical_score": 50}, "")


def test_connection_blips_are_tolerated():
    assert run_poll(["down", "down", {"status": "processing"}, "down", DONE])[0] == {"full_name": "A"}


def test_parser_down_for_good_fails():
    with pytest.raises(Exception, match="unreachable"):
        run_poll(["down"])


def test_parser_error_message_is_passed_on():
    with pytest.raises(Exception, match="scanned or image-only"):
        run_poll([{"status": "error", "evaluation": {"error": "No readable text found. This looks like a scanned or image-only resume"}}])


def test_long_queue_does_not_use_up_processing_time():
    # processing limit is tiny, but the job spends its time queued: still succeeds
    assert run_poll([{"status": "queued"}] * 30 + [{"status": "processing"}, DONE], poll_timeout=0.5)[0] == {"full_name": "A"}


def test_stuck_processing_times_out():
    with pytest.raises(Exception, match="did not finish"):
        run_poll([{"status": "processing"}], poll_timeout=0.05)


def test_queue_timeout():
    with pytest.raises(Exception, match="did not start"):
        run_poll([{"status": "queued"}], queue_timeout=0.05)
