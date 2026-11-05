"""Backend before/after checks for gaps G06 (backend side), G11, G12 and G13.

Uploads corpus files through the backend's real upload + background-parsing code, with a fake AI parser
(answers from saved parser results) and a throwaway MongoDB database on localhost.

Usage: python backend_scenarios.py <server-backend dir> <eval_dir> <parsed_results_dir> <parser_texts.json> <out.json>
Run it with the backend's venv python. parser_texts.json maps file name -> the text the parser extracts
(make it with the parser's venv: extraction.extract_resume_text)."""
import asyncio, glob, hashlib, io, json, os, sys, uuid
from unittest import mock

BACKEND, E, PARSED_DIR, TEXTS, OUT = (os.path.abspath(a) for a in sys.argv[1:6])
sys.path.insert(0, BACKEND); os.chdir(BACKEND)

import httpx
from fastapi import BackgroundTasks
from motor.motor_asyncio import AsyncIOMotorClient
from starlette.datastructures import Headers, UploadFile
from app.repositories.resume_repository import ResumeRepository
from app.services.resume_service import ResumeService
PARSER_TEXT = json.load(open(TEXTS))

PARSED = {}
for fp in glob.glob(f"{PARSED_DIR}/a2_single_*_1.json"):
    rec = json.load(open(fp))
    PARSED[rec["file"]] = rec["parsed"] or {}


class FakeS3:
    def upload_file(self, *a, **k):
        return "s3://test"


def fake_parser(overrides):
    """Answers like the AI parser. `overrides[filename]` changes the parsed fields for one upload."""
    calls = []

    def handler(request):
        if request.method == "POST":
            body = request.read().decode("latin-1")
            name = next(f for f in PARSED if f in body or f.replace(".pdf", "_copy.pdf") in body)
            copy = "_copy.pdf" in body
            calls.append(name + (" (copy)" if copy else ""))
            return httpx.Response(200, json={"job_id": len(calls), "status": "queued", "_name": name, "_copy": copy})
        job = int(request.url.path.rsplit("/", 1)[-1]) - 1
        name = calls[job].replace(" (copy)", "")
        parsed = {**PARSED[name], **overrides.get(calls[job], {})}
        return httpx.Response(200, json={"status": "completed", "parsed_resume": parsed,
                                         "evaluation": {"ai_technical_score": 50}, "resume_text": PARSER_TEXT[name]})
    return handler, calls


async def upload(service, name, data=None, filename=None):
    data = data if data is not None else open(f"{E}/corpus/{name}", "rb").read()
    ctype = "application/pdf" if name.endswith(".pdf") else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    file = UploadFile(io.BytesIO(data), filename=filename or name, headers=Headers({"content-type": ctype}))
    tasks = BackgroundTasks()
    try:
        created = await service.upload_and_process_resume("user-1", file, tasks)
    except Exception as e:
        return {"rejected": f"{type(e).__name__}: {getattr(e, 'message', str(e))}"}
    await tasks()
    return {"resume_id": created.id, "status_at_upload": str(created.status)}


async def main():
    client = AsyncIOMotorClient("mongodb://localhost:27017", serverSelectionTimeoutMS=2000)
    db_name = f"gap_scenarios_{uuid.uuid4().hex[:8]}"
    repo = ResumeRepository(client[db_name])
    service = ResumeService(repo, s3_service=FakeS3())
    service.PARSER_POLL_INTERVAL_SECONDS = 0.001
    existing_uploads = set(os.listdir(service.upload_dir))
    overrides = {"R09_non_tech_hr.pdf (copy)": {"email": "lakshmi.prasad.hr@gmail.com"}}
    handler, calls = fake_parser(overrides)
    real = httpx.AsyncClient
    out = {}
    try:
        with mock.patch.object(httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw)), \
             mock.patch("app.repositories.settings_repository.SettingsRepository.__init__", lambda self: None), \
             mock.patch("app.repositories.settings_repository.SettingsRepository.get_ai_config", mock.AsyncMock(return_value=None)):
            # G11: same file twice; same person with a new email (a different file)
            out["R01 first upload"] = await upload(service, "R01_standard.pdf")
            out["R01 same file again"] = await upload(service, "R01_standard.pdf")
            out["R09 first upload"] = await upload(service, "R09_non_tech_hr.pdf")
            r09 = open(f"{E}/corpus/R09_non_tech_hr.pdf", "rb").read() + b"\n% updated resume"
            out["R09 updated resume, new email"] = await upload(service, "R09_non_tech_hr.pdf", r09, "R09_non_tech_hr_copy.pdf")
            # G13 + G06: other files
            for name in ["R02_two_column.pdf", "R04_docx_header_table.docx", "R05_scanned_image.pdf"]:
                out[f"{name[:3]} upload"] = await upload(service, name)

        docs = await repo.find_many(query={}, limit=100)
        out["profiles"] = sorted(f"{(d.get('parsed_data') or {}).get('full_name') or d['original_filename']} [{d['status']}]"
                                 + (f" error: {d['parse_error'][:150]}" if d.get("parse_error") else "") for d in docs)
        out["parser_jobs_sent"] = calls

        async def keyword(word):
            res = await repo.filter_resumes(keywords=[word], is_admin=True)
            return sorted((r.get("parsed_data") or {}).get("full_name") or r["original_filename"] for r in res["resumes"])
        out["keyword search"] = {w: await keyword(w) for w in ["Certified", "Snowflake", "Meera", "90031", "Suresh"]}

        # G12: whole-word skill search on a fixed set of profiles
        skill_db = ResumeRepository(client[db_name + "_skills"])
        for cid, skills in {"JavaScript dev": ["JavaScript", "React"], "Java dev": ["Java 8", "Spring Boot"],
                            "C++ dev": ["C++"], "C dev": ["C", "Embedded C"], "Go dev": ["Go"], "Node dev": ["Node.js"],
                            "HR manager": []}.items():
            await skill_db.create({"id": cid, "status": "PARSED", "redirect_id": None,
                                   "parsed_data": {"full_name": cid, "primary_skills": skills,
                                                   "functional_skills": ["Payroll"] if cid == "HR manager" else []}})

        async def skill(s):
            res = await skill_db.filter_resumes(skills=[s], is_admin=True)
            return sorted(r["id"] for r in res["resumes"])
        out["skill search"] = {s: await skill(s) for s in ["Java", "C", "JS", "golang", "Node", "Payroll"]}
    finally:
        await client.drop_database(db_name)
        await client.drop_database(db_name + "_skills")
        client.close()
        for name in set(os.listdir(service.upload_dir)) - existing_uploads:
            os.remove(os.path.join(service.upload_dir, name))
    json.dump(out, open(OUT, "w"), indent=1)
    print(json.dumps(out, indent=1))

asyncio.run(main())
